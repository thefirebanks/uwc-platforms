"use client";

import { useState } from "react";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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
  const [expanded, setExpanded] = useState(false);

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
      sx={{
        display: { xs: "block", md: "none" },
        bgcolor: "var(--cream)",
        border: "1px solid var(--sand)",
        borderRadius: "var(--radius)",
        mb: 2,
        overflow: "hidden",
      }}
    >
      {/* Compact bar - always visible */}
      <Box
        onClick={() => setExpanded((prev) => !prev)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 1.5,
          cursor: "pointer",
          "&:hover": { bgcolor: "rgba(0,0,0,0.02)" },
        }}
      >
        {/* Circular progress indicator */}
        <Box
          sx={{
            position: "relative",
            width: 36,
            height: 36,
            minWidth: 36,
          }}
        >
          <svg width={36} height={36} viewBox="0 0 36 36">
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
              strokeLinecap="round"
              strokeDasharray={`${(progressPercent / 100) * 94.25} 94.25`}
              transform="rotate(-90 18 18)"
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          </svg>
          <Typography
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: "0.55rem",
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            {progressPercent}%
          </Typography>
        </Box>

        {/* Current step info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: "0.82rem",
              fontWeight: 500,
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
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

        {/* Expand chevron */}
        <ExpandMoreIcon
          sx={{
            color: "var(--muted)",
            fontSize: 20,
            transition: "transform 200ms",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </Box>

      {/* Expanded step list */}
      <Collapse in={expanded}>
        <Box sx={{ borderTop: "1px solid var(--sand)", px: 1, py: 1 }}>
          {steps.map((step, index) => {
            const isActive = step.key === activeStepKey;
            const isComplete = step.status === "complete";

            return (
              <Box
                key={step.key}
                onClick={() => {
                  onStepClick(step.key);
                  setExpanded(false);
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  px: 1.5,
                  py: 1,
                  borderRadius: 1,
                  cursor: "pointer",
                  bgcolor: isActive ? "var(--uwc-maroon-soft)" : "transparent",
                  "&:hover": {
                    bgcolor: isActive ? "var(--uwc-maroon-soft)" : "rgba(0,0,0,0.03)",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    minWidth: 22,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.6rem",
                    fontWeight: 600,
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
                <Typography
                  sx={{
                    flex: 1,
                    fontSize: "0.78rem",
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? "var(--uwc-maroon)" : isComplete ? "var(--ink)" : "var(--muted)",
                  }}
                >
                  {step.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
