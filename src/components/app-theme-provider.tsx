"use client";

import { ThemeProvider, CssBaseline } from "@mui/material";
import { appTheme } from "@/styles/theme";

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
