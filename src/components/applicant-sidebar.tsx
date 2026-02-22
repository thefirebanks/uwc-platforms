"use client";

import { Box, Stack, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";

type ProgressState = "complete" | "in_progress" | "not_started";

export type SidebarStep = {
  key: string;
  label: string;
  status: ProgressState;
  /** e.g. "85%", "1/2", or undefined (no badge shown for not_started) */
  statusLabel?: string;
};

export function ApplicantSidebar({
  processLabel,
  title,
  deadline,
  progressPercent,
  progressLabel,
  draftStatusLabel,
  draftStatusDot,
  steps,
  activeStepKey,
  onStepClick,
}: {
  processLabel?: string;
  title: string;
  deadline?: string;
  progressPercent: number;
  progressLabel: string;
  draftStatusLabel: string;
  draftStatusDot: "success" | "warning" | "error" | "info";
  steps: SidebarStep[];
  activeStepKey: string;
  onStepClick: (key: string) => void;
}) {
  const dotColor =
    draftStatusDot === "success"
      ? "var(--success)"
      : draftStatusDot === "warning"
        ? "var(--warning)"
        : draftStatusDot === "error"
          ? "#991B1B"
          : "var(--uwc-blue)";

  return (
    <Box
      component="aside"
      sx={{
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        width: 280,
        position: "fixed",
        top: { xs: 64, sm: 72 },
        left: 0,
        bottom: 0,
        bgcolor: "var(--cream)",
        borderRight: "1px solid var(--sand)",
        zIndex: 50,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2.5, pt: 3, pb: 2, borderBottom: "1px solid var(--sand)" }}>
        {processLabel ? (
          <Typography
            sx={{
              fontSize: "0.65rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--uwc-maroon)",
              mb: 0.75,
            }}
          >
            {processLabel}
          </Typography>
        ) : null}
        <Typography
          sx={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.25rem",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.3,
            color: "var(--ink)",
          }}
        >
          {title}
        </Typography>
        {deadline ? (
          <Typography sx={{ fontSize: "0.72rem", color: "var(--muted)", mt: 0.5 }}>
            {deadline}
          </Typography>
        ) : null}
      </Box>

      {/* Progress bar */}
      <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid var(--sand)" }}>
        <Box sx={{ height: 3, bgcolor: "var(--sand)", borderRadius: 2 }}>
          <Box
            sx={{
              height: 3,
              width: `${progressPercent}%`,
              borderRadius: 2,
              background: "linear-gradient(90deg, var(--uwc-maroon), var(--uwc-blue))",
              transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: dotColor,
              }}
            />
            <Typography sx={{ fontSize: "0.7rem", color: "var(--muted)" }}>
              {draftStatusLabel}
            </Typography>
          </Stack>
          <Typography sx={{ fontSize: "0.7rem", color: "var(--muted)" }}>
            {progressLabel}
          </Typography>
        </Stack>
      </Box>

      {/* Navigation */}
      <Box component="nav" sx={{ flex: 1, py: 1 }}>
        {steps.map((step, index) => {
          const isActive = step.key === activeStepKey;
          const isComplete = step.status === "complete";
          const isInProgress = step.status === "in_progress";

          return (
            <Box
              key={step.key}
              component="button"
              onClick={() => onStepClick(step.key)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                width: "100%",
                border: "none",
                cursor: "pointer",
                py: "10px",
                px: 2.5,
                bgcolor: isActive ? "var(--uwc-maroon-soft)" : "transparent",
                position: "relative",
                textAlign: "left",
                fontFamily: "inherit",
                transition: "all 0.15s ease",
                "&:hover": {
                  bgcolor: isActive ? "var(--uwc-maroon-soft)" : "var(--sand-light, #F3EFEB)",
                  color: "var(--ink)",
                },
                // Active left border indicator
                "&::before": isActive
                  ? {
                      content: '""',
                      position: "absolute",
                      left: 0,
                      top: 4,
                      bottom: 4,
                      width: 3,
                      bgcolor: "var(--uwc-maroon)",
                      borderRadius: "0 3px 3px 0",
                    }
                  : undefined,
              }}
            >
              {/* Step number / check circle */}
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  minWidth: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  transition: "all 0.2s",
                  bgcolor: isComplete
                    ? "var(--success)"
                    : isActive
                      ? "#FFFFFF"
                      : "transparent",
                  color: isComplete
                    ? "#FFFFFF"
                    : isActive
                      ? "var(--uwc-maroon)"
                      : "var(--muted)",
                  border: isComplete
                    ? "1.5px solid var(--success)"
                    : isActive
                      ? "1.5px solid var(--uwc-maroon)"
                      : "1.5px solid var(--sand)",
                }}
              >
                {isComplete ? <CheckIcon sx={{ fontSize: 12 }} /> : index + 1}
              </Box>

              {/* Label */}
              <Typography
                sx={{
                  flex: 1,
                  fontSize: "0.82rem",
                  fontWeight: isActive || isComplete ? 500 : 400,
                  color: isActive
                    ? "var(--uwc-maroon)"
                    : isComplete || isInProgress
                      ? "var(--ink)"
                      : "var(--ink-light, #5A5450)",
                }}
              >
                {step.label}
              </Typography>

              {/* Status badge */}
              {step.statusLabel ? (
                <Typography
                  sx={{
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    px: 0.75,
                    py: 0.25,
                    borderRadius: "4px",
                    color: isComplete ? "var(--success)" : "var(--uwc-maroon)",
                    bgcolor: isComplete ? "var(--success-soft)" : "var(--uwc-maroon-soft)",
                  }}
                >
                  {step.statusLabel}
                </Typography>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
