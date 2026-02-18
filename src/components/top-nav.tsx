"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";
import type { AppRole } from "@/types/domain";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function TopNav({ role }: { role: AppRole }) {
  const router = useRouter();

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <AppBar position="sticky" color="inherit" elevation={0}>
      <Toolbar>
        <Typography
          variant="h6"
          sx={{
            fontFamily: "var(--font-newsreader), 'Newsreader', Georgia, serif",
            fontWeight: 500,
            color: "var(--uwc-maroon)",
            fontSize: "1.375rem",
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
            gap: 1,
            mr: 3,
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
        <Typography
          variant="body2"
          sx={{
            mr: 2,
            px: 1.5,
            py: 0.5,
            color: "var(--muted)",
            fontSize: "0.8125rem",
            backgroundColor: "var(--cream)",
            borderRadius: "4px",
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
        px: 2,
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
