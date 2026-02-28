/**
 * Sub-group definitions for visually grouping fields within a form section.
 *
 * Each sub-group has a label, a set of field keys, and optional visual metadata.
 * Fields not matching any sub-group render in an "ungrouped" block before the
 * sub-groups.
 */

// Section keys are now strings (DB-driven). Known section keys still
// get visual sub-groups for the applicant form.

export interface SubGroupDef {
  key: string;
  label: string;
  labelEn: string;
  /** If omitted, rendered as a plain form-group with a label divider */
  variant?: "card" | "guardian";
  /** Optional visual icon glyph shown in card headers (applicant view only) */
  icon?: string;
  /** 1-indexed guardian number (only for variant=guardian) */
  guardianNumber?: number;
  /** Subtitle shown below the label (guardian cards) */
  subtitle?: string;
  subtitleEn?: string;
  /** Background + text color for the icon badge */
  iconBg?: string;
  iconColor?: string;
  /** Field keys in this sub-group */
  fieldKeys: Set<string>;
}

/* ── Eligibility ──────────────────────────────────────────────── */

const ELIGIBILITY_SUB_GROUPS: SubGroupDef[] = [
  {
    key: "academic-req",
    label: "Requisitos acad\u00e9micos",
    labelEn: "Academic requirements",
    fieldKeys: new Set([
      "secondaryYear2025",
      "isUpperThird",
      "hasMinimumAverage14",
      "hasStudiedIb",
      "ibInstructionYear",
    ]),
  },
  {
    key: "prior-participation",
    label: "Participaci\u00f3n previa",
    labelEn: "Prior participation",
    fieldKeys: new Set([
      "priorUwcPeruSelectionParticipation",
      "otherCountrySelection2025",
      "uwcDiscoveryChannel",
    ]),
  },
];

/* ── Identity ──────────────────────────────────────────────────── */

const IDENTITY_SUB_GROUPS: SubGroupDef[] = [
  {
    key: "name-identity",
    label: "Identidad",
    labelEn: "Identity",
    variant: "card",
    icon: "👤",
    iconBg: "var(--uwc-blue-soft)",
    iconColor: "var(--uwc-blue)",
    fieldKeys: new Set([
      "fullName",
      "firstName",
      "paternalLastName",
      "maternalLastName",
      "documentType",
      "documentNumber",
      "dateOfBirth",
      "ageAtEndOf2025",
      "gender",
      "nationality",
      "countryOfBirth",
      "countryOfResidence",
    ]),
  },
  {
    key: "address",
    label: "Direcci\u00f3n",
    labelEn: "Address",
    variant: "card",
    icon: "📍",
    iconBg: "var(--success-soft)",
    iconColor: "var(--success)",
    fieldKeys: new Set([
      "homeAddressLine",
      "homeAddressNumber",
      "homeDistrict",
      "homeProvince",
      "homeRegion",
    ]),
  },
  {
    key: "contact",
    label: "Contacto",
    labelEn: "Contact",
    variant: "card",
    icon: "📱",
    iconBg: "var(--warning-soft)",
    iconColor: "var(--warning)",
    fieldKeys: new Set(["mobilePhone", "landlineOrAlternativePhone"]),
  },
  {
    key: "accessibility",
    label: "Accesibilidad",
    labelEn: "Accessibility",
    variant: "card",
    icon: "♿",
    iconBg: "var(--uwc-maroon-soft)",
    iconColor: "var(--uwc-maroon)",
    fieldKeys: new Set(["hasDisability", "hasLearningDisability"]),
  },
];

/* ── Family ────────────────────────────────────────────────────── */

const FAMILY_SUB_GROUPS: SubGroupDef[] = [
  {
    key: "guardian1",
    label: "Madre o apoderado/a legal 1",
    labelEn: "Mother or legal guardian 1",
    variant: "guardian",
    guardianNumber: 1,
    subtitle: "Informaci\u00f3n de contacto principal",
    subtitleEn: "Primary contact information",
    iconBg: "var(--uwc-maroon-soft)",
    iconColor: "var(--uwc-maroon)",
    fieldKeys: new Set([
      "guardian1FullName",
      "guardian1HasLegalCustody",
      "guardian1Email",
      "guardian1MobilePhone",
    ]),
  },
  {
    key: "guardian2",
    label: "Padre o apoderado/a legal 2",
    labelEn: "Father or legal guardian 2",
    variant: "guardian",
    guardianNumber: 2,
    subtitle: "Opcional \u2014 completar si aplica",
    subtitleEn: "Optional \u2014 fill in if applicable",
    iconBg: "var(--uwc-blue-soft)",
    iconColor: "var(--uwc-blue)",
    fieldKeys: new Set([
      "guardian2FullName",
      "guardian2HasLegalCustody",
      "guardian2Email",
      "guardian2MobilePhone",
    ]),
  },
];

/* ── School ─────────────────────────────────────────────────────── */

const SCHOOL_SUB_GROUPS: SubGroupDef[] = [
  {
    key: "school-info",
    label: "Informaci\u00f3n del colegio",
    labelEn: "School information",
    variant: "card",
    icon: "🏫",
    iconBg: "var(--uwc-blue-soft)",
    iconColor: "var(--uwc-blue)",
    fieldKeys: new Set([
      "schoolName",
      "gradeAverage",
      "schoolDirectorName",
      "schoolDirectorEmail",
      "schoolAddressLine",
      "yearsInCurrentSchool",
      "schoolPublicOrPrivate",
      "receivedSchoolScholarship",
    ]),
  },
  // Note: grade fields (officialGrade_*) are rendered via GradesTable
  // and don't need a sub-group definition here
];

/* ── Export ──────────────────────────────────────────────────── */

const SUB_GROUPS_BY_SECTION: Record<string, SubGroupDef[]> = {
  eligibility: ELIGIBILITY_SUB_GROUPS,
  identity: IDENTITY_SUB_GROUPS,
  family: FAMILY_SUB_GROUPS,
  school: SCHOOL_SUB_GROUPS,
};

export function getSubGroupsForSection(
  sectionKey: string,
): SubGroupDef[] {
  return SUB_GROUPS_BY_SECTION[sectionKey] ?? [];
}

/** Recognized boolean-like field keys that render as toggle pills */
const BOOLEAN_FIELD_KEYS = new Set([
  "isUpperThird",
  "hasMinimumAverage14",
  "hasStudiedIb",
  "priorUwcPeruSelectionParticipation",
  "otherCountrySelection2025",
  "guardian1HasLegalCustody",
  "guardian2HasLegalCustody",
  "hasDisability",
  "hasLearningDisability",
  "schoolPublicOrPrivate",
  "receivedSchoolScholarship",
  "receivedFinancialAidForFee",
]);

export function isBooleanField(fieldKey: string): boolean {
  return BOOLEAN_FIELD_KEYS.has(fieldKey);
}

/**
 * Returns custom toggle-pill labels for boolean fields that don't use
 * the default S\u00ed / No. Returns `null` when the default labels apply.
 */
export function getBooleanFieldLabels(
  fieldKey: string,
  language: "es" | "en",
): { yes: string; no: string } | null {
  if (fieldKey === "schoolPublicOrPrivate") {
    return language === "en"
      ? { yes: "Public", no: "Private" }
      : { yes: "P\u00fablico", no: "Privado" };
  }
  return null;
}
