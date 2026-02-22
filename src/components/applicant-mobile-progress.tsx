"use client";

import { useState } from "react";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { SidebarStep } from "@/components/applicant-sidebar";

export function ApplicantMobileProgress({
  currentStepLabel,
  progressPercent,
  draftStatusLabel,
  draftStatusDot,
  steps,
  activeStepKey,
  onStepClick,
}: {
  currentStepLabel: string;
  progressPercent: number;
  draftStatusLabel: string;
  draftStatusDot: "success" | "warning" | "error" | "info";
  steps: SidebarStep[];
  activeStepKey: string;
  onStepClick: (key: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const dotColor =
    draftStatusDot === "success"
      ? "var(--success)"
      : draftStatusDot === "warning"
        ? "var(--warning)"
        : draftStatusDot === "error"
          ? "#DC2626"
          : "var(--uwc-blue)";

  return (
    <Box
      data-testid="mobile-progress"
      sx={{
        display: "none",
        bgcolor: "var(--cream)",
        borderBottom: "1px solid var(--sand)",
        mb: 2,
        borderRadius: 1.5,
        overflow: "hidden",
        "@media (max-width: 768px)": {
          display: "block",
        },
      }}
    >
      {/* Compact top bar - always visible */}
      <Box
        component="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        sx={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          px: 2,
          py: 1.5,
          border: "none",
          cursor: "pointer",
          bgcolor: "transparent",
          fontFamily: "inherit",
          gap: 1.5,
        }}
      >
        {/* Progress circle */}
        <Box
          sx={{
            position: "relative",
            width: 36,
            height: 36,
            flexShrink: 0,
          }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="var(--sand)"
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="var(--uwc-maroon)"
              strokeWidth="3"
              strokeDasharray={`${(progressPercent / 100) * 94.25} 94.25`}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
              style={{ transition: "stroke-dasharray 500ms ease" }}
            />
          </svg>
          <Typography
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: "0.6rem",
              fontWeight: 700,
              color: "var(--uwc-maroon)",
            }}
          >
            {progressPercent}%
          </Typography>
        </Box>

        {/* Step info */}
        <Box sx={{ flex: 1, textAlign: "left" }}>
          <Typography
            sx={{
              fontSize: "0.82rem",
              fontWeight: 500,
              color: "var(--ink)",
              lineHeight: 1.3,
            }}
          >
            {currentStepLabel}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box
              sx={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                bgcolor: dotColor,
              }}
            />
            <Typography sx={{ fontSize: "0.68rem", color: "var(--muted)" }}>
              {draftStatusLabel}
            </Typography>
          </Stack>
        </Box>

        {/* Expand arrow */}
        <KeyboardArrowDownIcon
          sx={{
            fontSize: 20,
            color: "var(--muted)",
            transition: "transform 200ms ease",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </Box>

      {/* Expanded step list */}
      <Collapse in={isExpanded}>
        <Box sx={{ px: 1, pb: 1.5 }}>
          {/* Mini progress bar */}
          <Box
            sx={{
              height: 2,
              bgcolor: "var(--sand)",
              borderRadius: 2,
              overflow: "hidden",
              mx: 1,
              mb: 1.5,
            }}
          >
            <Box
              sx={{
                height: "100%",
                width: `${progressPercent}%`,
                background: "linear-gradient(90deg, var(--uwc-maroon), var(--uwc-blue))",
                transition: "width 500ms ease",
              }}
            />
          </Box>

          {steps.map((step, index) => {
            const isActive = step.key === activeStepKey;
            const isComplete = step.status === "complete";

            return (
              <Box
                key={step.key}
                component="button"
                onClick={() => {
                  onStepClick(step.key);
                  setIsExpanded(false);
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  width: "100%",
                  py: 1,
                  px: 1.5,
                  border: "none",
                  borderRadius: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  bgcolor: isActive ? "var(--uwc-maroon-soft)" : "transparent",
                  transition: "background-color 0.15s",
                  "&:hover": {
                    bgcolor: isActive ? "var(--uwc-maroon-soft)" : "rgba(0,0,0,0.03)",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    flexShrink: 0,
                    border: isComplete
                      ? "1.5px solid var(--success)"
                      : isActive
                        ? "1.5px solid var(--uwc-maroon)"
                        : "1.5px solid var(--sand)",
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
                  }}
                >
                  {isComplete ? <CheckIcon sx={{ fontSize: 11 }} /> : index + 1}
                </Box>
                <Typography
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: isActive ? 500 : 400,
                    color: isActive
                      ? "var(--uwc-maroon)"
                      : step.status === "not_started"
                        ? "var(--muted)"
                        : "var(--ink)",
                    textAlign: "left",
                    flex: 1,
                  }}
                >
                  {step.label}
                </Typography>
                {step.statusLabel && !isComplete ? (
                  <Typography
                    sx={{
                      fontSize: "0.6rem",
                      fontWeight: 600,
                      color: step.status === "in_progress" ? "var(--uwc-maroon)" : "var(--muted)",
                    }}
                  >
                    {step.statusLabel}
                  </Typography>
                ) : null}
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
