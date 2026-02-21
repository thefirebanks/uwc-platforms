"use client";

import { Box, Button, CircularProgress } from "@mui/material";

export function ApplicantActionBar({
  onPrevious,
  onSaveDraft,
  onNext,
  previousLabel,
  saveDraftLabel,
  nextLabel,
  hasPrevious,
  hasNext,
  isSaving,
  isEditingEnabled,
}: {
  onPrevious: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
  previousLabel: string;
  saveDraftLabel: string;
  nextLabel: string;
  hasPrevious: boolean;
  hasNext: boolean;
  isSaving: boolean;
  isEditingEnabled: boolean;
}) {
  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 0,
        left: { xs: 0, md: "280px" },
        right: 0,
        bgcolor: "var(--surface, #FFFFFF)",
        borderTop: "1px solid var(--sand)",
        px: { xs: 2, sm: 4 },
        py: 1.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 50,
      }}
    >
      {/* Left group: Previous + Save */}
      <Box sx={{ display: "flex", gap: 1 }}>
        {hasPrevious ? (
          <Button
            variant="text"
            onClick={onPrevious}
            sx={{
              color: "var(--ink-light, #5A5450)",
              fontSize: "0.82rem",
              fontWeight: 500,
              px: 3,
              py: 1.25,
              "&:hover": { bgcolor: "var(--cream)" },
            }}
          >
            {previousLabel}
          </Button>
        ) : null}
        <Button
          variant="outlined"
          onClick={onSaveDraft}
          disabled={isSaving || !isEditingEnabled}
          sx={{
            bgcolor: "var(--cream)",
            color: "var(--ink-light, #5A5450)",
            borderColor: "var(--sand)",
            fontSize: "0.82rem",
            fontWeight: 500,
            px: 3,
            py: 1.25,
            "&:hover": {
              bgcolor: "var(--sand)",
              borderColor: "var(--sand)",
            },
          }}
        >
          {isSaving ? <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} /> : null}
          {saveDraftLabel}
        </Button>
      </Box>

      {/* Right: Next / Submit */}
      <Button
        variant="contained"
        onClick={onNext}
        disabled={!hasNext}
        sx={{
          bgcolor: "var(--uwc-maroon)",
          color: "#FFFFFF",
          fontSize: "0.82rem",
          fontWeight: 500,
          px: 3,
          py: 1.25,
          "&:hover": {
            bgcolor: "var(--uwc-maroon-dark, #7D1E38)",
          },
          "&.Mui-disabled": {
            bgcolor: "var(--sand)",
            color: "var(--muted)",
          },
        }}
      >
        {nextLabel}
      </Button>
    </Box>
  );
}
