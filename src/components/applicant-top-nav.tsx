"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import LanguageIcon from "@mui/icons-material/Language";
import { useAppLanguage } from "@/components/language-provider";
import { useThemeMode } from "@/components/app-theme-provider";
import {
  clearSupabaseBrowserSessionCache,
  getSupabaseBrowserClient,
  resetSupabaseBrowserClient,
} from "@/lib/supabase/browser";

export function ApplicantTopNav({
  draftStatusLabel,
  draftStatusDot,
  modeStatusLabel,
  modeStatusDot,
}: {
  draftStatusLabel?: string;
  draftStatusDot?: "success" | "warning" | "error" | "info";
  modeStatusLabel?: string;
  modeStatusDot?: "success" | "warning" | "error" | "info";
}) {
  const router = useRouter();
  const { t, language, setLanguage, canUseEnglish } = useAppLanguage();
  const { mode, toggleMode } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(anchorEl);

  const isDark = mode === "dark";
  const getDotColor = (dot?: "success" | "warning" | "error" | "info") =>
    dot === "success"
      ? "var(--success)"
      : dot === "warning"
        ? "var(--warning)"
        : dot === "error"
          ? "#DC2626"
          : "var(--uwc-blue)";

  const draftDotColor = getDotColor(draftStatusDot);
  const modeDotColor = getDotColor(modeStatusDot);

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    clearSupabaseBrowserSessionCache();
    resetSupabaseBrowserClient();
    router.push("/login");
    router.refresh();
  }

  function handleMenuOpen(event: React.MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  function handleMenuClose() {
    setAnchorEl(null);
  }

  function handleLanguageToggle() {
    setLanguage(language === "es" ? "en" : "es");
    handleMenuClose();
  }

  function handleThemeToggle() {
    toggleMode();
    handleMenuClose();
  }

  function handleLogout() {
    handleMenuClose();
    void logout();
  }

  return (
    <AppBar
      position="fixed"
      color="inherit"
      elevation={0}
      sx={{
        height: "var(--topbar-height)",
        borderBottom: "1px solid var(--sand)",
        backdropFilter: "blur(12px)",
        zIndex: 100,
      }}
    >
      <Toolbar
        sx={{
          minHeight: "var(--topbar-height) !important",
          height: "var(--topbar-height)",
          px: { xs: 2, sm: 3 },
        }}
      >
        {/* Brand - clickable to go to dashboard */}
        <Typography
          component={Link}
          href="/applicant"
          sx={{
            fontFamily: "var(--font-newsreader), 'Newsreader', Georgia, serif",
            fontWeight: 500,
            color: "var(--uwc-maroon) !important",
            fontSize: "1.05rem",
            letterSpacing: "-0.01em",
            textDecoration: "none",
            "&:hover": {
              opacity: 0.85,
            },
          }}
        >
          UWC Selection
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        {/* Draft status indicator */}
        {draftStatusLabel ? (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{ mr: 2, display: { xs: "none", sm: "flex" } }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: draftDotColor,
                animation: draftStatusDot === "info" ? "pulse-dot 2s ease infinite" : "none",
                "@keyframes pulse-dot": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0.3 },
                },
              }}
            />
            <Typography sx={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {draftStatusLabel}
            </Typography>
          </Stack>
        ) : null}

        {modeStatusLabel ? (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{ mr: 2, display: { xs: "none", md: "flex" } }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: modeDotColor,
              }}
            />
            <Typography sx={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {modeStatusLabel}
            </Typography>
          </Stack>
        ) : null}

        {/* User role badge */}
        <Typography
          sx={{
            fontSize: "0.8rem",
            color: "var(--ink-light)",
            px: 1.5,
            py: 0.75,
            borderRadius: "20px",
            bgcolor: "var(--cream)",
            border: "1px solid var(--sand)",
            mr: 1.5,
            display: { xs: "none", sm: "inline-flex" },
          }}
        >
          {t("nav.roleApplicant")}
        </Typography>

        {/* Hamburger menu button */}
        <IconButton
          onClick={handleMenuOpen}
          aria-label="Menu"
          aria-controls={isMenuOpen ? "nav-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={isMenuOpen ? "true" : undefined}
          sx={{
            border: "1px solid var(--sand)",
            borderRadius: "var(--radius)",
            color: "var(--ink)",
            "&:hover": {
              bgcolor: "var(--cream)",
              borderColor: "var(--muted)",
            },
          }}
        >
          <MenuIcon />
        </IconButton>

        {/* Dropdown menu */}
        <Menu
          id="nav-menu"
          anchorEl={anchorEl}
          open={isMenuOpen}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "right",
          }}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                minWidth: 180,
                bgcolor: "var(--surface)",
                border: "1px solid var(--sand)",
                boxShadow: "var(--shadow-md)",
              },
            },
          }}
        >
          {/* Language toggle */}
          {canUseEnglish ? (
            <MenuItem onClick={handleLanguageToggle}>
              <LanguageIcon sx={{ mr: 1.5, fontSize: 20, color: "var(--muted)" }} />
              <Typography sx={{ flex: 1 }}>
                {language === "es" ? "English" : "Espa\u00f1ol"}
              </Typography>
            </MenuItem>
          ) : null}

          {/* Theme toggle */}
          <MenuItem onClick={handleThemeToggle}>
            {isDark ? (
              <LightModeOutlinedIcon sx={{ mr: 1.5, fontSize: 20, color: "var(--muted)" }} />
            ) : (
              <DarkModeOutlinedIcon sx={{ mr: 1.5, fontSize: 20, color: "var(--muted)" }} />
            )}
            <Typography sx={{ flex: 1 }}>
              {isDark
                ? language === "es"
                  ? "Modo claro"
                  : "Light mode"
                : language === "es"
                  ? "Modo oscuro"
                  : "Dark mode"}
            </Typography>
          </MenuItem>

          <Divider sx={{ my: 0.5 }} />

          {/* Logout */}
          <MenuItem onClick={handleLogout}>
            <LogoutIcon sx={{ mr: 1.5, fontSize: 20, color: "var(--muted)" }} />
            <Typography>{t("nav.logout")}</Typography>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
