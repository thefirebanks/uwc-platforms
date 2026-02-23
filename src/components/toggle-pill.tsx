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
  yesLabel = "S\u00ed",
  noLabel = "No",
  disabled = false,
}: TogglePillProps) {
  const normalised = value.trim().toLowerCase();
  const yesNorm = yesLabel.trim().toLowerCase();
  const noNorm = noLabel.trim().toLowerCase();
  const isYes =
    normalised === yesNorm || normalised === "si" || normalised === "s\u00ed" || normalised === "yes";
  const isNo = normalised === noNorm || normalised === "no";

  function handleSelect(next: string) {
    if (disabled) return;
    onChange(next);
    onBlur?.();
  }

  return (
    <Box
      sx={{
        display: "inline-flex",
        gap: 0,
        border: "1.5px solid var(--sand)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        width: "fit-content",
        opacity: disabled ? 0.78 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={() => handleSelect(yesLabel)}
        aria-pressed={isYes}
        sx={{
          px: "20px",
          py: "8px",
          fontFamily: "var(--font-body)",
          fontSize: "0.82rem",
          fontWeight: isYes ? 500 : 400,
          lineHeight: 1.2,
          border: "none",
          cursor: "pointer",
          background: isYes ? "var(--uwc-maroon)" : "var(--surface, #fff)",
          color: isYes ? "#fff" : "var(--ink-light, #5A5450)",
          transition: "all 0.2s ease",
          boxShadow: isYes ? "none" : "inset -1px 0 0 var(--sand)",
          "&:hover": isYes
            ? {}
            : { background: "var(--cream)" },
          "&:focus-visible": {
            outline: "none",
            boxShadow: "inset 0 0 0 2px rgba(154, 37, 69, 0.2)",
          },
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
        aria-pressed={isNo}
        sx={{
          px: "20px",
          py: "8px",
          fontFamily: "var(--font-body)",
          fontSize: "0.82rem",
          fontWeight: isNo ? 500 : 400,
          lineHeight: 1.2,
          border: "none",
          cursor: "pointer",
          background: isNo ? "var(--uwc-maroon)" : "var(--surface, #fff)",
          color: isNo ? "#fff" : "var(--ink-light, #5A5450)",
          transition: "all 0.2s ease",
          boxShadow: isNo ? "none" : "inset 1px 0 0 var(--sand)",
          "&:hover": isNo
            ? {}
            : { background: "var(--cream)" },
          "&:focus-visible": {
            outline: "none",
            boxShadow: "inset 0 0 0 2px rgba(154, 37, 69, 0.2)",
          },
        }}
      >
        <Typography component="span" sx={{ fontSize: "inherit", fontWeight: "inherit", color: "inherit" }}>
          {noLabel}
        </Typography>
      </Box>
    </Box>
  );
}
