"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const devBypassEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS === "true";
const demoAdminEmail = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL;
const demoApplicantEmail = process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL;
const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loginWithGoogle() {
    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (oauthError) {
        setError("No se pudo iniciar sesión con Google. Revisa la configuración OAuth en Supabase.");
      }
    } catch {
      setError("Error inesperado al iniciar sesión con Google.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function loginWithDemo(role: "admin" | "applicant") {
    if (!demoPassword || !demoAdminEmail || !demoApplicantEmail) {
      setError("Faltan variables de bypass de desarrollo.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const email = role === "admin" ? demoAdminEmail : demoApplicantEmail;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: demoPassword,
      });

      if (signInError) {
        setError(
          `No se pudo iniciar sesión en bypass. Verifica usuarios demo. (${signInError.code ?? "auth_error"}: ${signInError.message})`,
        );
        return;
      }

      router.push(role === "admin" ? "/admin" : "/applicant");
      router.refresh();
    } catch {
      setError("Error inesperado en bypass de desarrollo.");
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
              Autenticación oficial del MVP: Google OAuth con Supabase.
            </Typography>

            {error ? <Alert severity="error">{error}</Alert> : null}

            <Button
              onClick={loginWithGoogle}
              disabled={isSubmitting}
              variant="contained"
              startIcon={<GoogleIcon />}
            >
              Continuar con Google
            </Button>

            {devBypassEnabled ? (
              <>
                <Divider />
                <Typography variant="body2" color="text.secondary">
                  Bypass temporal de desarrollo (desactivar en producción).
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button
                    variant="outlined"
                    onClick={() => loginWithDemo("admin")}
                    disabled={isSubmitting}
                  >
                    Entrar como admin demo
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => loginWithDemo("applicant")}
                    disabled={isSubmitting}
                  >
                    Entrar como postulante demo
                  </Button>
                </Stack>
              </>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
