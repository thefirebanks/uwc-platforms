"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import type { AppLanguage } from "@/lib/i18n/messages";
import { fetchApi, ApiRequestError } from "@/lib/client/api-client";

const COPY = {
  es: {
    title: "Perfil",
    subtitle: "Actualiza tu nombre público.",
    nameLabel: "Nombre",
    emailLabel: "Correo",
    cancel: "Cancelar",
    save: "Guardar",
    saving: "Guardando...",
    nameRequired: "El nombre es obligatorio.",
    saveFailed: "No se pudo guardar el perfil.",
  },
  en: {
    title: "Profile",
    subtitle: "Update your display name.",
    nameLabel: "Name",
    emailLabel: "Email",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    nameRequired: "Name is required.",
    saveFailed: "Could not save profile.",
  },
} as const;

export function ProfileSettingsDialog({
  open,
  language,
  initialName,
  email,
  onClose,
  onProfileUpdated,
}: {
  open: boolean;
  language: AppLanguage;
  initialName?: string | null;
  email?: string | null;
  onClose: () => void;
  onProfileUpdated?: (nextName: string) => void;
}) {
  const copy = useMemo(() => (language === "en" ? COPY.en : COPY.es), [language]);
  const [nameValue, setNameValue] = useState(initialName?.trim() ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setNameValue(initialName?.trim() ?? "");
    setErrorMessage(null);
    setIsSaving(false);
  }, [initialName, open]);

  async function handleSave() {
    const trimmedName = nameValue.trim();
    if (!trimmedName) {
      setErrorMessage(copy.nameRequired);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload = await fetchApi<{ fullName?: string }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ fullName: trimmedName }),
      });

      const nextName =
        typeof payload?.fullName === "string" && payload.fullName.trim()
          ? payload.fullName.trim()
          : trimmedName;
      onProfileUpdated?.(nextName);
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.userMessage);
      } else {
        setErrorMessage(error instanceof Error ? error.message : copy.saveFailed);
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={isSaving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="profile-settings-title"
      slotProps={{
        paper: {
          sx: {
            bgcolor: "var(--surface)",
            border: "1px solid var(--sand)",
            boxShadow: "var(--shadow-md)",
          },
        },
      }}
    >
      <DialogTitle id="profile-settings-title" sx={{ fontWeight: 700 }}>
        {copy.title}
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <Stack spacing={2}>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.84rem" }}>{copy.subtitle}</p>
          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
          <TextField
            label={copy.nameLabel}
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            autoFocus
            fullWidth
            disabled={isSaving}
          />
          <TextField
            label={copy.emailLabel}
            value={email ?? ""}
            fullWidth
            disabled
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={isSaving}>
          {copy.cancel}
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? copy.saving : copy.save}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
