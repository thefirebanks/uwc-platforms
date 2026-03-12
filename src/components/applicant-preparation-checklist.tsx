"use client";

import { Box, Stack, Typography } from "@mui/material";
import { renderSafeMarkdown } from "@/lib/markdown";

interface ApplicantPreparationChecklistProps {
  stageInstructions: string | null | undefined;
  requiredDocumentLabels: string[];
  copy: (spanish: string, english: string) => string;
}

/**
 * Pre-application checklist shown in the prep/intro section.
 * Displays either admin-configured markdown instructions or a default
 * bullet-point guide with required document labels.
 */
export function ApplicantPreparationChecklist({
  stageInstructions,
  requiredDocumentLabels,
  copy,
}: ApplicantPreparationChecklistProps) {
  return (
    <Box
      sx={{
        border: "1px solid var(--sand)",
        borderRadius: "var(--radius)",
        bgcolor: "var(--cream)",
        p: { xs: 2, sm: 2.5 },
      }}
    >
      {!stageInstructions?.trim().length ? (
        <Typography color="text.secondary" sx={{ mb: 1.2, fontSize: "0.85rem" }}>
          {copy(
            "Reúne los documentos y datos necesarios. Puedes salir en cualquier momento: el borrador se guarda automáticamente.",
            "Gather all required documents and data. You can leave anytime: the draft auto-saves.",
          )}
        </Typography>
      ) : null}
      {stageInstructions?.trim().length ? (
        <Box
          sx={{
            color: "var(--ink)",
            fontSize: "0.92rem",
            lineHeight: 1.7,
            "& h1, & h2, & h3": {
              fontFamily: "var(--font-display), Georgia, serif",
              fontWeight: 500,
              letterSpacing: "-0.02em",
              margin: "0 0 0.75rem",
            },
            "& p": {
              margin: "0 0 0.85rem",
            },
            "& ul": {
              margin: "0 0 0.85rem 1.2rem",
              padding: 0,
            },
            "& li": {
              marginBottom: "0.4rem",
            },
            "& a": {
              color: "var(--uwc-maroon)",
            },
            "& code": {
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: "0.85em",
              background: "rgba(0,0,0,0.04)",
              padding: "0.05rem 0.25rem",
              borderRadius: "4px",
            },
          }}
          dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(stageInstructions) }}
        />
      ) : (
        <Stack spacing={0.55}>
          <Typography variant="body2">
            {copy(
              "1. Ten listos documentos en PDF/JPG/PNG (idealmente menos de 10MB).",
              "1. Prepare documents in PDF/JPG/PNG format (ideally under 10MB).",
            )}
          </Typography>
          <Typography variant="body2">
            {copy(
              "2. Confirma los correos de tus dos recomendadores antes de registrarlos.",
              "2. Confirm your two recommenders' emails before registering them.",
            )}
          </Typography>
          <Typography variant="body2">
            {copy(
              "3. Completa primero los campos obligatorios (marcados con *), luego revisa.",
              "3. Complete required fields first (marked with *), then review.",
            )}
          </Typography>
          {requiredDocumentLabels.length > 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
              {copy("Documentos obligatorios", "Required documents")}: {requiredDocumentLabels.join(", ")}.
            </Typography>
          ) : null}
        </Stack>
      )}
    </Box>
  );
}
