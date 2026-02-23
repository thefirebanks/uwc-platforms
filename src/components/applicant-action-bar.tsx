"use client";

import { Box, Button, CircularProgress, Stack } from "@mui/material";

export function ApplicantActionBar({
  onPrevious,
  onSaveDraft,
  onNext,
  onToggleEdit,
  previousLabel,
  saveDraftLabel,
  nextLabel,
  editLabel,
  hasPrevious,
  hasNext,
  isSaving,
  isEditingEnabled,
  hasPendingChanges = false,
  showEditToggle = false,
  isEditToggleDisabled = false,
  sidebarVisibleDesktop = true,
}: {
  onPrevious: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
  onToggleEdit?: () => void;
  previousLabel: string;
  saveDraftLabel: string;
  nextLabel: string;
  editLabel?: string;
  hasPrevious: boolean;
  hasNext: boolean;
  isSaving: boolean;
  isEditingEnabled: boolean;
  hasPendingChanges?: boolean;
  showEditToggle?: boolean;
  isEditToggleDisabled?: boolean;
  sidebarVisibleDesktop?: boolean;
}) {
  const saveIsDisabled = isSaving || !isEditingEnabled;
  const emphasizeSave = !saveIsDisabled && hasPendingChanges;

  return (
    <Box
      data-testid="applicant-action-bar"
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        bgcolor: "background.paper",
        borderTop: "1px solid var(--sand)",
        py: 1.5,
        px: { xs: 2, sm: 4 },
        zIndex: 50,
        transition: "left 220ms ease",
        "@media (min-width: 769px)": {
          left: sidebarVisibleDesktop ? "var(--sidebar-width, 280px)" : 0,
        },
      }}
    >
      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        sx={{ maxWidth: 760, mx: "auto" }}
      >
        <Stack direction="row" spacing={1}>
          <Button
            variant="text"
            onClick={onPrevious}
            disabled={!hasPrevious}
            sx={{
              color: "var(--muted)",
              fontWeight: 500,
              visibility: hasPrevious ? "visible" : "hidden",
              "&:hover": { bgcolor: "var(--cream)" },
              "&::after": { display: "none" },
            }}
          >
            {previousLabel}
          </Button>
          {showEditToggle && onToggleEdit && editLabel ? (
            <Button
              variant="text"
              onClick={onToggleEdit}
              disabled={isEditToggleDisabled}
              sx={{
                color: "var(--uwc-maroon)",
                fontWeight: 500,
                "&:hover": { bgcolor: "var(--uwc-maroon-soft)" },
              }}
            >
              {editLabel}
            </Button>
          ) : null}
          <Button
            variant="outlined"
            onClick={onSaveDraft}
            disabled={saveIsDisabled}
            sx={{
              bgcolor: emphasizeSave ? "var(--surface)" : "var(--cream)",
              borderColor: emphasizeSave ? "var(--uwc-maroon)" : "var(--sand)",
              color: saveIsDisabled ? "var(--muted)" : emphasizeSave ? "var(--uwc-maroon)" : "var(--ink)",
              fontWeight: 500,
              opacity: saveIsDisabled ? 0.72 : 1,
              "&:hover": {
                bgcolor: emphasizeSave ? "var(--uwc-maroon-soft)" : "rgba(0,0,0,0.03)",
                borderColor: emphasizeSave ? "var(--uwc-maroon)" : "var(--muted)",
              },
            }}
          >
            {isSaving ? (
              <CircularProgress size={16} color="inherit" sx={{ mr: 0.5 }} />
            ) : null}
            {saveDraftLabel}
          </Button>
        </Stack>
        <Button
          variant="contained"
          onClick={onNext}
          disabled={!hasNext}
          sx={{ fontWeight: 500 }}
        >
          {nextLabel}
        </Button>
      </Stack>
    </Box>
  );
}
