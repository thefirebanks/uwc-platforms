"use client";

import { Button, ButtonGroup, Stack, Typography } from "@mui/material";
import { useAppLanguage } from "@/components/language-provider";

export function LanguageToggle() {
  const { canUseEnglish, language, setLanguage, t } = useAppLanguage();

  if (!canUseEnglish) {
    return null;
  }

  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 600 }}>
        {t("language.label")}
      </Typography>
      <ButtonGroup variant="outlined" size="small" aria-label={t("language.label")}>
        <Button
          aria-pressed={language === "es"}
          variant={language === "es" ? "contained" : "outlined"}
          onClick={() => setLanguage("es")}
        >
          {t("language.es")}
        </Button>
        <Button
          aria-pressed={language === "en"}
          variant={language === "en" ? "contained" : "outlined"}
          onClick={() => setLanguage("en")}
        >
          {t("language.en")}
        </Button>
      </ButtonGroup>
    </Stack>
  );
}
