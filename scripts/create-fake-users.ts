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

async function ensureApplicantSeedApplication(applicantId: string, cycleId: string) {
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
      payload: {
        fullName: "Applicant Demo",
        dateOfBirth: "2009-03-14",
        nationality: "Peruana",
        schoolName: "Colegio Demo",
        gradeAverage: 16.2,
        essay: "Este texto demo existe para facilitar pruebas de la etapa inicial del MVP.",
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not seed applicant application");
  }

  return data.id;
}

async function main() {
  const cycleId = await ensureActiveCycle();

  const adminUser = await createOrLoadUser({
    email: "admin.demo@uwcperu.org",
    fullName: "Admin Demo",
    role: "admin",
  });

  const applicantUser = await createOrLoadUser({
    email: "applicant.demo@uwcperu.org",
    fullName: "Applicant Demo",
    role: "applicant",
  });

  const applicationId = await ensureApplicantSeedApplication(applicantUser.id, cycleId);

  console.log("Fake users ready:");
  console.log(`ADMIN_EMAIL=admin.demo@uwcperu.org ADMIN_PASSWORD=${DEFAULT_PASSWORD}`);
  console.log(`APPLICANT_EMAIL=applicant.demo@uwcperu.org APPLICANT_PASSWORD=${DEFAULT_PASSWORD}`);
  console.log(`SEEDED_APPLICATION_ID=${applicationId}`);
  console.log(`ADMIN_USER_ID=${adminUser.id}`);
  console.log(`APPLICANT_USER_ID=${applicantUser.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
