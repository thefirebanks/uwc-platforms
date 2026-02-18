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
        <Typography variant="h6" fontWeight={700}>
          UWC Peru Selection Platform
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" sx={{ mr: 2 }}>
          Modo: {role === "admin" ? "Admin" : "Postulante"}
        </Typography>
        {role === "admin" ? (
          <>
            <Button component={Link} href="/admin" variant="text" sx={{ mr: 1 }}>
              Procesos
            </Button>
            <Button component={Link} href="/admin/audit" variant="text" sx={{ mr: 2 }}>
              Auditoría
            </Button>
          </>
        ) : (
          <Button component={Link} href="/applicant" variant="text" sx={{ mr: 2 }}>
            Procesos
          </Button>
        )}
        <Button variant="outlined" onClick={logout}>
          Cerrar sesión
        </Button>
      </Toolbar>
    </AppBar>
  );
}
