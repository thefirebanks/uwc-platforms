import type { Database } from "@/types/supabase";
import type { CycleStageTemplate, StageFieldType } from "@/types/domain";

type CycleRow = Database["public"]["Tables"]["cycles"]["Row"];
type CycleTemplateInsert = Database["public"]["Tables"]["cycle_stage_templates"]["Insert"];
type StageFieldInsert = Database["public"]["Tables"]["cycle_stage_fields"]["Insert"];
type StageAutomationInsert = Database["public"]["Tables"]["stage_automation_templates"]["Insert"];

export type StageFieldPreset = {
  fieldKey: string;
  fieldLabel: string;
  fieldType: StageFieldType;
  isRequired: boolean;
  placeholder: string | null;
  helpText: string | null;
  sortOrder: number;
};

type StageFieldPresetInput = Omit<StageFieldPreset, "sortOrder">;

const OFFICIAL_GRADES = [
  { key: "primero", label: "PRIMERO" },
  { key: "segundo", label: "SEGUNDO" },
  { key: "tercero", label: "TERCERO" },
  { key: "cuarto", label: "CUARTO" },
  { key: "quinto", label: "QUINTO" },
] as const;

const OFFICIAL_GRADE_SUBJECTS = [
  { key: "arte", label: "Arte" },
  { key: "arteYCultura", label: "Arte y cultura" },
  { key: "cienciaYTecnologia", label: "Ciencia y tecnología" },
  { key: "cienciaTecnologiaYAmbiente", label: "Ciencia, tecnología y ambiente" },
  { key: "cienciasSociales", label: "Ciencias sociales" },
  { key: "comunicacion", label: "Comunicación" },
  {
    key: "desarrolloPersonalCiudadaniaYCivica",
    label: "Desarrollo personal, ciudadanía y cívica",
  },
  { key: "educacionFisica", label: "Educación física" },
  { key: "educacionParaElTrabajo", label: "Educación para el trabajo" },
  { key: "educacionReligiosa", label: "Educación religiosa" },
  { key: "formacionCiudadanaYCivica", label: "Formación ciudadana y cívica" },
  { key: "historiaGeografiaYEconomia", label: "Historia, geografía y economía" },
  { key: "ingles", label: "Inglés" },
  { key: "matematica", label: "Matemática" },
  { key: "personaFamiliaYRelacionesHumanas", label: "Persona, familia y relaciones humanas" },
  { key: "castellanoComoSegundaLengua", label: "Castellano como segunda lengua" },
  { key: "gestionaAprendizajeAutonomo", label: "Gestiona su aprendizaje de manera autónoma" },
  { key: "entornosVirtualesTic", label: "Se desenvuelve en entornos virtuales generados por las TIC" },
] as const;

function withSortOrder(presets: StageFieldPresetInput[]): StageFieldPreset[] {
  return presets.map((preset, index) => ({
    ...preset,
    sortOrder: index + 1,
  }));
}

function buildOfficialGradeFieldPresets(): StageFieldPresetInput[] {
  const presets: StageFieldPresetInput[] = [];

  for (const grade of OFFICIAL_GRADES) {
    for (const subject of OFFICIAL_GRADE_SUBJECTS) {
      presets.push({
        fieldKey: `officialGrade_${grade.key}_${subject.key}`,
        fieldLabel: `Notas oficiales ${grade.label} - ${subject.label}`,
        fieldType: "number",
        isRequired: false,
        placeholder: "0-20",
        helpText: `Campo condicional del formulario "Notas oficiales secundaria" (${grade.label}).`,
      });
    }

    presets.push({
      fieldKey: `officialGradeAverage_${grade.key}`,
      fieldLabel: `Promedio grado ${grade.label}`,
      fieldType: "number",
      isRequired: false,
      placeholder: "Promedio",
      helpText: `Campo condicional del formulario "Notas oficiales secundaria" (${grade.label}).`,
    });
  }

  presets.push({
    fieldKey: "officialGradesComments",
    fieldLabel: "Notas oficiales - Comentarios",
    fieldType: "long_text",
    isRequired: false,
    placeholder: "Comentarios sobre discrepancias o notas adicionales",
    helpText: "Solo si hay discrepancias con certificados/libretas.",
  });

  return presets;
}

function buildDocumentStagePresetInputs(): StageFieldPresetInput[] {
  return [
    {
      fieldKey: "fullName",
      fieldLabel: "Nombre completo",
      fieldType: "short_text",
      isRequired: true,
      placeholder: "Nombres y apellidos",
      helpText: "Tal como figura en tu DNI o pasaporte.",
    },
    {
      fieldKey: "dateOfBirth",
      fieldLabel: "Fecha de nacimiento",
      fieldType: "date",
      isRequired: true,
      placeholder: null,
      helpText: "Formato: AAAA-MM-DD.",
    },
    {
      fieldKey: "nationality",
      fieldLabel: "Nacionalidad",
      fieldType: "short_text",
      isRequired: true,
      placeholder: "Peruana",
      helpText: null,
    },
    {
      fieldKey: "schoolName",
      fieldLabel: "Colegio",
      fieldType: "short_text",
      isRequired: true,
      placeholder: "Nombre del colegio",
      helpText: null,
    },
    {
      fieldKey: "gradeAverage",
      fieldLabel: "Promedio (0-20)",
      fieldType: "number",
      isRequired: true,
      placeholder: "Ejemplo: 16.5",
      helpText: "Si estás en escala distinta, explica en comentarios.",
    },
    {
      fieldKey: "essay",
      fieldLabel: "¿Por qué quieres ir a un UWC?",
      fieldType: "long_text",
      isRequired: true,
      placeholder: "Máximo 200 palabras",
      helpText: "Ensayo principal de motivación.",
    },
    {
      fieldKey: "eligibilityBirthYear",
      fieldLabel: "Cumplimiento de requisitos - Año de nacimiento",
      fieldType: "number",
      isRequired: false,
      placeholder: "2008 / 2009 / 2010",
      helpText: "Campo del bloque de elegibilidad inicial.",
    },
    {
      fieldKey: "eligibilityCountryOfBirth",
      fieldLabel: "Cumplimiento de requisitos - País de nacimiento",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Perú",
      helpText: null,
    },
    {
      fieldKey: "eligibilityCountryOfResidence",
      fieldLabel: "Cumplimiento de requisitos - País de residencia",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Perú",
      helpText: null,
    },
    {
      fieldKey: "secondNationality",
      fieldLabel: "Cumplimiento de requisitos - Segunda nacionalidad",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Opcional",
      helpText: "Solo si aplica.",
    },
    {
      fieldKey: "secondaryYear2025",
      fieldLabel: "Cumplimiento de requisitos - Año de secundaria cursado en 2025",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "4to o 5to de secundaria",
      helpText: null,
    },
    {
      fieldKey: "isUpperThird",
      fieldLabel: "Cumplimiento de requisitos - ¿Perteneces al tercio superior?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No",
      helpText: "Registrar respuesta textual.",
    },
    {
      fieldKey: "hasMinimumAverage14",
      fieldLabel: "Cumplimiento de requisitos - ¿Tienes mínimo 14 o B de promedio?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No",
      helpText: null,
    },
    {
      fieldKey: "hasStudiedIb",
      fieldLabel: "Cumplimiento de requisitos - ¿Has estudiado IB?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No",
      helpText: null,
    },
    {
      fieldKey: "ibInstructionYear",
      fieldLabel: "Cumplimiento de requisitos - Año de instrucción en IB",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Ejemplo: Primer año del IB",
      helpText: "Solo si respondió que sí estudia/estudió IB.",
    },
    {
      fieldKey: "priorUwcPeruSelectionParticipation",
      fieldLabel: "Cumplimiento de requisitos - ¿Participó antes en selección UWC Perú?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No",
      helpText: null,
    },
    {
      fieldKey: "otherCountrySelection2025",
      fieldLabel: "Cumplimiento de requisitos - ¿Participó en selección de otro país en 2025?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No",
      helpText: null,
    },
    {
      fieldKey: "uwcDiscoveryChannel",
      fieldLabel: "Cumplimiento de requisitos - ¿Cómo te enteraste de UWC por primera vez?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Canal principal",
      helpText: null,
    },
    {
      fieldKey: "firstName",
      fieldLabel: "Información personal - Nombre(s)",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Nombre(s)",
      helpText: null,
    },
    {
      fieldKey: "paternalLastName",
      fieldLabel: "Información personal - Apellido paterno",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Apellido paterno",
      helpText: null,
    },
    {
      fieldKey: "maternalLastName",
      fieldLabel: "Información personal - Apellido materno",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Apellido materno",
      helpText: "Opcional si no aplica.",
    },
    {
      fieldKey: "documentType",
      fieldLabel: "Información personal - Tipo de documento",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "DNI / Pasaporte / Carnet de extranjería",
      helpText: null,
    },
    {
      fieldKey: "documentNumber",
      fieldLabel: "Información personal - Número de documento",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Número de documento",
      helpText: null,
    },
    {
      fieldKey: "ageAtEndOf2025",
      fieldLabel: "Información personal - Edad al 31 de diciembre de 2025",
      fieldType: "number",
      isRequired: false,
      placeholder: null,
      helpText: null,
    },
    {
      fieldKey: "gender",
      fieldLabel: "Información personal - Género",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Respuesta libre",
      helpText: null,
    },
    {
      fieldKey: "countryOfBirth",
      fieldLabel: "Información personal - País de nacimiento",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Perú",
      helpText: null,
    },
    {
      fieldKey: "countryOfResidence",
      fieldLabel: "Información personal - País de residencia",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Perú",
      helpText: null,
    },
    {
      fieldKey: "homeAddressLine",
      fieldLabel: "Información personal - Dirección (Calle/Jr./Av./Mz./AA.HH)",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Dirección principal",
      helpText: null,
    },
    {
      fieldKey: "homeAddressNumber",
      fieldLabel: "Información personal - Dirección (Número/Lote)",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Número o lote",
      helpText: null,
    },
    {
      fieldKey: "homeDistrict",
      fieldLabel: "Información personal - Distrito",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Distrito",
      helpText: null,
    },
    {
      fieldKey: "homeProvince",
      fieldLabel: "Información personal - Provincia",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Provincia",
      helpText: null,
    },
    {
      fieldKey: "homeRegion",
      fieldLabel: "Información personal - Región",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Región",
      helpText: null,
    },
    {
      fieldKey: "mobilePhone",
      fieldLabel: "Información personal - Teléfono celular",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "+51 ...",
      helpText: "Incluir código de país.",
    },
    {
      fieldKey: "landlineOrAlternativePhone",
      fieldLabel: "Información personal - Teléfono fijo o alternativo",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "01 ...",
      helpText: "Si no tienes fijo, registra un celular alternativo.",
    },
    {
      fieldKey: "hasDisability",
      fieldLabel: "Información personal - ¿Posees alguna discapacidad?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No + detalle",
      helpText: "Incluye físicas, mentales, intelectuales o de desarrollo.",
    },
    {
      fieldKey: "hasLearningDisability",
      fieldLabel: "Información personal - ¿Posees alguna discapacidad de aprendizaje?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No + detalle",
      helpText: null,
    },
    {
      fieldKey: "guardianCivilStatus",
      fieldLabel: "Apoderados - Estado civil de padres/apoderados",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Estado civil",
      helpText: null,
    },
    {
      fieldKey: "guardian1FullName",
      fieldLabel: "Apoderados - Madre o apoderado/a legal 1 (nombres y apellidos)",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Nombre completo",
      helpText: null,
    },
    {
      fieldKey: "guardian1HasLegalCustody",
      fieldLabel: "Apoderados - ¿Apoderado/a legal 1 tiene custodia legal?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No",
      helpText: null,
    },
    {
      fieldKey: "guardian1Email",
      fieldLabel: "Apoderados - Correo de madre/apoderado/a legal 1",
      fieldType: "email",
      isRequired: false,
      placeholder: "correo@dominio.com",
      helpText: null,
    },
    {
      fieldKey: "guardian1MobilePhone",
      fieldLabel: "Apoderados - Celular de madre/apoderado/a legal 1",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "+51 ...",
      helpText: null,
    },
    {
      fieldKey: "guardian2FullName",
      fieldLabel: "Apoderados - Padre o apoderado/a legal 2 (nombres y apellidos)",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Nombre completo",
      helpText: "Opcional si no aplica.",
    },
    {
      fieldKey: "guardian2HasLegalCustody",
      fieldLabel: "Apoderados - ¿Apoderado/a legal 2 tiene custodia legal?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No",
      helpText: "Opcional si no aplica.",
    },
    {
      fieldKey: "guardian2Email",
      fieldLabel: "Apoderados - Correo de padre/apoderado/a legal 2",
      fieldType: "email",
      isRequired: false,
      placeholder: "correo@dominio.com",
      helpText: "Opcional si no aplica.",
    },
    {
      fieldKey: "guardian2MobilePhone",
      fieldLabel: "Apoderados - Celular de padre/apoderado/a legal 2",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "+51 ...",
      helpText: "Opcional si no aplica.",
    },
    {
      fieldKey: "schoolDirectorName",
      fieldLabel: "Información del colegio - Nombre del director/a",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Nombre del director/a",
      helpText: null,
    },
    {
      fieldKey: "schoolDirectorEmail",
      fieldLabel: "Información del colegio - Correo del director/a o institución",
      fieldType: "email",
      isRequired: false,
      placeholder: "direccion@colegio.edu.pe",
      helpText: null,
    },
    {
      fieldKey: "schoolAddressLine",
      fieldLabel: "Información del colegio - Dirección (Calle/Jr./Av./Mz./AA.HH)",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Dirección del colegio",
      helpText: null,
    },
    {
      fieldKey: "schoolAddressNumber",
      fieldLabel: "Información del colegio - Dirección (Número/Lote)",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Número/Lote",
      helpText: null,
    },
    {
      fieldKey: "schoolDistrict",
      fieldLabel: "Información del colegio - Distrito",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Distrito",
      helpText: null,
    },
    {
      fieldKey: "schoolProvince",
      fieldLabel: "Información del colegio - Provincia",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Provincia",
      helpText: null,
    },
    {
      fieldKey: "schoolRegion",
      fieldLabel: "Información del colegio - Región",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Región",
      helpText: null,
    },
    {
      fieldKey: "schoolCountry",
      fieldLabel: "Información del colegio - País",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "País",
      helpText: null,
    },
    {
      fieldKey: "yearsInCurrentSchool",
      fieldLabel: "Información del colegio - Años estudiados en el colegio actual",
      fieldType: "number",
      isRequired: false,
      placeholder: "Años",
      helpText: null,
    },
    {
      fieldKey: "schoolPublicOrPrivate",
      fieldLabel: "Información del colegio - ¿Colegio público o privado?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Público / Privado",
      helpText: null,
    },
    {
      fieldKey: "schoolTypeDetails",
      fieldLabel: "Información del colegio - Tipo de colegio (múltiple)",
      fieldType: "long_text",
      isRequired: false,
      placeholder: "Describe características del colegio",
      helpText: "Si hay múltiples características, sepáralas por coma.",
    },
    {
      fieldKey: "receivedSchoolScholarship",
      fieldLabel: "Información del colegio - ¿Recibes o recibiste beca en tu colegio?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No",
      helpText: null,
    },
    {
      fieldKey: "whyShouldBeSelected",
      fieldLabel: "Hoja de vida - ¿Por qué deberías ser seleccionado/a para un UWC?",
      fieldType: "long_text",
      isRequired: false,
      placeholder: "Máximo 200 palabras",
      helpText: null,
    },
    {
      fieldKey: "preferredUwcColleges",
      fieldLabel: "Hoja de vida - ¿A qué colegio(s) UWC te gustaría ir?",
      fieldType: "long_text",
      isRequired: false,
      placeholder: "Máximo 3 colegios",
      helpText: "Lista separada por comas.",
    },
    {
      fieldKey: "activityOne",
      fieldLabel: "Hoja de vida - Curso o actividad 1",
      fieldType: "long_text",
      isRequired: false,
      placeholder: "Máximo 200 palabras",
      helpText: "Describe constancia, rol e impacto.",
    },
    {
      fieldKey: "recognition",
      fieldLabel: "Hoja de vida - Reconocimiento destacado",
      fieldType: "long_text",
      isRequired: false,
      placeholder: "Máximo 150 palabras",
      helpText: null,
    },
    {
      fieldKey: "favoriteKnowledgeArea",
      fieldLabel: "Hoja de vida - Curso/tema/área de conocimiento favorita",
      fieldType: "long_text",
      isRequired: false,
      placeholder: "Máximo 150 palabras",
      helpText: null,
    },
    {
      fieldKey: "freeTimeActivities",
      fieldLabel: "Hoja de vida - Actividades en tiempo libre",
      fieldType: "long_text",
      isRequired: false,
      placeholder: "Máximo 150 palabras",
      helpText: null,
    },
    {
      fieldKey: "selfDescriptionThreeWords",
      fieldLabel: "Hoja de vida - Tres palabras que te describen + ejemplo",
      fieldType: "long_text",
      isRequired: false,
      placeholder: "Máximo 200 palabras",
      helpText: null,
    },
    {
      fieldKey: "recommenderRequestMessage",
      fieldLabel: "Recomendaciones - Mensaje personalizado para solicitud",
      fieldType: "long_text",
      isRequired: false,
      placeholder: "Mensaje opcional para tus recomendadores",
      helpText: "Se usa como referencia al enviar solicitudes.",
    },
    {
      fieldKey: "mentorRecommenderName",
      fieldLabel: "Recomendaciones - Nombre del tutor/profesor/mentor recomendador",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Nombre completo",
      helpText: "Referencia para el envío de solicitud.",
    },
    {
      fieldKey: "friendRecommenderName",
      fieldLabel: "Recomendaciones - Nombre del amigo/a recomendador",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Nombre completo",
      helpText: "Referencia para el envío de solicitud.",
    },
    {
      fieldKey: "paymentOperationNumber",
      fieldLabel: "Pago - Número de operación de depósito/transferencia",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Número de operación",
      helpText: "Solo si corresponde pago regular.",
    },
    {
      fieldKey: "receivedFinancialAidForFee",
      fieldLabel: "Pago - ¿Recibiste asistencia financiera de UWC Perú?",
      fieldType: "short_text",
      isRequired: false,
      placeholder: "Sí / No",
      helpText: null,
    },
    {
      fieldKey: "identificationDocument",
      fieldLabel: "Documento - Copia de DNI",
      fieldType: "file",
      isRequired: true,
      placeholder: null,
      helpText: "Adjunta DNI legible (anverso y reverso) o equivalente.",
    },
    {
      fieldKey: "foreignerCardDocument",
      fieldLabel: "Documento - Copia de Carnet de Extranjería",
      fieldType: "file",
      isRequired: false,
      placeholder: null,
      helpText: "Condicional si aplica.",
    },
    {
      fieldKey: "passportDocument",
      fieldLabel: "Documento - Copia de pasaporte",
      fieldType: "file",
      isRequired: false,
      placeholder: null,
      helpText: "Condicional si aplica.",
    },
    {
      fieldKey: "officialStudiesCertificateDocument",
      fieldLabel: "Documento - Certificado Oficial de Estudios / Constancia / Libretas",
      fieldType: "file",
      isRequired: false,
      placeholder: null,
      helpText: "Documento académico principal.",
    },
    {
      fieldKey: "gradeAverageSpreadsheetDocument",
      fieldLabel: "Documento - Archivo Excel de Promedio de Notas",
      fieldType: "file",
      isRequired: false,
      placeholder: null,
      helpText: "Formato de promedio UWC Perú.",
    },
    {
      fieldKey: "upperThirdCertificateDocument",
      fieldLabel: "Documento - Constancia de Tercio Superior",
      fieldType: "file",
      isRequired: false,
      placeholder: null,
      helpText: "Condicional si declaró pertenecer al tercio superior.",
    },
    {
      fieldKey: "parentAuthorizationDocument",
      fieldLabel: "Documento - Autorización de Postulación firmada",
      fieldType: "file",
      isRequired: false,
      placeholder: null,
      helpText: "Firmada por padre/madre/apoderado(s).",
    },
    {
      fieldKey: "personalPhotoDocument",
      fieldLabel: "Documento - Fotografía personal tipo carnet",
      fieldType: "file",
      isRequired: false,
      placeholder: null,
      helpText: "Reciente, buena calidad.",
    },
    {
      fieldKey: "applicationPaymentProofDocument",
      fieldLabel: "Documento - Constancia de pago por postulación",
      fieldType: "file",
      isRequired: false,
      placeholder: null,
      helpText: "Condicional si no hay exoneración total.",
    },
    {
      fieldKey: "financialAidRequestDocument",
      fieldLabel: "Documento - Solicitud de asistencia financiera firmada",
      fieldType: "file",
      isRequired: false,
      placeholder: null,
      helpText: "Condicional si recibió asistencia financiera.",
    },
    ...buildOfficialGradeFieldPresets(),
  ];
}

export const DEFAULT_DOCUMENT_STAGE_FIELD_PRESETS: StageFieldPreset[] = withSortOrder(
  buildDocumentStagePresetInputs(),
);

export function findTemplateByIdOrCode(
  templates: CycleStageTemplate[],
  identifier: string,
): CycleStageTemplate | null {
  return (
    templates.find((t) => t.id === identifier) ??
    templates.find((t) => t.stage_code === identifier) ??
    null
  );
}

export function buildDefaultCycleStageTemplates({
  cycleId,
  stage1CloseAt,
  stage2CloseAt,
}: {
  cycleId: CycleRow["id"];
  stage1CloseAt: CycleRow["stage1_close_at"];
  stage2CloseAt: CycleRow["stage2_close_at"];
}): CycleTemplateInsert[] {
  return [
    {
      cycle_id: cycleId,
      stage_code: "documents",
      stage_label: "Stage 1: Documentos",
      milestone_label: "Recepción y validación documental",
      due_at: stage1CloseAt,
      ocr_prompt_template:
        "Analiza el documento y entrega una validación preliminar para comité. Resume hallazgos clave sobre legibilidad, coherencia y posibles señales de alteración.",
      sort_order: 1,
    },
    {
      cycle_id: cycleId,
      stage_code: "exam_placeholder",
      stage_label: "Stage 2: Examen (placeholder)",
      milestone_label: "Evaluación externa y consolidación",
      due_at: stage2CloseAt,
      sort_order: 2,
    },
  ];
}

export function buildDefaultCycleStageFields({
  cycleId,
}: {
  cycleId: CycleRow["id"];
}): StageFieldInsert[] {
  return DEFAULT_DOCUMENT_STAGE_FIELD_PRESETS.map((preset) => ({
    cycle_id: cycleId,
    stage_code: "documents",
    field_key: preset.fieldKey,
    field_label: preset.fieldLabel,
    field_type: preset.fieldType,
    is_required: preset.isRequired,
    placeholder: preset.placeholder,
    help_text: preset.helpText,
    sort_order: preset.sortOrder,
    is_active: true,
  }));
}

export function buildDefaultStageAutomationTemplates({
  cycleId,
}: {
  cycleId: CycleRow["id"];
}): StageAutomationInsert[] {
  return [
    {
      cycle_id: cycleId,
      stage_code: "documents",
      trigger_event: "application_submitted",
      channel: "email",
      is_enabled: true,
      template_subject: "Confirmación de postulación - {{cycle_name}}",
      template_body:
        "Hola {{full_name}}, recibimos tu postulación para {{cycle_name}}. Código de postulación: {{application_id}}.",
    },
    {
      cycle_id: cycleId,
      stage_code: "documents",
      trigger_event: "stage_result",
      channel: "email",
      is_enabled: false,
      template_subject: "Actualización de tu postulación - {{cycle_name}}",
      template_body:
        "Hola {{full_name}}, tu estado actual es {{application_status}} en {{cycle_name}}.",
    },
  ];
}
