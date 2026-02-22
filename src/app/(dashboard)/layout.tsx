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

  // For applicants, children render their own navigation and layout
  if (profile.role === "applicant") {
    return (
      <LanguageProvider canUseEnglish={canUseEnglish}>
        {children}
      </LanguageProvider>
    );
  }

  // For admin, use the standard TopNav and container layout
  return (
    <LanguageProvider canUseEnglish={canUseEnglish}>
      <TopNav role={profile.role} />
      <main style={{ paddingTop: 72 }}>
        {children}
      </main>
    </LanguageProvider>
  );
}
