"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";
import type { AppRole } from "@/types/domain";
import {
  clearSupabaseBrowserSessionCache,
  getSupabaseBrowserClient,
  resetSupabaseBrowserClient,
} from "@/lib/supabase/browser";
import { ThemeModeToggle } from "@/components/theme-mode-toggle";

export function TopNav({ role }: { role: AppRole }) {
  const router = useRouter();

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    clearSupabaseBrowserSessionCache();
    resetSupabaseBrowserClient();
    router.push("/login");
    router.refresh();
  }

  return (
    <AppBar position="sticky" color="inherit" elevation={0}>
      <Toolbar sx={{ minHeight: { xs: 64, sm: 72 }, px: { xs: 1.5, sm: 2.5 }, gap: { xs: 0.5, sm: 1 } }}>
        <Typography
          variant="h6"
          noWrap
          sx={{
            fontFamily: "var(--font-newsreader), 'Newsreader', Georgia, serif",
            fontWeight: 500,
            color: "var(--uwc-maroon)",
            fontSize: { xs: "1.05rem", sm: "1.375rem" },
            letterSpacing: "-0.01em",
          }}
        >
          UWC Selection
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Box
          component="nav"
          sx={{
            display: "flex",
            gap: { xs: 0, sm: 1 },
            mr: { xs: 0.5, sm: 2 },
          }}
        >
          {role === "admin" ? (
            <>
              <NavLink href="/admin" label="Procesos" />
              <NavLink href="/admin/audit" label="Auditoría" />
            </>
          ) : (
            <NavLink href="/applicant" label="Procesos" />
          )}
        </Box>
        <Box sx={{ mr: { xs: 0.5, sm: 1.5 } }}>
          <ThemeModeToggle />
        </Box>
        <Typography
          variant="body2"
          sx={{
            mr: { xs: 0, sm: 2 },
            px: 1.5,
            py: 0.5,
            color: "var(--muted)",
            fontSize: "0.8125rem",
            backgroundColor: "var(--cream)",
            borderRadius: "4px",
            display: { xs: "none", sm: "inline-flex" },
          }}
        >
          {role === "admin" ? "Admin" : "Postulante"}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={logout}
          sx={{
            borderColor: "var(--sand)",
            color: "var(--ink)",
            fontWeight: 500,
            minWidth: { xs: "unset", sm: "auto" },
            px: { xs: 1.2, sm: 1.75 },
            "&:hover": {
              borderColor: "var(--muted)",
              backgroundColor: "var(--cream)",
            },
          }}
        >
          Cerrar sesión
        </Button>
      </Toolbar>
    </AppBar>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Button
      component={Link}
      href={href}
      variant="text"
      size="small"
      sx={{
        color: "var(--muted)",
        fontWeight: 500,
        px: { xs: 1, sm: 2 },
        minWidth: { xs: 64, sm: 88 },
        "&:hover": {
          color: "var(--ink)",
          backgroundColor: "var(--cream)",
        },
        // Remove the underline from nav links
        "&::after": {
          display: "none",
        },
      }}
    >
      {label}
    </Button>
  );
}
