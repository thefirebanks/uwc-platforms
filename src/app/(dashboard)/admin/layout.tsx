import { Container } from "@mui/material";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {children}
    </Container>
  );
}
