"use client";

import Link from "next/link";
import { Box, Button, Container, Paper, Stack, Typography } from "@mui/material";

export default function HomePage() {
  return (
    <Container maxWidth="lg" sx={{ py: 10 }}>
      <Paper sx={{ p: { xs: 3, md: 6 } }}>
        <Stack spacing={3}>
          <Typography variant="h2">UWC Peru Selection Platform</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 780 }}>
            Plataforma ligera y moderna para gestionar postulaciones, validaciones y avance de
            etapas del comité nacional de UWC Perú.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button
              component={Link}
              href="/login"
              variant="contained"
              sx={{ color: "#FFFFFF !important", "&:hover": { color: "#FFFFFF !important" } }}
            >
              Iniciar sesión
            </Button>
            <Button component={Link} href="/login?mode=applicant" variant="outlined">
              Ir a modo postulante
            </Button>
            <Button component={Link} href="/login?mode=admin" variant="outlined">
              Ir a modo admin
            </Button>
          </Stack>
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#ECFEFF" }}>
            <Typography color="#155E75">
              MVP incluye 2 etapas: Stage 1 (documentos) y Stage 2 (placeholder de examen externo).
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}
