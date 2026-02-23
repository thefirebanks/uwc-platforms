"use client";

import { useState } from "react";
import type React from "react";
import { Box, Typography } from "@mui/material";
import type { CycleStageField } from "@/types/domain";
import type { AppLanguage } from "@/lib/i18n/messages";

/* ── Grade key parsing ──────────────────────────────────────── */

const GRADE_ORDER = ["primero", "segundo", "tercero", "cuarto", "quinto"] as const;
type GradeName = (typeof GRADE_ORDER)[number];

const GRADE_SHORT_LABELS: Record<GradeName, string> = {
  primero: "1ro",
  segundo: "2do",
  tercero: "3ro",
  cuarto: "4to",
  quinto: "5to",
};

const GRADE_SHORT_LABELS_EN: Record<GradeName, string> = {
  primero: "1st",
  segundo: "2nd",
  tercero: "3rd",
  cuarto: "4th",
  quinto: "5th",
};

function humaniseSubject(subjectKey: string): string {
  return subjectKey
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ── Types ──────────────────────────────────────────────────── */

interface GradeCell {
  field: CycleStageField;
  subject: string;
  subjectKey: string;
}

interface GradeYear {
  grade: GradeName;
  cells: GradeCell[];
  averageField: CycleStageField | null;
}

/* ── Helpers ────────────────────────────────────────────────── */

function buildYears(fields: CycleStageField[]): GradeYear[] {
  const yearMap = new Map<GradeName, GradeYear>();

  for (const g of GRADE_ORDER) {
    yearMap.set(g, { grade: g, cells: [], averageField: null });
  }

  for (const field of fields) {
    if (field.field_key.startsWith("officialGradeAverage_")) {
      const grade = field.field_key.replace("officialGradeAverage_", "") as GradeName;
      const year = yearMap.get(grade);
      if (year) year.averageField = field;
      continue;
    }

    if (field.field_key.startsWith("officialGrade_")) {
      const parts = field.field_key.split("_");
      const grade = parts[1] as GradeName;
      const subjectKey = parts.slice(2).join("_");
      const year = yearMap.get(grade);
      if (year) {
        year.cells.push({
          field,
          subject: humaniseSubject(subjectKey),
          subjectKey,
        });
      }
    }
  }

  return GRADE_ORDER.map((g) => yearMap.get(g)!).filter(
    (y) => y.cells.length > 0 || y.averageField,
  );
}

function computeAverage(cells: GradeCell[], values: Record<string, string>): string {
  const nums = cells
    .map((c) => parseFloat(values[c.field.field_key] ?? ""))
    .filter((n) => !isNaN(n));
  if (nums.length === 0) return "--";
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
}

function getStoredAverageValue(year: GradeYear, values: Record<string, string>): string {
  if (!year.averageField) return "--";
  const raw = values[year.averageField.field_key] ?? "";
  const parsed = Number.parseFloat(String(raw));
  return Number.isFinite(parsed) ? parsed.toFixed(1) : "--";
}

/* ── Component ──────────────────────────────────────────────── */

interface GradesTableProps {
  fields: CycleStageField[];
  formValues: Record<string, string>;
  onFieldChange: (fieldKey: string, value: string) => void;
  onFieldBlur: () => void;
  disabled?: boolean;
  language: AppLanguage;
}

export function GradesTable({
  fields,
  formValues,
  onFieldChange,
  onFieldBlur,
  disabled = false,
  language,
}: GradesTableProps) {
  const years = buildYears(fields);
  const [activeYear, setActiveYear] = useState<GradeName>(years[0]?.grade ?? "primero");
  const currentYear = years.find((y) => y.grade === activeYear) ?? years[0];

  const labels = language === "en" ? GRADE_SHORT_LABELS_EN : GRADE_SHORT_LABELS;

  if (!currentYear) return null;

  function getYearAverageDisplay(year: GradeYear) {
    const computed = computeAverage(year.cells, formValues);
    return computed !== "--" ? computed : getStoredAverageValue(year, formValues);
  }

  function handleGradeCellChange(year: GradeYear, cell: GradeCell, nextValue: string) {
    onFieldChange(cell.field.field_key, nextValue);

    if (!year.averageField) {
      return;
    }

    const nextValues = { ...formValues, [cell.field.field_key]: nextValue };
    const computedAverage = computeAverage(year.cells, nextValues);
    onFieldChange(year.averageField.field_key, computedAverage === "--" ? "" : computedAverage);
  }

  return (
    <Box sx={{ mb: "28px", animation: "fadeUp 0.35s ease" }}>
      {/* Year tabs */}
      <Box
        sx={{
          display: "flex",
          gap: "4px",
          mb: 2,
          borderBottom: "1px solid var(--sand)",
          pb: 0,
        }}
      >
        {years.map((y) => {
          const isActive = y.grade === activeYear;
          const avg = getYearAverageDisplay(y);
          return (
            <Box
              key={y.grade}
              component="button"
              type="button"
              onClick={() => setActiveYear(y.grade)}
              sx={{
                px: 2,
                py: 1,
                fontFamily: "var(--font-body)",
                fontSize: "0.78rem",
                fontWeight: 500,
                color: isActive ? "var(--uwc-maroon)" : "var(--muted)",
                border: "none",
                background: "none",
                cursor: "pointer",
                borderBottom: isActive ? "2px solid var(--uwc-maroon)" : "2px solid transparent",
                mb: "-1px",
                transition: "all 0.2s",
                "&:hover": { color: "var(--ink)" },
              }}
            >
              {labels[y.grade]}{" "}
              <Typography
                component="span"
                sx={{ fontSize: "0.65rem", color: "var(--muted)", ml: "4px", fontWeight: 400 }}
              >
                {avg}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Table */}
      <Box
        component="table"
        sx={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          animation: "fadeUp 0.25s ease",
          "& th": {
            textAlign: "left",
            px: 1.5,
            py: 1,
            fontFamily: "var(--font-body), sans-serif",
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--muted)",
            background: "var(--cream)",
            borderBottom: "1px solid var(--sand)",
            "&:last-child": { textAlign: "right", width: 100 },
          },
          "& td": {
            p: 0,
            borderBottom: "1px solid var(--sand-light, #F3EFEB)",
          },
          "& td:first-of-type": {
            px: 1.5,
            py: 1,
            fontFamily: "var(--font-body), sans-serif",
            fontSize: "0.82rem",
            color: "var(--ink)",
          },
          "& td:last-child": {
            textAlign: "right",
            px: 1,
            py: 0.5,
            fontFamily: "var(--font-body), sans-serif",
          },
          "& tr:last-child td": { borderBottom: "none" },
        }}
      >
        <thead>
          <tr>
            <th>{language === "en" ? "Subject" : "Materia"}</th>
            <th>{language === "en" ? "Grade" : "Nota"}</th>
          </tr>
        </thead>
        <tbody>
          {currentYear.cells.map((cell) => (
            <tr key={cell.field.field_key}>
              <td>{cell.subject}</td>
              <td>
                <Box
                  component="input"
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  value={formValues[cell.field.field_key] ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleGradeCellChange(currentYear, cell, e.target.value)}
                  onBlur={onFieldBlur}
                  disabled={disabled}
                  placeholder="—"
                  sx={{
                    width: 72,
                    padding: "6px 10px",
                    fontFamily: "var(--font-body), sans-serif",
                    fontSize: "0.85rem",
                    color: "var(--ink)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    background: disabled ? "transparent" : "var(--surface)",
                    border: disabled ? "1.5px solid transparent" : "1.5px solid var(--sand)",
                    borderRadius: "6px",
                    outline: "none",
                    cursor: disabled ? "default" : "text",
                    transition: "all 0.15s",
                    "&::placeholder": {
                      color: "var(--muted)",
                      opacity: 1,
                      fontFamily: "var(--font-body), sans-serif",
                    },
                    "&:disabled": {
                      color: "var(--muted)",
                      WebkitTextFillColor: "var(--muted)",
                      fontFamily: "var(--font-body), sans-serif",
                    },
                    "&:hover": disabled ? {} : { borderColor: "var(--muted)" },
                    "&:focus": {
                      borderColor: "var(--uwc-maroon)",
                      background: "white",
                      boxShadow: "0 0 0 3px rgba(154, 37, 69, 0.08)",
                    },
                    /* Hide number spinner arrows */
                    "&::-webkit-outer-spin-button, &::-webkit-inner-spin-button": {
                      WebkitAppearance: "none",
                      margin: 0,
                    },
                    MozAppearance: "textfield",
                  }}
                />
              </td>
            </tr>
          ))}
          {/* Average row */}
          <tr>
            <Box
              component="td"
              sx={{
                px: 1.5,
                py: 1.25,
                background: "var(--uwc-maroon-soft, #FAF0F2)",
                fontWeight: 600,
                color: "var(--uwc-maroon)",
                borderBottom: "none !important",
                borderRadius: "0 0 0 var(--radius)",
              }}
            >
              {language === "en" ? `Average ${labels[currentYear.grade]}` : `Promedio ${labels[currentYear.grade]}`}
            </Box>
            <Box
              component="td"
              sx={{
                textAlign: "right",
                px: 1.5,
                py: 1.25,
                background: "var(--uwc-maroon-soft, #FAF0F2)",
                fontWeight: 600,
                color: "var(--uwc-maroon)",
                fontFamily: "var(--font-body), sans-serif",
                fontVariantNumeric: "tabular-nums",
                fontSize: "0.95rem",
                borderBottom: "none !important",
                borderRadius: "0 0 var(--radius) 0",
              }}
            >
              {getYearAverageDisplay(currentYear)}
            </Box>
          </tr>
        </tbody>
      </Box>

      {/* Average field (if it exists, render as hidden to keep form data) */}
      {currentYear.averageField ? (
        <input
          type="hidden"
          name={currentYear.averageField.field_key}
          value={getYearAverageDisplay(currentYear) === "--" ? "" : getYearAverageDisplay(currentYear)}
        />
      ) : null}
    </Box>
  );
}

/** Check if a field is a grade field (for filtering out of regular rendering) */
export function isGradeField(fieldKey: string): boolean {
  return fieldKey.startsWith("officialGrade_") || fieldKey.startsWith("officialGradeAverage_");
}
