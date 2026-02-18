"use client";

import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import { IconButton, Tooltip } from "@mui/material";
import { useThemeMode } from "@/components/app-theme-provider";

export function ThemeModeToggle({ size = "small" }: { size?: "small" | "medium" | "large" }) {
  const { mode, toggleMode } = useThemeMode();
  const isDark = mode === "dark";

  return (
    <Tooltip title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>
      <IconButton
        size={size}
        onClick={toggleMode}
        aria-label="Alternar modo oscuro"
        sx={{
          border: "1px solid var(--sand)",
          color: "var(--ink)",
          backgroundColor: "var(--paper)",
          "&:hover": {
            backgroundColor: "var(--cream)",
            borderColor: "var(--muted)",
          },
        }}
      >
        {isDark ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
