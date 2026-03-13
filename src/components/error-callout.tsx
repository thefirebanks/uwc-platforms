"use client";

import { useState } from "react";
import {
  Alert,
  AlertTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useAppLanguage } from "@/components/language-provider";
import { fetchApiResponse } from "@/lib/client/api-client";

export function ErrorCallout({
  title,
  message,
  errorId,
  context,
}: {
  title?: string;
  message: string;
  errorId?: string;
  context: string;
}) {
  const { t } = useAppLanguage();
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function reportIssue() {
    if (!errorId) {
      return;
    }

    setIsSubmitting(true);
    try {
      await fetchApiResponse("/api/errors/report", {
        method: "POST",
        body: JSON.stringify({ errorId, context, notes }),
      });
      setSubmitted(true);
    } catch {
      // Silently ignore — the error report itself failed, nothing useful to show
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Alert
      severity="error"
      sx={{
        borderRadius: 2,
        border: "1px solid color-mix(in srgb, var(--danger) 28%, var(--sand))",
        bgcolor: "color-mix(in srgb, var(--danger-soft) 55%, var(--surface))",
        "& .MuiAlert-icon": {
          color: "var(--danger)",
        },
        "& .MuiAlert-message": {
          color: "var(--ink)",
        },
      }}
    >
      <AlertTitle sx={{ color: "var(--ink)", fontWeight: 700 }}>
        {title ?? t("error.defaultTitle")}
      </AlertTitle>
      <Stack spacing={1.5}>
        <Typography sx={{ color: "var(--ink)" }}>{message}</Typography>
        {errorId ? (
          <Typography variant="body2" fontFamily="monospace" sx={{ color: "var(--ink-light)" }}>
            Error ID: {errorId}
          </Typography>
        ) : null}
        {errorId ? (
          <div className="error-callout-report-form">
            <label
              className="error-callout-input-label"
              htmlFor={`error-notes-${errorId}`}
            >
              {t("error.commentLabel")}
            </label>
            <textarea
              id={`error-notes-${errorId}`}
              className="error-callout-input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
            <button
              type="button"
              className="btn btn-outline error-callout-report-btn"
              onClick={reportIssue}
              disabled={isSubmitting || submitted}
            >
              {submitted ? t("error.reportSent") : t("error.reportIssue")}
            </button>
          </div>
        ) : null}
      </Stack>
    </Alert>
  );
}
