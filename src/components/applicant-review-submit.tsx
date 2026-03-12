"use client";

import { Box, Stack, Typography } from "@mui/material";
import { StatusBadge } from "@/components/stage-badge";

type ProgressState = "complete" | "in_progress" | "not_started";

interface ProgressStep {
  key: string;
  label: string;
  status: ProgressState;
}

interface ApplicantReviewSubmitProps {
  progressSteps: ProgressStep[];
  sidebarProgressLabel: string;
  copy: (spanish: string, english: string) => string;
}

/**
 * Review & Submit section showing per-section progress indicators.
 * Lets the applicant confirm readiness before submitting the form.
 */
export function ApplicantReviewSubmit({
  progressSteps,
  sidebarProgressLabel,
  copy,
}: ApplicantReviewSubmitProps) {
  return (
    <Box>
      <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", mb: 1 }}>
        {copy("Progreso por secciones", "Section progress")}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
        {sidebarProgressLabel}
      </Typography>
      <Stack spacing={0.8} sx={{ mb: 3 }}>
        {progressSteps.map((step) => (
          <Stack key={step.key} direction="row" alignItems="center" spacing={1}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor:
                  step.status === "complete"
                    ? "var(--success)"
                    : step.status === "in_progress"
                      ? "var(--uwc-maroon)"
                      : "var(--sand)",
              }}
            />
            <Typography variant="body2" sx={{ flex: 1 }}>{step.label}</Typography>
            <StatusBadge status={step.status} />
          </Stack>
        ))}
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2, fontSize: "0.82rem" }}>
        {copy("Revisa el progreso por sección y envía solo cuando estés listo.", "Review progress by section and submit only when you are ready.")}
      </Typography>
    </Box>
  );
}

export type { ProgressStep, ProgressState };
