"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectionProcess } from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";

type ProcessSummary = SelectionProcess & {
  applicationCount: number;
};

interface ApiError {
  message: string;
  errorId?: string;
}

function formatDate(value: string | null) {
  if (!value) {
    return "No configurada";
  }

  return new Date(value).toLocaleDateString();
}

export function AdminProcessesDashboard({
  initialProcesses,
}: {
  initialProcesses: ProcessSummary[];
}) {
  const router = useRouter();
  const [processes, setProcesses] = useState(initialProcesses);
  const [name, setName] = useState("Proceso de Selección 2027");
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [setAsActive, setSetAsActive] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const orderedProcesses = useMemo(
    () =>
      [...processes].sort((a, b) => {
        if (a.is_active !== b.is_active) {
          return a.is_active ? -1 : 1;
        }
        return b.created_at.localeCompare(a.created_at);
      }),
    [processes],
  );

  async function createProcess() {
    setError(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const parsedYear = Number.parseInt(year, 10);
      const response = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          year: parsedYear,
          isActive: setAsActive,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      const created = body.cycle as SelectionProcess;
      setProcesses((current) => [{ ...created, applicationCount: 0 }, ...current]);
      setStatusMessage("Proceso creado correctamente.");
      setName(`Proceso de Selección ${parsedYear + 1}`);
      setYear(String(parsedYear + 1));
      setSetAsActive(false);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function activateProcess(id: string) {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/cycles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    const updated = body.cycle as SelectionProcess;
    setProcesses((current) =>
      current.map((process) =>
        process.id === id ? { ...process, is_active: true } : { ...process, is_active: false },
      ),
    );
    setStatusMessage(`Proceso activo actualizado: ${updated.name}`);
    router.refresh();
  }

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h5">Dashboard de procesos de selección</Typography>
          <Typography color="text.secondary">
            Crea y gestiona procesos anuales. Desde cada proceso puedes configurar fechas y revisar postulaciones.
          </Typography>
        </CardContent>
      </Card>

      {error ? <ErrorCallout message={error.message} errorId={error.errorId} context="admin_processes" /> : null}

      {statusMessage ? (
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#DBEAFE" }}>
          <Typography color="#1D4ED8">{statusMessage}</Typography>
        </Box>
      ) : null}

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Crear nuevo proceso
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
            <TextField
              label="Nombre del proceso"
              value={name}
              onChange={(event) => setName(event.target.value)}
              fullWidth
            />
            <TextField
              label="Año"
              type="number"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              sx={{ minWidth: 140 }}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Switch checked={setAsActive} onChange={(event) => setSetAsActive(event.target.checked)} />
              <Typography>Activar al crear</Typography>
            </Stack>
            <Button variant="contained" onClick={createProcess} disabled={isSubmitting}>
              Crear proceso
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Procesos disponibles
          </Typography>
          <Stack spacing={2}>
            {orderedProcesses.map((process) => (
              <Box
                key={process.id}
                sx={{
                  border: "1px solid #E5E7EB",
                  borderRadius: 2,
                  p: 2,
                }}
              >
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1}
                  justifyContent="space-between"
                  alignItems={{ md: "center" }}
                >
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {process.name} {process.is_active ? "(Activo)" : ""}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Postulaciones: {process.applicationCount}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Stage 1: {formatDate(process.stage1_open_at)} - {formatDate(process.stage1_close_at)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Stage 2: {formatDate(process.stage2_open_at)} - {formatDate(process.stage2_close_at)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button component={Link} href={`/admin/process/${process.id}`} variant="outlined">
                      Gestionar proceso
                    </Button>
                    {!process.is_active ? (
                      <Button variant="text" onClick={() => activateProcess(process.id)}>
                        Marcar activo
                      </Button>
                    ) : null}
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
