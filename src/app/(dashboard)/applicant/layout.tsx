import { LanguageProvider } from "@/components/language-provider";
import { canUseEnglishLanguageToggle } from "@/lib/i18n/access";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { Box } from "@mui/material";

export default async function ApplicantLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfileOrRedirect();
  const canUseEnglish = canUseEnglishLanguageToggle({
    role: profile.role,
    email: profile.email,
  });

  return (
    <LanguageProvider canUseEnglish={canUseEnglish}>
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "var(--paper)",
        }}
      >
        {children}
      </Box>
    </LanguageProvider>
  );
}
