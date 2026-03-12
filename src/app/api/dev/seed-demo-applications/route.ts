import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/supabase";

/* -------------------------------------------------------------------------- */
/*  Guard: dev-only                                                            */
/* -------------------------------------------------------------------------- */

const deploymentEnvironment = (
  process.env.VERCEL_ENV ??
  process.env.NEXT_PUBLIC_VERCEL_ENV ??
  ""
).toLowerCase();
const isProductionDeployment = deploymentEnvironment === "production";
const devBypassEnabled =
  process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS === "true" && !isProductionDeployment;

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";
const DEMO_STAGE_CODE = "documents";

/* -------------------------------------------------------------------------- */
/*  Demo applicant profiles                                                    */
/* -------------------------------------------------------------------------- */

type DemoProfile = {
  email: string;
  fullName: string;
  gradeAverage: number;
  expectedOutcome: "eligible" | "needs_review" | "not_eligible";
  ocrData: {
    fullName: string;
    birthYear: string;
    documentType: string;
    documentIssue: string;
  };
  hasRecommendations: boolean;
};

const DEMO_PROFILES: DemoProfile[] = [
  {
    email:
      process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL ?? "applicant.demo@uwcperu.org",
    fullName: "FERNANDEZ TORRES CARLOS ALBERTO",
    gradeAverage: 16.5,
    expectedOutcome: "eligible",
    ocrData: {
      fullName: "FERNANDEZ TORRES CARLOS ALBERTO",
      birthYear: "2009",
      documentType: "dni",
      documentIssue: "none",
    },
    hasRecommendations: true,
  },
  {
    email:
      process.env.NEXT_PUBLIC_DEMO_APPLICANT_2_EMAIL ?? "applicant.demo2@uwcperu.org",
    fullName: "QUISPE MAMANI MARIA JOSE",
    gradeAverage: 15.0,
    expectedOutcome: "needs_review",
    ocrData: {
      fullName: "QUISPE MAMANI MARIA JOSE",
      birthYear: "2009",
      documentType: "dni",
      documentIssue: "reniec_certificate_instead_of_dni",
    },
    hasRecommendations: true,
  },
  {
    email:
      process.env.NEXT_PUBLIC_DEMO_APPLICANT_3_EMAIL ?? "applicant.demo3@uwcperu.org",
    fullName: "RAMIREZ GUTIERREZ ANA SOFIA",
    gradeAverage: 12.0,
    expectedOutcome: "not_eligible",
    ocrData: {
      fullName: "RAMIREZ GUTIERREZ ANA SOFIA",
      birthYear: "2012",
      documentType: "dni",
      documentIssue: "none",
    },
    hasRecommendations: false,
  },
];

/* -------------------------------------------------------------------------- */
/*  File keys (matching default template field keys)                           */
/* -------------------------------------------------------------------------- */

const ID_DOC_FILE_KEY = "identificationDocument";
const GRADES_DOC_FILE_KEY = "officialStudiesCertificateDocument";
const AUTH_DOC_FILE_KEY = "parentAuthorizationDocument";
const PHOTO_DOC_FILE_KEY = "personalPhotoDocument";

/* -------------------------------------------------------------------------- */
/*  Minimal PDF generator (no external dependencies)                           */
/* -------------------------------------------------------------------------- */

function buildMinimalPdf(title: string, lines: string[]): Buffer {
  function escStr(s: string): string {
    return s
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  const streamLines: string[] = [
    "BT",
    "/F1 11 Tf",
    "50 800 Td",
    `(${escStr(title)}) Tj`,
    "0 -20 Td",
    `/F1 9 Tf`,
  ];

  for (const line of lines) {
    streamLines.push(`(${escStr(line)}) Tj`);
    streamLines.push("0 -14 Td");
  }
  streamLines.push("ET");
  const streamContent = streamLines.join("\n");
  const streamLen = Buffer.byteLength(streamContent, "latin1");

  const objects: string[] = [
    `1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n`,
    `2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n`,
    `3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n/Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>\nendobj\n`,
    `4 0 obj\n<</Length ${streamLen}>>\nstream\n${streamContent}\nendstream\nendobj\n`,
    `5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n`,
  ];

  const header = "%PDF-1.4\n";
  let body = "";
  const offsets: number[] = [];
  let offset = Buffer.byteLength(header, "latin1");

  for (const obj of objects) {
    offsets.push(offset);
    body += obj;
    offset += Buffer.byteLength(obj, "latin1");
  }

  const xrefOffset = offset;
  const freeEntry = "0000000000 65535 f \n";
  const xrefEntries = offsets
    .map((o) => o.toString().padStart(10, "0") + " 00000 n \n")
    .join("");
  const xrefSection = `xref\n0 6\n${freeEntry}${xrefEntries}`;
  const trailerSection = `trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + body + xrefSection + trailerSection, "latin1");
}

function buildDemoPdf(label: string, profile: DemoProfile): Buffer {
  const { ocrData } = profile;
  const lines: string[] = [
    "---------------------------------------------------",
    label,
    "---------------------------------------------------",
    "",
    `Nombre: ${ocrData.fullName}`,
    `Fecha de Nacimiento: ${ocrData.birthYear}`,
    `Tipo Documento: ${ocrData.documentType.toUpperCase()}`,
    ocrData.documentIssue !== "none"
      ? `OBSERVACION: ${ocrData.documentIssue}`
      : "Estado: Documento valido",
    "",
    "Datos para extraccion OCR:",
    `fullName: ${ocrData.fullName}`,
    `birthYear: ${ocrData.birthYear}`,
    `documentType: ${ocrData.documentType}`,
    `documentIssue: ${ocrData.documentIssue}`,
  ];
  return buildMinimalPdf(label, lines);
}

/* -------------------------------------------------------------------------- */
/*  Dummy file for non-ID documents (grades, auth, photo)                     */
/* -------------------------------------------------------------------------- */

function buildGenericDemoPdf(label: string, applicantName: string): Buffer {
  const lines = [
    "---------------------------------------------------",
    label,
    "---------------------------------------------------",
    "",
    `Postulante: ${applicantName}`,
    `Documento generado automaticamente para demo.`,
    `Ciclo: Proceso 2026`,
    "",
    "Este archivo es un documento placeholder generado",
    "por el sistema de demo de UWC Peru.",
  ];
  return buildMinimalPdf(label, lines);
}

/* -------------------------------------------------------------------------- */
/*  Recommendation seeding helpers                                            */
/* -------------------------------------------------------------------------- */

function buildMentorResponses(applicantName: string): Record<string, unknown> {
  return {
    recommenderName: "Prof. Maria Elena Valdivia Torres",
    relationshipTitle: "Tutora academica y profesora de matematicas",
    knownDuration: "3 anios",
    strengths: `${applicantName.split(" ")[0]} demuestra una capacidad analitica excepcional y una dedicacion notable al aprendizaje. Siempre busca profundizar mas alla del curriculo establecido y motiva a sus companeros.`,
    growthAreas:
      "Necesita trabajar en su confianza para expresarse en publico. En grupos grandes tiende a ser mas reservado, aunque en contextos pequenos muestra un liderazgo natural.",
    endorsement:
      "Sin duda lo recomiendo ampliamente para el programa UWC. Su potencial academico y su calidad humana lo hacen un candidato ideal para esta experiencia transformadora.",
    confirmsNoFamily: false,
  };
}

function buildFriendResponses(applicantName: string): Record<string, unknown> {
  return {
    recommenderName: "Sofia Gutierrez Paredes",
    relationshipTitle: "Amiga y companera de clase desde hace 4 anios",
    knownDuration: "4 anios",
    strengths: `${applicantName.split(" ")[0]} es una persona muy empatica y solidaria. Siempre esta dispuesto a ayudar a sus companeros con las tareas y proyectos escolares.`,
    growthAreas:
      "A veces se exige demasiado a si mismo y necesita aprender a relajarse y disfrutar mas del proceso sin presionarse tanto.",
    endorsement:
      "Lo recomiendo completamente para participar en UWC. Sera un excelente representante del Peru en esta experiencia internacional.",
    confirmsNoFamily: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  OCR extraction instruction (the "sample files to prompt" feature)         */
/* -------------------------------------------------------------------------- */

const ID_DOC_OCR_EXTRACTION_INSTRUCTIONS = `Extrae los siguientes campos del documento de identidad peruano (DNI, pasaporte, o carnet de extranjeria):

1. fullName: Nombre completo en MAYUSCULAS (formato: APELLIDO PATERNO APELLIDO MATERNO NOMBRES)
2. birthYear: Anio de nacimiento como cadena de 4 digitos (ej: '2009')
3. documentType: Tipo exacto del documento. Debe ser exactamente uno de:
   - 'dni' (si dice DNI, Documento Nacional de Identidad, o es el DNI oficial)
   - 'pasaporte' (si es pasaporte)
   - 'carnet_extranjeria' (si es Carnet de Extranjeria)
4. documentIssue: Problema identificado. Debe ser exactamente uno de:
   - 'none' (documento aparentemente valido)
   - 'expired' (documento vencido)
   - 'reniec_certificate_instead_of_dni' (si dice CERTIFICADO RENIEC o es un certificado en lugar del DNI)
   - 'birth_certificate_instead_of_dni' (si es acta de nacimiento)

Busca especificamente las lineas que digan:
- "fullName:" o "Nombre:" para el nombre completo
- "birthYear:" o "Fecha de Nacimiento:" para el anio (extrae solo el anio de 4 digitos)
- "documentType:" o "Tipo Documento:" para el tipo
- "documentIssue:" o "OBSERVACION:" para el problema
- Si dice "Datos para extraccion OCR:" sigue con los valores exactos de esas lineas.

Ejemplo de salida para DNI valido:
{
  "fullName": "GARCIA LOPEZ JOSE ANTONIO",
  "birthYear": "2009",
  "documentType": "dni",
  "documentIssue": "none",
  "summary": "DNI peruano valido. Nombre: GARCIA LOPEZ JOSE ANTONIO. Anio nacimiento: 2009. Sin observaciones.",
  "confidence": 0.95
}

Ejemplo de salida para Certificado RENIEC:
{
  "fullName": "QUISPE MAMANI MARIA JOSE",
  "birthYear": "2009",
  "documentType": "dni",
  "documentIssue": "reniec_certificate_instead_of_dni",
  "summary": "Certificado RENIEC detectado. No es el DNI oficial. Requiere revision.",
  "confidence": 0.90
}`;

const ID_DOC_EXPECTED_SCHEMA = JSON.stringify({
  fullName: "string",
  birthYear: "string",
  documentType: "string",
  documentIssue: "string",
  summary: "string",
  confidence: 0,
});

/* -------------------------------------------------------------------------- */
/*  Reset helper (matches logic in reset-demo-applicant)                      */
/* -------------------------------------------------------------------------- */

function collectStoredFilePaths(files: Json): string[] {
  if (!files || typeof files !== "object" || Array.isArray(files)) return [];
  return Object.values(files as Record<string, Json>).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const p = (entry as Record<string, Json>).path;
    return typeof p === "string" && p.trim() ? [p.trim()] : [];
  });
}

async function resetApplicant(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  applicantId: string,
) {
  const { data: apps } = await supabase
    .from("applications")
    .select("id, files")
    .eq("applicant_id", applicantId);

  const applicationIds = (apps ?? []).map((a) => a.id);
  const filePaths = Array.from(
    new Set(
      (apps ?? []).flatMap((a) => collectStoredFilePaths(a.files)),
    ),
  );

  if (filePaths.length > 0) {
    await supabase.storage.from("application-documents").remove(filePaths);
  }

  if (applicationIds.length > 0) {
    await Promise.all([
      supabase.from("application_ocr_checks").delete().in("application_id", applicationIds),
      supabase.from("recommendation_requests").delete().in("application_id", applicationIds),
      supabase.from("stage_transitions").delete().in("application_id", applicationIds),
      supabase.from("exam_imports").delete().in("application_id", applicationIds),
      supabase.from("communication_logs").delete().in("application_id", applicationIds),
      supabase.from("audit_events").delete().in("application_id", applicationIds),
      // support_tickets also cascade-deletes when application is deleted,
      // but explicit deletion avoids FK ordering surprises
      supabase.from("support_tickets").delete().in("application_id", applicationIds),
    ]);
  }

  await supabase.from("applications").delete().eq("applicant_id", applicantId);
}

/* -------------------------------------------------------------------------- */
/*  Seed a single demo applicant                                              */
/* -------------------------------------------------------------------------- */

async function seedDemoApplicant(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  profile: DemoProfile,
  adminActorId: string | null,
): Promise<{ email: string; applicationId: string; expectedOutcome: string }> {
  // Find the demo applicant's profile
  const { data: profileData } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", profile.email.toLowerCase().trim())
    .maybeSingle();

  if (!profileData) {
    throw new AppError({
      message: `Demo applicant profile not found: ${profile.email}`,
      userMessage: `No se encontró el perfil del postulante demo ${profile.email}. Ejecuta primero el script scripts/create-fake-users.ts.`,
      status: 404,
    });
  }

  const applicantId = profileData.id;

  // Reset existing data
  await resetApplicant(supabase, applicantId);

  // Build application payload
  const payload: Record<string, unknown> = {
    // "firstname" (lowercase) is the actual form field key the rubric checks
    // for name-matches-OCR. Set it to match the OCR fullName exactly.
    firstname: profile.ocrData.fullName,
    fullName: profile.fullName,
    gradeAverage: profile.gradeAverage,
    nationality: "Peruana",
    schoolName: "Colegio Demo UWC Peru",
    essay: "Postulacion demo generada automaticamente para demostracion del sistema.",
    paternalLastName: profile.fullName.split(" ")[0] ?? "",
    maternalLastName: profile.fullName.split(" ")[1] ?? "",
    dateOfBirth: `${profile.ocrData.birthYear}-01-15`,
  };

  // Build dummy file content buffers
  const idPdf = buildDemoPdf("DOCUMENTO DE IDENTIDAD DEMO", profile);
  const gradesPdf = buildGenericDemoPdf("CERTIFICADO OFICIAL DE ESTUDIOS", profile.fullName);
  const authPdf = buildGenericDemoPdf("AUTORIZACION DE POSTULACION FIRMADA", profile.fullName);
  const photoPdf = buildGenericDemoPdf("FOTO PERSONAL TIPO CARNET", profile.fullName);

  // Create application record first (to get the application ID)
  const { data: appData, error: appError } = await supabase
    .from("applications")
    .insert({
      applicant_id: applicantId,
      cycle_id: DEMO_CYCLE_ID,
      stage_code: DEMO_STAGE_CODE,
      status: "draft",
      payload: payload as Json,
    })
    .select("id")
    .single();

  if (appError || !appData) {
    throw new AppError({
      message: `Failed creating demo application for ${profile.email}`,
      userMessage: "No se pudo crear la postulación demo.",
      status: 500,
      details: appError,
    });
  }

  const applicationId = appData.id;
  const timestamp = Date.now();

  // Upload files to storage
  const fileUploads: Array<{
    fileKey: string;
    buffer: Buffer;
    storagePath: string;
  }> = [
    {
      fileKey: ID_DOC_FILE_KEY,
      buffer: idPdf,
      storagePath: `${applicantId}/${applicationId}/${timestamp}-demo-identificacion.pdf`,
    },
    {
      fileKey: GRADES_DOC_FILE_KEY,
      buffer: gradesPdf,
      storagePath: `${applicantId}/${applicationId}/${timestamp}-demo-certificado-estudios.pdf`,
    },
    {
      fileKey: AUTH_DOC_FILE_KEY,
      buffer: authPdf,
      storagePath: `${applicantId}/${applicationId}/${timestamp}-demo-autorizacion.pdf`,
    },
    {
      fileKey: PHOTO_DOC_FILE_KEY,
      buffer: photoPdf,
      storagePath: `${applicantId}/${applicationId}/${timestamp}-demo-foto.pdf`,
    },
  ];

  const uploadedFiles: Record<string, { path: string; originalName: string; mimeType: string; sizeBytes: number }> = {};

  for (const upload of fileUploads) {
    const { error: uploadError } = await supabase.storage
      .from("application-documents")
      .upload(upload.storagePath, upload.buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      throw new AppError({
        message: `Failed uploading demo file ${upload.fileKey} for ${profile.email}`,
        userMessage: "No se pudo subir un archivo demo.",
        status: 500,
        details: uploadError,
      });
    }

    uploadedFiles[upload.fileKey] = {
      path: upload.storagePath,
      originalName: `demo-${upload.fileKey}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: upload.buffer.length,
    };
  }

  // Update application with file references
  const { error: updateError } = await supabase
    .from("applications")
    .update({ files: uploadedFiles as unknown as Database["public"]["Tables"]["applications"]["Update"]["files"] })
    .eq("id", applicationId);

  if (updateError) {
    throw new AppError({
      message: `Failed updating application files for ${profile.email}`,
      userMessage: "No se pudo actualizar los archivos de la postulación.",
      status: 500,
      details: updateError,
    });
  }

  // Seed synthetic OCR check record for the ID document
  const ocrParsedPayload = {
    fullName: profile.ocrData.fullName,
    birthYear: profile.ocrData.birthYear,
    documentType: profile.ocrData.documentType,
    documentIssue: profile.ocrData.documentIssue,
    summary: `Demo OCR: ${profile.ocrData.documentType.toUpperCase()} de ${profile.ocrData.fullName}. Año: ${profile.ocrData.birthYear}. Obs: ${profile.ocrData.documentIssue}.`,
    confidence: 0.95,
  };

  const { error: ocrError } = await supabase.from("application_ocr_checks").insert({
    application_id: applicationId,
    actor_id: adminActorId,
    file_key: ID_DOC_FILE_KEY,
    summary: ocrParsedPayload.summary,
    confidence: 0.95,
    raw_response: {
      parsed: ocrParsedPayload,
      outputText: JSON.stringify(ocrParsedPayload),
      trigger: "demo_seed",
      provider: "demo",
    } as Json,
  });

  if (ocrError) {
    throw new AppError({
      message: `Failed seeding OCR record for ${profile.email}`,
      userMessage: "No se pudo registrar el resultado OCR de demo.",
      status: 500,
      details: ocrError,
    });
  }

  // Seed recommendation records (for profiles that should have them)
  if (profile.hasRecommendations) {
    const now = new Date().toISOString();
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const mentorInsert = {
      application_id: applicationId,
      requester_id: applicantId,
      role: "mentor" as const,
      recommender_email: `mentor.demo.${applicantId.slice(0, 8)}@uwcperu.org`,
      recommender_name: "Prof. Maria Elena Valdivia Torres",
      token: randomUUID(),
      status: "submitted" as const,
      submitted_at: now,
      access_expires_at: farFuture,
      responses: buildMentorResponses(profile.fullName) as Json,
    };

    const friendInsert = {
      application_id: applicationId,
      requester_id: applicantId,
      role: "friend" as const,
      recommender_email: `amigo.demo.${applicantId.slice(0, 8)}@uwcperu.org`,
      recommender_name: "Sofia Gutierrez Paredes",
      token: randomUUID(),
      status: "submitted" as const,
      submitted_at: now,
      access_expires_at: farFuture,
      responses: buildFriendResponses(profile.fullName) as Json,
    };

    const { error: recError } = await supabase
      .from("recommendation_requests")
      .insert([mentorInsert, friendInsert]);

    if (recError) {
      throw new AppError({
        message: `Failed seeding recommendations for ${profile.email}`,
        userMessage: "No se pudieron registrar las recomendaciones demo.",
        status: 500,
        details: recError,
      });
    }
  }

  // Submit the application
  const { error: submitError } = await supabase
    .from("applications")
    .update({ status: "submitted" })
    .eq("id", applicationId);

  if (submitError) {
    throw new AppError({
      message: `Failed submitting demo application for ${profile.email}`,
      userMessage: "No se pudo enviar la postulación demo.",
      status: 500,
      details: submitError,
    });
  }

  // Seed a demo support ticket for applicants that have something to ask about
  if (profile.expectedOutcome === "needs_review") {
    // Demo 2 (REVISIÓN MANUAL): open ticket waiting for admin response
    await supabase.from("support_tickets").insert({
      application_id: applicationId,
      applicant_id: applicantId,
      subject: "Consulta sobre el estado de mi postulación",
      body: "Hola, quisiera consultar sobre el estado de mi postulación. Completé todos los documentos requeridos, pero noto que mi solicitud aparece en revisión. ¿Pueden indicarme qué está siendo revisado y si necesito enviar algo adicional? Muchas gracias.",
      status: "open",
    });
  } else if (profile.expectedOutcome === "not_eligible") {
    // Demo 3 (NO ELEGIBLE): ticket with admin reply explaining the outcome
    const now = new Date().toISOString();
    await supabase.from("support_tickets").insert({
      application_id: applicationId,
      applicant_id: applicantId,
      subject: "¿Por qué mi postulación fue marcada como no elegible?",
      body: "Buenas tardes, acabo de recibir la notificación de que mi postulación no cumple los requisitos. Me gustaría entender las razones para poder mejorar en futuras convocatorias. ¿Pueden darme más detalles? Gracias.",
      status: "replied",
      admin_reply: "Estimada Ana Sofía, gracias por contactarnos. Luego de revisar tu postulación, identificamos que no cumple con dos de los criterios de elegibilidad de esta convocatoria: el promedio de notas mínimo requerido y el rango de edad. Te animamos a postular en futuras convocatorias cuando cumplas los requisitos. El equipo de UWC Perú estará encantado de apoyarte. Saludos.",
      replied_by: adminActorId,
      replied_at: now,
    });
  }

  return { email: profile.email, applicationId, expectedOutcome: profile.expectedOutcome };
}

/* -------------------------------------------------------------------------- */
/*  Update OCR extraction instructions for the ID document field              */
/* -------------------------------------------------------------------------- */

async function ensureIdDocOcrConfig(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
): Promise<boolean> {
  const { data: field } = await supabase
    .from("cycle_stage_fields")
    .select("id, ai_parser_config")
    .eq("cycle_id", DEMO_CYCLE_ID)
    .eq("stage_code", DEMO_STAGE_CODE)
    .eq("field_key", ID_DOC_FILE_KEY)
    .maybeSingle();

  if (!field) return false;

  const currentConfig = field.ai_parser_config as Record<string, unknown> | null;
  const alreadyConfigured =
    currentConfig?.enabled === true &&
    typeof currentConfig?.extractionInstructions === "string" &&
    (currentConfig.extractionInstructions as string).includes("documentIssue");

  if (alreadyConfigured) return false;

  const newConfig = {
    enabled: true,
    modelId: "gemini-flash",
    extractionInstructions: ID_DOC_OCR_EXTRACTION_INSTRUCTIONS,
    expectedSchemaTemplate: ID_DOC_EXPECTED_SCHEMA,
    strictSchema: true,
  };

  const { error } = await supabase
    .from("cycle_stage_fields")
    .update({ ai_parser_config: newConfig as Json })
    .eq("id", field.id);

  return !error;
}

/* -------------------------------------------------------------------------- */
/*  POST handler                                                              */
/* -------------------------------------------------------------------------- */

const requestSchema = z.object({
  profiles: z.array(z.enum(["demo1", "demo2", "demo3"])).optional(),
  updateOcrConfig: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  return withErrorHandling(async () => {
    if (!devBypassEnabled) {
      throw new AppError({
        message: "Demo seed disabled",
        userMessage: "El sembrado de demo está deshabilitado en este entorno.",
        status: 404,
      });
    }

    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = requestSchema.parse(body);

    const supabase = getSupabaseAdminClient();

    // Resolve which profiles to seed
    const profileKeys = parsed.profiles ?? ["demo1", "demo2", "demo3"];
    const profileIndexMap: Record<string, number> = { demo1: 0, demo2: 1, demo3: 2 };
    const profilesToSeed = profileKeys.map((key) => DEMO_PROFILES[profileIndexMap[key]]!);

    // Get admin actor ID (use demo admin or service role placeholder)
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .maybeSingle();
    const adminActorId = adminProfile?.id ?? null;

    // Optionally update OCR config for the ID document field
    let ocrConfigUpdated = false;
    if (parsed.updateOcrConfig) {
      ocrConfigUpdated = await ensureIdDocOcrConfig(supabase);
    }

    // Seed each demo applicant
    const results: Array<{ email: string; applicationId: string; expectedOutcome: string }> = [];
    for (const profile of profilesToSeed) {
      const result = await seedDemoApplicant(supabase, profile, adminActorId);
      results.push(result);
    }

    return NextResponse.json({
      success: true,
      seeded: results,
      ocrConfigUpdated,
      message: `Demo applications seeded. Run the rubric evaluation to verify outcomes: ${results.map((r) => `${r.email} → ${r.expectedOutcome}`).join(", ")}`,
    });
  }, { operation: "dev.demo.seed_applications" });
}
