"use client";

import { Box, IconButton, Stack, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";

export type SidebarStep = {
  key: string;
  label: string;
  status: "complete" | "in_progress" | "not_started";
  statusLabel?: string;
};

export function ApplicantSidebar({
  processLabel,
  title,
  deadline,
  progressPercent,
  progressLabel,
  steps,
  activeStepKey,
  onStepClick,
  onHide,
  hideLabel,
  hiddenDesktop = false,
}: {
  processLabel: string;
  title: string;
  deadline?: string;
  progressPercent: number;
  progressLabel: string;
  steps: SidebarStep[];
  activeStepKey: string;
  onStepClick: (key: string) => void;
  onHide?: () => void;
  hideLabel?: string;
  hiddenDesktop?: boolean;
}) {

  return (
    <Box
      component="aside"
      data-testid="applicant-sidebar"
      sx={{
        position: "fixed",
        top: "var(--topbar-height)",
        left: 0,
        bottom: 0,
        width: 280,
        bgcolor: "var(--cream)",
        borderRight: "1px solid var(--sand)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        zIndex: 50,
        transform: hiddenDesktop ? "translateX(-100%)" : "translateX(0)",
        opacity: hiddenDesktop ? 0.92 : 1,
        pointerEvents: hiddenDesktop ? "none" : "auto",
        transition: "transform 220ms ease, opacity 180ms ease",
        willChange: "transform",
        "@media (max-width: 768px)": {
          display: "none",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          pr: onHide ? 7 : 2.5,
          pt: 3,
          pb: 2,
          borderBottom: "1px solid var(--sand)",
          position: "relative",
        }}
      >
        {onHide ? (
          <IconButton
            onClick={onHide}
            size="small"
            aria-label={hideLabel ?? "Hide sidebar"}
            sx={{
              position: "absolute",
              top: 10,
              right: 10,
              border: "1px solid var(--sand)",
              borderRadius: "var(--radius)",
              bgcolor: "var(--surface)",
              color: "var(--muted)",
              "&:hover": {
                bgcolor: "var(--cream)",
                borderColor: "var(--muted)",
                color: "var(--ink)",
              },
            }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        ) : null}
        <Typography
          sx={{
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--uwc-maroon)",
            mb: 0.5,
          }}
        >
          {processLabel}
        </Typography>
        <Typography
          sx={{
            fontFamily: "var(--font-display), var(--font-body), system-ui, sans-serif",
            fontSize: "1.25rem",
            fontWeight: 500,
            color: "var(--ink)",
            letterSpacing: "-0.02em",
            lineHeight: 1.3,
          }}
        >
          {title}
        </Typography>
        {deadline ? (
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1 }}>
            <AccessTimeIcon sx={{ fontSize: 14, color: "var(--muted)" }} />
            <Typography sx={{ fontSize: "0.72rem", color: "var(--muted)" }}>
              {deadline}
            </Typography>
          </Stack>
        ) : null}
      </Box>

      {/* Progress bar */}
      <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid var(--sand)" }}>
        <Box
          sx={{
            height: 3,
            bgcolor: "var(--sand)",
            borderRadius: 3,
            overflow: "hidden",
            mb: 0.75,
          }}
        >
          <Box
            sx={{
              height: "100%",
              borderRadius: 3,
              width: `${progressPercent}%`,
              background: "linear-gradient(90deg, var(--uwc-maroon), var(--uwc-blue))",
              transition: "width 500ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </Box>
        <Typography sx={{ fontSize: "0.7rem", color: "var(--muted)", textAlign: "right" }}>
          {progressLabel}
        </Typography>
      </Box>

      {/* Nav items */}
      <Box component="nav" sx={{ py: 1, flex: 1 }}>
        {steps.map((step, index) => {
          const isActive = step.key === activeStepKey;
          const isComplete = step.status === "complete";

          return (
            <Box
              key={step.key}
              component="button"
              role="button"
              data-testid={`sidebar-nav-${step.key}`}
              onClick={() => onStepClick(step.key)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 1.25,
                px: 2.5,
                width: "100%",
                textAlign: "left",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-body), system-ui, sans-serif",
                fontSize: "0.82rem",
                color: isActive
                  ? "var(--uwc-maroon)"
                  : step.status === "not_started"
                    ? "var(--muted)"
                    : "var(--ink)",
                fontWeight: isActive ? 500 : 400,
                bgcolor: isActive ? "var(--uwc-maroon-soft)" : "transparent",
                position: "relative",
                transition: "background-color 0.15s ease, color 0.15s ease",
                "&:hover": {
                  bgcolor: isActive ? "var(--uwc-maroon-soft)" : "rgba(0,0,0,0.03)",
                  color: "var(--ink)",
                },
                "&::before": isActive
                  ? {
                      content: '""',
                      position: "absolute",
                      left: 0,
                      top: 4,
                      bottom: 4,
                      width: 3,
                      borderRadius: "0 3px 3px 0",
                      bgcolor: "var(--uwc-maroon)",
                    }
                  : {},
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.65rem",
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
                  transition: "all 0.2s",
                }}
              >
                {isComplete ? <CheckIcon sx={{ fontSize: 12 }} /> : index + 1}
              </Box>

              <Typography
                component="span"
                sx={{ flex: 1, fontSize: "inherit", fontWeight: "inherit", color: "inherit" }}
              >
                {step.label}
              </Typography>

              {step.statusLabel && !isComplete ? (
                <Box
                  sx={{
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 0.5,
                    color: step.status === "in_progress" ? "var(--uwc-maroon)" : "var(--muted)",
                    bgcolor: step.status === "in_progress" ? "var(--uwc-maroon-soft)" : "var(--cream)",
                  }}
                >
                  {step.statusLabel}
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
