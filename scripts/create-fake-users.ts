import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_PASSWORD = "ChangeMe123!";
const DEV_HOST_PATTERN = /(localhost|127\.0\.0\.1)/i;

const DEMO_APPLICANTS = [
  {
    email: "applicant.demo@uwcperu.org",
    fullName: "FERNANDEZ TORRES CARLOS ALBERTO",
    payload: {
      fullName: "FERNANDEZ TORRES CARLOS ALBERTO",
      dateOfBirth: "2009-06-15",
      nationality: "Peruana",
      schoolName: "Colegio Demo Lima",
      gradeAverage: 16.5,
      essay: "Este texto demo existe para facilitar pruebas de la etapa inicial del MVP.",
    },
  },
  {
    email: "applicant.demo2@uwcperu.org",
    fullName: "QUISPE MAMANI MARIA JOSE",
    payload: {
      fullName: "QUISPE MAMANI MARIA JOSE",
      dateOfBirth: "2009-03-02",
      nationality: "Peruana",
      schoolName: "Colegio Demo Sur",
      gradeAverage: 15.0,
      essay: "Segundo perfil demo para probar búsquedas, exportes y operaciones admin en desarrollo.",
    },
  },
  {
    email: "applicant.demo3@uwcperu.org",
    fullName: "RAMIREZ GUTIERREZ ANA SOFIA",
    payload: {
      fullName: "RAMIREZ GUTIERREZ ANA SOFIA",
      dateOfBirth: "2012-09-10",
      nationality: "Peruana",
      schoolName: "Colegio Demo Norte",
      gradeAverage: 12.0,
      essay: "Tercer perfil demo para probar el resultado no elegible en la rubrica automatica.",
    },
  },
] as const;

function assertDemoSeedingAllowed() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const nodeEnv = process.env.NODE_ENV?.trim() ?? "";
  const devBypassEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS === "true";
  const explicitOverride = process.env.ALLOW_DEMO_SEEDING === "true";
  const runningInTest = process.env.NODE_ENV === "test";
  const safeLocalContext = nodeEnv !== "production" && (appUrl.length === 0 || DEV_HOST_PATTERN.test(appUrl));

  if (explicitOverride || runningInTest || devBypassEnabled || safeLocalContext) {
    return;
  }

  throw new Error(
    "Demo seeding is blocked outside dev/test contexts. Set ALLOW_DEMO_SEEDING=true only if you intentionally need it.",
  );
}

async function getExistingUserByEmail(email: string) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw error;
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      return found;
    }

    if (data.users.length < 100) {
      return null;
    }

    page += 1;
  }
}

async function createOrLoadUser({
  email,
  fullName,
  role,
}: {
  email: string;
  fullName: string;
  role: "admin" | "applicant";
}) {
  const existingUser = await getExistingUserByEmail(email);

  const user =
    existingUser ??
    (
      await supabase.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { fullName, role },
      })
    ).data.user;

  if (!user) {
    throw new Error(`Could not create or load user ${email}`);
  }

  const { error: resetPasswordError } = await supabase.auth.admin.updateUserById(user.id, {
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { fullName, role },
  });

  if (resetPasswordError) {
    throw resetPasswordError;
  }

  const { error: upsertError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      role,
    },
    { onConflict: "id" },
  );

  if (upsertError) {
    throw upsertError;
  }

  return user;
}

async function ensureActiveCycle() {
  const { data: activeCycle } = await supabase
    .from("cycles")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (activeCycle) {
    return activeCycle.id;
  }

  const { data, error } = await supabase
    .from("cycles")
    .insert({
      name: "Proceso 2026",
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not create active cycle");
  }

  return data.id;
}

async function ensureApplicantSeedApplication(
  applicantId: string,
  cycleId: string,
  payload: Record<string, string | number>,
) {
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("applicant_id", applicantId)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      applicant_id: applicantId,
      cycle_id: cycleId,
      status: "draft",
      stage_code: "documents",
      payload,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not seed applicant application");
  }

  return data.id;
}

async function main() {
  assertDemoSeedingAllowed();
  const cycleId = await ensureActiveCycle();

  const adminUser = await createOrLoadUser({
    email: "admin.demo@uwcperu.org",
    fullName: "Admin Demo",
    role: "admin",
  });

  const applicantResults = await Promise.all(
    DEMO_APPLICANTS.map(async (applicant) => {
      const applicantUser = await createOrLoadUser({
        email: applicant.email,
        fullName: applicant.fullName,
        role: "applicant",
      });

      const applicationId = await ensureApplicantSeedApplication(
        applicantUser.id,
        cycleId,
        applicant.payload,
      );

      return {
        user: applicantUser,
        applicationId,
        email: applicant.email,
      };
    }),
  );

  console.log("Fake users ready:");
  console.log(`ADMIN_EMAIL=admin.demo@uwcperu.org ADMIN_PASSWORD=${DEFAULT_PASSWORD}`);
  console.log(`ADMIN_USER_ID=${adminUser.id}`);
  for (const [index, applicant] of applicantResults.entries()) {
    const suffix = index + 1;
    console.log(`APPLICANT_${suffix}_EMAIL=${applicant.email} APPLICANT_${suffix}_PASSWORD=${DEFAULT_PASSWORD}`);
    console.log(`SEEDED_APPLICATION_${suffix}_ID=${applicant.applicationId}`);
    console.log(`APPLICANT_${suffix}_USER_ID=${applicant.user.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
