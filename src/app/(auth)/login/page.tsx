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
import {
  clearSupabaseBrowserSessionCache,
  getSupabaseBrowserClient,
  resetSupabaseBrowserClient,
} from "@/lib/supabase/browser";
import { ThemeModeToggle } from "@/components/theme-mode-toggle";

const devBypassEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS === "true";
const demoAdminEmail = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL;
const demoApplicantEmail = process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL;
const demoApplicant2Email =
  process.env.NEXT_PUBLIC_DEMO_APPLICANT_2_EMAIL ?? "applicant.demo2@uwcperu.org";
const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD;

const demoApplicantAccounts = [
  { key: "applicant_1", email: demoApplicantEmail, label: "Entrar como postulante demo 1" },
  { key: "applicant_2", email: demoApplicant2Email, label: "Entrar como postulante demo 2" },
].filter((account): account is { key: string; email: string; label: string } => Boolean(account.email));

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingDemo, setIsResettingDemo] = useState(false);

  async function loginWithGoogle() {
    setError(null);
    setSuccessMessage(null);
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

  async function loginWithDemo(role: "admin" | "applicant", applicantEmail?: string) {
    if (!demoPassword || !demoAdminEmail || demoApplicantAccounts.length === 0) {
      setError("Faltan variables de bypass de desarrollo.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      clearSupabaseBrowserSessionCache();
      resetSupabaseBrowserClient();
      const supabase = getSupabaseBrowserClient({ forceNew: true });
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      const email =
        role === "admin"
          ? demoAdminEmail
          : applicantEmail ?? demoApplicantAccounts[0]?.email ?? demoApplicantEmail;
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: demoPassword,
      });

      if (signInError && !signInData?.session) {
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

  async function resetDemoApplicantSubmission(email: string) {
    setError(null);
    setSuccessMessage(null);
    setIsResettingDemo(true);

    try {
      const response = await fetch("/api/dev/reset-demo-applicant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => null)) as
        | { message?: string; deletedByTable?: Record<string, number>; storage?: { warning?: string | null } }
        | null;

      if (!response.ok) {
        setError(body?.message ?? "No se pudo reiniciar la postulación demo.");
        return;
      }

      const deletedApplications = body?.deletedByTable?.applications ?? 0;
      const storageWarning = body?.storage?.warning;
      setSuccessMessage(
        storageWarning
          ? `${email}: postulación demo reiniciada (${deletedApplications} postulación/es). Nota de almacenamiento: ${storageWarning}`
          : `${email}: postulación demo reiniciada (${deletedApplications} postulación/es). Ya puedes entrar y empezar desde cero.`,
      );
    } catch {
      setError("Error inesperado al reiniciar la postulación demo.");
    } finally {
      setIsResettingDemo(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 10 }}>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <ThemeModeToggle />
      </Stack>
      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <Typography variant="h4">Iniciar sesión</Typography>

            {error ? <Alert severity="error">{error}</Alert> : null}
            {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}

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
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button
                    variant="outlined"
                    onClick={() => loginWithDemo("admin")}
                    disabled={isSubmitting || isResettingDemo}
                  >
                    Entrar como admin demo
                  </Button>
                </Stack>
                <Stack spacing={1.5}>
                  {demoApplicantAccounts.map((account) => (
                    <Stack
                      key={account.key}
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      <Button
                        variant="outlined"
                        onClick={() => loginWithDemo("applicant", account.email)}
                        disabled={isSubmitting || isResettingDemo}
                      >
                        {account.label}
                      </Button>
                      <Button
                        variant="text"
                        color="inherit"
                        onClick={() => resetDemoApplicantSubmission(account.email)}
                        disabled={isSubmitting || isResettingDemo}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        {isResettingDemo
                          ? `Reiniciando ${account.email}...`
                          : `Reiniciar ${account.email}`}
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
