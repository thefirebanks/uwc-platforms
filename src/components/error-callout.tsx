"use client";

import { useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useAppLanguage } from "@/components/language-provider";

export function ErrorCallout({
  title,
  message,
  errorId,
  context,
}: {
  title?: string;
  message: string;
  errorId?: string;
  context: string;
}) {
  const { t } = useAppLanguage();
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function reportIssue() {
    if (!errorId) {
      return;
    }

    setIsSubmitting(true);
    await fetch("/api/errors/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errorId, context, notes }),
    });
    setIsSubmitting(false);
    setSubmitted(true);
  }

  return (
    <Alert severity="error" sx={{ borderRadius: 2 }}>
      <AlertTitle>{title ?? t("error.defaultTitle")}</AlertTitle>
      <Stack spacing={1.5}>
        <Typography>{message}</Typography>
        {errorId ? (
          <Typography variant="body2" fontFamily="monospace">
            Error ID: {errorId}
          </Typography>
        ) : null}
        {errorId ? (
          <Box>
            <TextField
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              size="small"
              label={t("error.commentLabel")}
              fullWidth
            />
            <Button
              sx={{ mt: 1 }}
              onClick={reportIssue}
              disabled={isSubmitting || submitted}
              variant="outlined"
              color="error"
            >
              {submitted ? t("error.reportSent") : t("error.reportIssue")}
            </Button>
          </Box>
        ) : null}
      </Stack>
    </Alert>
  );
}
