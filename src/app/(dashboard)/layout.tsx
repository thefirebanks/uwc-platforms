import { Container } from "@mui/material";
import { LanguageProvider } from "@/components/language-provider";
import { TopNav } from "@/components/top-nav";
import { canUseEnglishLanguageToggle } from "@/lib/i18n/access";
import { getSessionProfileOrRedirect } from "@/lib/server/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfileOrRedirect();
  const canUseEnglish = canUseEnglishLanguageToggle({
    role: profile.role,
    email: profile.email,
  });

  return (
    <LanguageProvider canUseEnglish={canUseEnglish}>
      <TopNav role={profile.role} />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {children}
      </Container>
    </LanguageProvider>
  );
}
