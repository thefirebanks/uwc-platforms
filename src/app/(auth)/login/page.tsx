"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin.demo@uwcperu.org");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function login() {
    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("No se pudo iniciar sesión. Verifica correo y contraseña.");
        return;
      }

      const meResponse = await fetch("/api/me");
      const meData = await meResponse.json();

      if (!meResponse.ok) {
        setError(meData.message ?? "No se pudo obtener tu rol de usuario.");
        return;
      }

      router.push(meData.role === "admin" ? "/admin" : "/applicant");
      router.refresh();
    } catch {
      setError("Error inesperado al iniciar sesión.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 10 }}>
      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <Typography variant="h4">Iniciar sesión</Typography>
            <Typography color="text.secondary">
              Usa una cuenta de admin o postulante para probar el MVP.
            </Typography>

            {error ? <Alert severity="error">{error}</Alert> : null}

            <TextField
              label="Correo"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              fullWidth
            />
            <TextField
              label="Contraseña"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              fullWidth
            />

            <Button onClick={login} disabled={isSubmitting} variant="contained">
              Ingresar
            </Button>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#FFF7ED" }}>
              <Typography color="#9A3412" variant="body2">
                Demo local sugerida: admin.demo@uwcperu.org / ChangeMe123!
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
