"use client";

import type { ChangeEvent } from "react";
import { Box, MenuItem, TextField, Typography } from "@mui/material";
import { TogglePill } from "@/components/toggle-pill";
import { GradesTable, isGradeField } from "@/components/grades-table";
import type { CycleStageField } from "@/types/domain";
import type { AppLanguage } from "@/lib/i18n/messages";
import { isBooleanField, getBooleanFieldLabels } from "@/lib/stages/field-sub-groups";
import { APPLICANT_TEXT_FIELD_SX } from "@/lib/client/applicant-utils";
import {
  LONG_TEXT_ROWS_BY_KEY,
  getLocalizedDisplayFieldLabel,
  getLocalizedFieldPlaceholder,
  getLocalizedFieldHelpText,
  shouldUseWideFieldLayout,
  getFieldMaxWidth,
  getApplicantSelectOptions,
} from "@/lib/client/applicant-form-helpers";

// ─── Hidden fields per section (design-driven) ────────────────────────

const HIDDEN_FIELDS_BY_SECTION: Partial<Record<string, Set<string>>> = {
  identity: new Set(["fullName", "countryOfBirth", "countryOfResidence"]),
  school: new Set([
    "schoolAddressNumber",
    "schoolDistrict",
    "schoolProvince",
    "schoolRegion",
    "schoolCountry",
    "schoolTypeDetails",
  ]),
  recommenders: new Set(["recommenderRequestMessage"]),
};

const DEFERRED_SCHOOL_FIELDS = new Set(["officialGradesComments"]);

// ─── Props ────────────────────────────────────────────────────────────

export interface ApplicantFormFieldsProps {
  fields: CycleStageField[];
  sectionId: string;
  formValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  isEditingEnabled: boolean;
  language: AppLanguage;
  /** Called whenever a field value changes. */
  onFieldChange: (fieldKey: string, value: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────

export function ApplicantFormFields({
  fields,
  sectionId,
  formValues,
  fieldErrors,
  isEditingEnabled,
  language,
  onFieldChange,
}: ApplicantFormFieldsProps) {
  const isEnglish = language === "en";

  // ── Partition fields ──────────────────────────────────────────────

  const gradeFields =
    sectionId === "school"
      ? fields.filter((f) => isGradeField(f.field_key))
      : [];
  const allNonGradeFields =
    sectionId === "school"
      ? fields.filter((f) => !isGradeField(f.field_key))
      : fields;

  const hiddenFieldKeys = HIDDEN_FIELDS_BY_SECTION[sectionId] ?? null;
  const nonGradeFields = hiddenFieldKeys
    ? allNonGradeFields.filter((f) => !hiddenFieldKeys.has(f.field_key))
    : allNonGradeFields;

  const deferredSchoolFields =
    sectionId === "school"
      ? nonGradeFields.filter((f) => DEFERRED_SCHOOL_FIELDS.has(f.field_key))
      : [];
  const topNonGradeFields =
    sectionId === "school"
      ? nonGradeFields.filter(
          (f) => !DEFERRED_SCHOOL_FIELDS.has(f.field_key),
        )
      : nonGradeFields;

  // ── Custom field groups ───────────────────────────────────────────

  const customGroupedFieldNames = Array.from(
    new Set(
      topNonGradeFields
        .map((field) => field.group_name?.trim() ?? "")
        .filter((groupName) => groupName.length > 0),
    ),
  );
  const hasCustomFieldGroups = customGroupedFieldNames.length > 0;

  // ── Render helpers ────────────────────────────────────────────────

  function renderSingleField(field: CycleStageField) {
    const displayLabel = getLocalizedDisplayFieldLabel({
      sectionId,
      field,
      language,
    });

    // Boolean fields → toggle pill
    if (isBooleanField(field.field_key)) {
      return (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <Typography
            sx={{
              fontSize: "0.78rem",
              fontWeight: 500,
              color: "var(--ink)",
              mb: "5px",
              lineHeight: 1.35,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {displayLabel}
            {field.is_required ? (
              <Typography
                component="span"
                sx={{
                  color: "var(--uwc-maroon)",
                  fontWeight: 400,
                  fontSize: "inherit",
                }}
              >
                *
              </Typography>
            ) : null}
          </Typography>
          <TogglePill
            value={formValues[field.field_key] ?? ""}
            onChange={(next) => onFieldChange(field.field_key, next)}
            yesLabel={
              getBooleanFieldLabels(field.field_key, language)?.yes ??
              (isEnglish ? "Yes" : "S\u00ed")
            }
            noLabel={
              getBooleanFieldLabels(field.field_key, language)?.no ?? "No"
            }
            disabled={!isEditingEnabled}
          />
          {fieldErrors[field.field_key] ? (
            <Typography
              sx={{ fontSize: "0.7rem", color: "error.main", mt: "3px" }}
            >
              {fieldErrors[field.field_key]}
            </Typography>
          ) : null}
          {!fieldErrors[field.field_key] &&
          getLocalizedFieldHelpText(field, language) ? (
            <Typography
              sx={{ fontSize: "0.7rem", color: "var(--muted)", mt: "3px" }}
            >
              {getLocalizedFieldHelpText(field, language)}
            </Typography>
          ) : null}
        </Box>
      );
    }

    // Standard text/number/date/email fields
    const errorMsg = fieldErrors[field.field_key];
    const helpMsg = getLocalizedFieldHelpText(field, language);
    const isCompactSchoolComments =
      field.field_key === "officialGradesComments";
    const selectOptions = getApplicantSelectOptions(field.field_key, language);
    const hasStudiedIbValue = (
      formValues.hasStudiedIb ?? ""
    )
      .trim()
      .toLowerCase();
    const isIbYearFieldTemporarilyDisabled =
      field.field_key === "ibInstructionYear" &&
      !["si", "sí", "yes"].includes(hasStudiedIbValue);
    const fieldIsDisabled =
      !isEditingEnabled || isIbYearFieldTemporarilyDisabled;
    const applyDimmedDependentFieldStyle =
      isIbYearFieldTemporarilyDisabled && isEditingEnabled;

    const longTextRows =
      field.field_type === "long_text"
        ? (LONG_TEXT_ROWS_BY_KEY[field.field_key] ?? 3)
        : undefined;
    const isLongTextField = field.field_type === "long_text";

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          ...(applyDimmedDependentFieldStyle ? { opacity: 0.45 } : null),
        }}
      >
        <Typography
          component="label"
          sx={{
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--ink)",
            mb: "5px",
            lineHeight: 1.35,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {displayLabel}
          {field.is_required ? (
            <Typography
              component="span"
              sx={{
                color: "var(--uwc-maroon)",
                fontWeight: 400,
                fontSize: "inherit",
              }}
            >
              *
            </Typography>
          ) : null}
        </Typography>
        {isLongTextField ? (
          <Box
            component="textarea"
            value={formValues[field.field_key] ?? ""}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              onFieldChange(field.field_key, event.target.value);
            }}
            rows={isCompactSchoolComments ? 2 : longTextRows}
            disabled={fieldIsDisabled}
            aria-label={displayLabel}
            placeholder={getLocalizedFieldPlaceholder(field, language)}
            sx={{
              width: "100%",
              padding: "9px 12px",
              fontFamily: "var(--font-body), 'DM Sans', sans-serif",
              fontSize: "0.85rem",
              lineHeight: 1.5,
              color: "var(--ink)",
              background: "var(--surface, #fff)",
              border: "1.5px solid var(--sand)",
              borderColor: errorMsg ? "#DC2626" : "var(--sand)",
              borderRadius: "var(--radius)",
              outline: "none",
              resize: "vertical",
              minHeight: isCompactSchoolComments ? 72 : undefined,
              transition:
                "border-color 0.15s ease, box-shadow 0.15s ease",
              "&::placeholder": {
                color: "var(--muted)",
                opacity: 1,
                fontWeight: 300,
              },
              "&:hover": {
                borderColor: errorMsg ? "#DC2626" : "var(--muted)",
              },
              "&:focus": {
                borderColor: errorMsg
                  ? "#DC2626"
                  : "var(--uwc-maroon)",
                boxShadow: errorMsg
                  ? "0 0 0 3px rgba(220, 38, 38, 0.08)"
                  : "0 0 0 3px rgba(154, 37, 69, 0.08)",
              },
              "&:disabled": {
                color: "var(--muted)",
                background: "var(--surface, #fff)",
                WebkitTextFillColor: "var(--muted)",
                cursor: "not-allowed",
              },
            }}
          />
        ) : (
          <TextField
            hiddenLabel
            value={formValues[field.field_key] ?? ""}
            onChange={(event) => {
              onFieldChange(field.field_key, event.target.value);
            }}
            type={
              field.field_type === "date"
                ? "date"
                : field.field_type === "number"
                  ? "number"
                  : field.field_type === "email"
                    ? "email"
                    : "text"
            }
            fullWidth
            disabled={fieldIsDisabled}
            select={Boolean(selectOptions)}
            placeholder={getLocalizedFieldPlaceholder(field, language)}
            error={Boolean(errorMsg)}
            sx={APPLICANT_TEXT_FIELD_SX}
            slotProps={{
              htmlInput: {
                "aria-label": displayLabel,
                step:
                  field.field_key === "gradeAverage"
                    ? "0.1"
                    : field.field_type === "number"
                      ? "1"
                      : undefined,
              },
            }}
          >
            {selectOptions?.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
        )}
        {errorMsg ? (
          <Typography
            sx={{ fontSize: "0.7rem", color: "error.main", mt: "3px" }}
          >
            {errorMsg}
          </Typography>
        ) : helpMsg ? (
          <Typography
            sx={{ fontSize: "0.7rem", color: "var(--muted)", mt: "3px" }}
          >
            {helpMsg}
          </Typography>
        ) : null}
      </Box>
    );
  }

  function renderFieldGrid(gridFields: CycleStageField[]) {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px 18px",
          "@media (max-width: 768px)": {
            gridTemplateColumns: "1fr",
          },
        }}
      >
        {gridFields.map((field) => {
          const displayLabel = getLocalizedDisplayFieldLabel({
            sectionId,
            field,
            language,
          });
          const isWide = shouldUseWideFieldLayout({ field, displayLabel });
          const maxWidth = getFieldMaxWidth(field.field_key);

          return (
            <Box
              key={field.id}
              sx={{
                ...(isWide ? { gridColumn: "1 / -1" } : null),
                ...(maxWidth ? { maxWidth } : null),
              }}
            >
              {renderSingleField(field)}
            </Box>
          );
        })}
      </Box>
    );
  }

  // ── Grades section (shared between grouped and ungrouped layouts) ──

  const gradesSection =
    gradeFields.length > 0 ? (
      <Box sx={{ mt: 1 }}>
        <Typography
          sx={{
            fontSize: "0.68rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--muted)",
            mb: "14px",
            pb: 1,
            borderBottom: "1px solid var(--sand-light, #F3EFEB)",
          }}
        >
          {isEnglish ? "Official grades by year" : "Notas oficiales por año"}
        </Typography>
        <GradesTable
          fields={gradeFields}
          formValues={formValues}
          onFieldChange={(key, value) => onFieldChange(key, value)}
          onFieldBlur={() => {}}
          disabled={!isEditingEnabled}
          language={language}
        />
      </Box>
    ) : null;

  const deferredSection =
    deferredSchoolFields.length > 0 ? (
      <Box
        sx={{
          mt: hasCustomFieldGroups
            ? 3
            : gradeFields.length > 0
              ? 3
              : 0,
        }}
      >
        {renderFieldGrid(deferredSchoolFields)}
      </Box>
    ) : null;

  // ── Grouped layout ────────────────────────────────────────────────

  if (hasCustomFieldGroups) {
    const fieldsByCustomGroup = new Map<string, CycleStageField[]>();
    for (const groupName of customGroupedFieldNames) {
      fieldsByCustomGroup.set(groupName, []);
    }
    const ungroupedFields = topNonGradeFields.filter((field) => {
      const groupName = field.group_name?.trim() ?? "";
      if (!groupName) {
        return true;
      }
      fieldsByCustomGroup.get(groupName)?.push(field);
      return false;
    });

    return (
      <Box>
        {ungroupedFields.length > 0 ? (
          <Box
            sx={{
              mb: "28px",
              animation: "fadeUp 0.35s ease",
              animationFillMode: "backwards",
            }}
          >
            {renderFieldGrid(ungroupedFields)}
          </Box>
        ) : null}

        {customGroupedFieldNames.map((groupName, idx) => {
          const groupedFields =
            fieldsByCustomGroup.get(groupName) ?? [];
          if (groupedFields.length === 0) {
            return null;
          }
          return (
            <Box
              key={`${sectionId}-${groupName}`}
              sx={{
                mb: "28px",
                animation: "fadeUp 0.35s ease",
                animationFillMode: "backwards",
                animationDelay: `${(idx + 1) * 0.05}s`,
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  mb: "14px",
                  pb: 1,
                  borderBottom:
                    "1px solid var(--sand-light, #F3EFEB)",
                }}
              >
                {groupName}
              </Typography>
              {renderFieldGrid(groupedFields)}
            </Box>
          );
        })}

        {gradesSection}
        {deferredSection}
      </Box>
    );
  }

  // ── Flat layout (no custom groups) ────────────────────────────────

  return (
    <Box>
      {renderFieldGrid(topNonGradeFields)}
      {gradesSection}
      {deferredSection}
    </Box>
  );
}
