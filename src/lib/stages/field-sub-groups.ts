/**
 * Sub-group definitions for visually grouping fields within a form section.
 *
 * Each sub-group has a label, a set of field keys, and optional visual metadata.
 * Fields not matching any sub-group render in an "ungrouped" block before the
 * sub-groups.
 */

import type { ApplicantFormSectionId } from "@/lib/stages/applicant-sections";

export interface SubGroupDef {
  key: string;
  label: string;
  labelEn: string;
  /** If omitted, rendered as a plain form-group with a label divider */
  variant?: "card" | "guardian";
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
    label: "Requisitos academicos",
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
    label: "Participacion previa",
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
    label: "Direccion",
    labelEn: "Address",
    variant: "card",
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
    iconBg: "var(--warning-soft)",
    iconColor: "var(--warning)",
    fieldKeys: new Set(["mobilePhone", "landlineOrAlternativePhone"]),
  },
  {
    key: "accessibility",
    label: "Accesibilidad",
    labelEn: "Accessibility",
    variant: "card",
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
    subtitle: "Informacion de contacto principal",
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
    subtitle: "Opcional -- completar si aplica",
    subtitleEn: "Optional -- fill in if applicable",
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
    label: "Informacion del colegio",
    labelEn: "School information",
    variant: "card",
    iconBg: "var(--uwc-blue-soft)",
    iconColor: "var(--uwc-blue)",
    fieldKeys: new Set([
      "schoolName",
      "schoolDirectorName",
      "schoolDirectorEmail",
      "schoolAddressLine",
      "schoolAddressNumber",
      "schoolDistrict",
      "schoolProvince",
      "schoolRegion",
      "schoolCountry",
      "yearsInCurrentSchool",
      "schoolPublicOrPrivate",
      "schoolTypeDetails",
      "receivedSchoolScholarship",
    ]),
  },
  // Note: grade fields (officialGrade_*) are rendered via GradesTable
  // and don't need a sub-group definition here
];

/* ── Export ──────────────────────────────────────────────────── */

const SUB_GROUPS_BY_SECTION: Partial<Record<ApplicantFormSectionId, SubGroupDef[]>> = {
  eligibility: ELIGIBILITY_SUB_GROUPS,
  identity: IDENTITY_SUB_GROUPS,
  family: FAMILY_SUB_GROUPS,
  school: SCHOOL_SUB_GROUPS,
};

export function getSubGroupsForSection(
  sectionId: ApplicantFormSectionId,
): SubGroupDef[] {
  return SUB_GROUPS_BY_SECTION[sectionId] ?? [];
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
  "receivedSchoolScholarship",
  "receivedFinancialAidForFee",
]);

export function isBooleanField(fieldKey: string): boolean {
  return BOOLEAN_FIELD_KEYS.has(fieldKey);
}
