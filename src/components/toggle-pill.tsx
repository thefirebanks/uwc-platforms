"use client";

import { Box, Typography } from "@mui/material";

interface TogglePillProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  yesLabel?: string;
  noLabel?: string;
  disabled?: boolean;
}

export function TogglePill({
  value,
  onChange,
  onBlur,
  yesLabel = "Si",
  noLabel = "No",
  disabled = false,
}: TogglePillProps) {
  const normalised = value.trim().toLowerCase();
  const isYes = normalised === "si" || normalised === "sí" || normalised === "yes";
  const isNo = normalised === "no";

  function handleSelect(next: string) {
    if (disabled) return;
    onChange(next);
    onBlur?.();
  }

  return (
    <Box
      sx={{
        display: "flex",
        gap: 0,
        border: "1.5px solid var(--sand)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        width: "fit-content",
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={() => handleSelect(yesLabel)}
        sx={{
          px: "20px",
          py: "8px",
          fontFamily: "var(--font-body)",
          fontSize: "0.82rem",
          fontWeight: isYes ? 500 : 400,
          border: "none",
          cursor: "pointer",
          background: isYes ? "var(--uwc-maroon)" : "var(--surface, #fff)",
          color: isYes ? "#fff" : "var(--ink-light, #5A5450)",
          transition: "all 0.2s ease",
          "&:hover": isYes
            ? {}
            : { background: "var(--cream)" },
        }}
      >
        <Typography component="span" sx={{ fontSize: "inherit", fontWeight: "inherit", color: "inherit" }}>
          {yesLabel}
        </Typography>
      </Box>
      <Box
        component="button"
        type="button"
        onClick={() => handleSelect(noLabel)}
        sx={{
          px: "20px",
          py: "8px",
          fontFamily: "var(--font-body)",
          fontSize: "0.82rem",
          fontWeight: isNo ? 500 : 400,
          border: "none",
          borderLeft: "1.5px solid var(--sand)",
          cursor: "pointer",
          background: isNo ? "var(--uwc-maroon)" : "var(--surface, #fff)",
          color: isNo ? "#fff" : "var(--ink-light, #5A5450)",
          transition: "all 0.2s ease",
          "&:hover": isNo
            ? {}
            : { background: "var(--cream)" },
        }}
      >
        <Typography component="span" sx={{ fontSize: "inherit", fontWeight: "inherit", color: "inherit" }}>
          {noLabel}
        </Typography>
      </Box>
    </Box>
  );
}
