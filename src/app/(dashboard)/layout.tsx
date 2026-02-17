import { Container } from "@mui/material";
import { TopNav } from "@/components/top-nav";
import { getSessionProfileOrRedirect } from "@/lib/server/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfileOrRedirect();

  return (
    <>
      <TopNav role={profile.role} />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {children}
      </Container>
    </>
  );
}
