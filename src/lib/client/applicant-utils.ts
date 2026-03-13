import type { AppLanguage } from "@/lib/i18n/messages";
import type { RecommendationStatus } from "@/types/domain";

/* -------------------------------------------------------------------------- */
/*  Shared types                                                              */
/* -------------------------------------------------------------------------- */

export type ApplicationFileValue =
  | string
  | {
      path: string;
      title?: string;
      original_name?: string;
      mime_type?: string;
      size_bytes?: number;
      uploaded_at?: string;
    };

/* -------------------------------------------------------------------------- */
/*  Utility functions                                                         */
/* -------------------------------------------------------------------------- */

export function normalizeEmailAddress(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function parseFileEntry(value: ApplicationFileValue | undefined | null) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const inferredName = value.split("/").at(-1)?.replace(/^\d+-/, "") ?? value;
    return {
      path: value,
      title: inferredName,
      original_name: inferredName,
      mime_type: "application/octet-stream",
      size_bytes: 0,
      uploaded_at: null as string | null,
    };
  }

  return {
    path: value.path,
    title: value.title ?? value.original_name ?? value.path,
    original_name: value.original_name ?? value.path.split("/").at(-1) ?? value.path,
    mime_type: value.mime_type ?? "application/octet-stream",
    size_bytes: value.size_bytes ?? 0,
    uploaded_at: value.uploaded_at ?? null,
  };
}

export function statusTone(status: RecommendationStatus, language: AppLanguage) {
  const isEnglish = language === "en";
  if (status === "submitted") {
    return { label: isEnglish ? "Submitted" : "Enviado", color: "#166534", bg: "#DCFCE7" };
  }
  if (status === "in_progress") {
    return { label: isEnglish ? "In progress" : "En progreso", color: "#92400E", bg: "#FEF3C7" };
  }
  if (status === "opened") {
    return { label: isEnglish ? "Opened" : "Abierto", color: "#1D4ED8", bg: "#DBEAFE" };
  }
  if (status === "sent") {
    return { label: isEnglish ? "Invite sent" : "Invitación enviada", color: "#0F766E", bg: "#CCFBF1" };
  }
  if (status === "expired") {
    return { label: isEnglish ? "Expired" : "Vencido", color: "#991B1B", bg: "#FEE2E2" };
  }
  if (status === "invalidated") {
    return { label: isEnglish ? "Replaced" : "Reemplazado", color: "#6B7280", bg: "#F3F4F6" };
  }
  return { label: isEnglish ? "Pending" : "Pendiente", color: "#6B7280", bg: "#F3F4F6" };
}

export const APPLICANT_TEXT_FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "var(--surface, #fff)",
    borderRadius: "var(--radius)",
    fontSize: "0.85rem",
    color: "var(--ink)",
    minHeight: 40,
    "& fieldset": {
      borderColor: "var(--sand)",
      borderWidth: "1.5px",
      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    },
    "&:hover fieldset": {
      borderColor: "var(--muted)",
    },
    "&.Mui-focused fieldset": {
      borderColor: "var(--uwc-maroon)",
      boxShadow: "0 0 0 3px rgba(154, 37, 69, 0.08)",
    },
    "&.Mui-disabled": {
      backgroundColor: "var(--surface, #fff)",
    },
    "&.Mui-disabled fieldset": {
      borderColor: "var(--sand)",
      borderWidth: "1.5px",
    },
    "&.MuiInputBase-multiline": {
      alignItems: "flex-start",
      padding: 0,
    },
  },
  "& .MuiOutlinedInput-input": {
    padding: "9px 12px",
    lineHeight: 1.35,
    fontSize: "0.85rem",
    fontFamily: "var(--font-body), 'DM Sans', sans-serif",
  },
  "& .MuiOutlinedInput-input::placeholder": {
    color: "var(--muted)",
    opacity: 1,
    fontWeight: 300,
  },
  "& .MuiOutlinedInput-input.Mui-disabled": {
    WebkitTextFillColor: "var(--muted)",
  },
  "& .MuiOutlinedInput-input[type='number']": {
    MozAppearance: "textfield",
  },
  "& .MuiOutlinedInput-input::-webkit-outer-spin-button, & .MuiOutlinedInput-input::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
  "& .MuiOutlinedInput-inputMultiline, & .MuiInputBase-inputMultiline": {
    padding: "9px 12px",
    lineHeight: 1.5,
    minHeight: "84px !important",
    fontFamily: "var(--font-body), 'DM Sans', sans-serif",
  },
} as const;
