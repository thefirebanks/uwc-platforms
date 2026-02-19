"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type {
  Application,
  ApplicationOcrCheck,
  CommunicationLog,
  CycleStageTemplate,
  SelectionProcess,
  StageCode,
} from "@/types/domain";
import { StageBadge } from "@/components/stage-badge";
import { ErrorCallout } from "@/components/error-callout";
import { canTransition } from "@/lib/stages/transition";

interface ApiError {
  message: string;
  errorId?: string;
}

const EMPTY_COMMUNICATION_SUMMARY = {
  queued: 0,
  processing: 0,
  sent: 0,
  failed: 0,
  total: 0,
};

function toDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function toIsoDate(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : undefined;
}

function formatDate(value: string | null) {
  if (!value) {
    return "No configurada";
  }

  return new Date(value).toLocaleDateString();
}

function getApplicationFiles(application: Application) {
  const files = (application.files as Record<string, unknown> | undefined) ?? {};
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(files)) {
    if (typeof value === "string") {
      normalized[key] = value;
      continue;
    }

    if (value && typeof value === "object" && typeof (value as Record<string, unknown>).path === "string") {
      normalized[key] = (value as Record<string, unknown>).path as string;
    }
  }

  return normalized;
}

function getDefaultOcrFileKey(application: Application) {
  const files = getApplicationFiles(application);
  if (files.identificationDocument) {
    return "identificationDocument";
  }

  const keys = Object.keys(files).filter((key) => Boolean(files[key]));
  return keys[0] ?? null;
}

export function AdminDashboard({
  initialApplications,
  cycleTemplates,
  cycle,
}: {
  initialApplications: Application[];
  cycleTemplates: CycleStageTemplate[];
  cycle: SelectionProcess;
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [templates, setTemplates] = useState(cycleTemplates);
  const [error, setError] = useState<ApiError | null>(null);
  const [csvData, setCsvData] = useState("applicant_email,score,passed\napplicant.demo@uwcperu.org,15.7,true");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [stage1OpenAt, setStage1OpenAt] = useState(toDateInputValue(cycle.stage1_open_at));
  const [stage1CloseAt, setStage1CloseAt] = useState(toDateInputValue(cycle.stage1_close_at));
  const [stage2OpenAt, setStage2OpenAt] = useState(toDateInputValue(cycle.stage2_open_at));
  const [stage2CloseAt, setStage2CloseAt] = useState(toDateInputValue(cycle.stage2_close_at));
  const [communications, setCommunications] = useState<CommunicationLog[]>([]);
  const [communicationSummary, setCommunicationSummary] = useState({ ...EMPTY_COMMUNICATION_SUMMARY });
  const [isCommunicationLoading, setIsCommunicationLoading] = useState(false);
  const [processingTargetStatus, setProcessingTargetStatus] = useState<"queued" | "failed" | null>(null);
  const [ocrLoadingApplicationId, setOcrLoadingApplicationId] = useState<string | null>(null);
  const [selectedOcrApplicationId, setSelectedOcrApplicationId] = useState<string | null>(null);
  const [ocrChecks, setOcrChecks] = useState<ApplicationOcrCheck[]>([]);
  const [isOcrHistoryLoading, setIsOcrHistoryLoading] = useState(false);

  const orderedApplications = useMemo(
    () => [...applications].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [applications],
  );
  const statusRollup = useMemo(() => {
    const counts: Record<Application["status"], number> = {
      draft: 0,
      submitted: 0,
      eligible: 0,
      ineligible: 0,
      advanced: 0,
    };

    for (const application of applications) {
      counts[application.status] += 1;
    }

    return counts;
  }, [applications]);
  const stageRollup = useMemo(() => {
    const counts: Record<StageCode, number> = {
      documents: 0,
      exam_placeholder: 0,
    };

    for (const application of applications) {
      counts[application.stage_code] += 1;
    }

    return counts;
  }, [applications]);

  async function refreshData() {
    const response = await fetch(`/api/applications?cycleId=${cycle.id}`);
    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setApplications(body.applications ?? []);
  }

  async function refreshCommunications() {
    setError(null);
    setIsCommunicationLoading(true);

    try {
      const response = await fetch(`/api/communications?cycleId=${cycle.id}&limit=8`);
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setCommunications(body.logs ?? []);
      setCommunicationSummary({
        ...EMPTY_COMMUNICATION_SUMMARY,
        ...(body.summary ?? {}),
      });
    } finally {
      setIsCommunicationLoading(false);
    }
  }

  async function saveStageTemplates() {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/cycles/${cycle.id}/templates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templates: templates.map((template) => ({
          id: template.id,
          stageLabel: template.stage_label,
          milestoneLabel: template.milestone_label,
          dueAt: template.due_at,
          sortOrder: template.sort_order,
        })),
      }),
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setTemplates(body.templates ?? []);
    setStatusMessage("Plantillas de etapa actualizadas.");
  }

  async function saveStageConfiguration() {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/cycles/${cycle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage1OpenAt: toIsoDate(stage1OpenAt),
        stage1CloseAt: toIsoDate(stage1CloseAt),
        stage2OpenAt: toIsoDate(stage2OpenAt),
        stage2CloseAt: toIsoDate(stage2CloseAt),
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage("Fechas del proceso actualizadas.");
  }

  async function validateApplication(applicationId: string, status: "eligible" | "ineligible") {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/applications/${applicationId}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes: "Revisión manual del comité." }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage("Validación guardada.");
    await refreshData();
  }

  async function transition(applicationId: string, toStage: StageCode) {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/applications/${applicationId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toStage,
        reason: "Cambio ejecutado desde panel admin.",
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage("Etapa actualizada.");
    await refreshData();
  }

  async function importExamCsv() {
    setError(null);
    setStatusMessage(null);

    const response = await fetch("/api/exam-imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvData }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage(
      `Simulación completada: ${body.imported} filas válidas, ${body.skipped} omitidas (sin guardar).`,
    );
  }

  async function sendStatusEmails() {
    setError(null);
    setStatusMessage(null);

    const response = await fetch("/api/communications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cycleId: cycle.id,
        stageCode: "documents",
        triggerEvent: "stage_result",
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage(`Comunicaciones registradas: ${body.sent}.`);
    await refreshCommunications();
  }

  async function processCommunications(targetStatus: "queued" | "failed") {
    setError(null);
    setStatusMessage(null);
    setProcessingTargetStatus(targetStatus);

    try {
      const response = await fetch("/api/communications/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: cycle.id,
          targetStatus,
          limit: 30,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setStatusMessage(
        `Procesadas: ${body.processed}. Enviadas: ${body.sent}. Fallidas: ${body.failed}.`,
      );
      await refreshCommunications();
    } finally {
      setProcessingTargetStatus(null);
    }
  }

  async function loadOcrHistory(applicationId: string, options?: { forceOpen?: boolean }) {
    setError(null);

    if (!options?.forceOpen && selectedOcrApplicationId === applicationId) {
      setSelectedOcrApplicationId(null);
      setOcrChecks([]);
      return;
    }

    setSelectedOcrApplicationId(applicationId);
    setIsOcrHistoryLoading(true);

    try {
      const response = await fetch(`/api/applications/${applicationId}/ocr-check?limit=10`);
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        setOcrChecks([]);
        return;
      }

      setOcrChecks(body.checks ?? []);
    } finally {
      setIsOcrHistoryLoading(false);
    }
  }

  async function runOcrValidation(application: Application) {
    setError(null);
    setStatusMessage(null);

    const fileKey = getDefaultOcrFileKey(application);
    if (!fileKey) {
      setError({
        message: "Esta postulación no tiene archivos para validar con OCR.",
      });
      return;
    }

    setOcrLoadingApplicationId(application.id);

    try {
      const response = await fetch(`/api/applications/${application.id}/ocr-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setStatusMessage(
        `OCR completado (${Math.round((body.confidence ?? 0) * 100)}% confianza).`,
      );
      await loadOcrHistory(application.id, { forceOpen: true });
    } finally {
      setOcrLoadingApplicationId(null);
    }
  }

  function updateTemplate(
    templateId: string,
    field: "stage_label" | "milestone_label",
    value: string,
  ) {
    setTemplates((current) =>
      current.map((template) => {
        if (template.id !== templateId) {
          return template;
        }

        return {
          ...template,
          [field]: value,
        };
      }),
    );
  }

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h5">Panel de administración</Typography>
          <Typography sx={{ mt: 1 }} fontWeight={700}>
            {cycle.name}
          </Typography>
          <Typography color="text.secondary">
            Gestiona validaciones, transición de etapas (2 etapas MVP) e importación de examen externo.
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            `Elegible` habilita avance a Stage 2. `No elegible` mantiene la postulación en Stage 1.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button component={Link} href="/admin" variant="outlined" size="small">
              Volver al dashboard de procesos
            </Button>
            <Button component={Link} href="/admin/audit" variant="outlined" size="small">
              Ver auditoría del proceso
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error ? (
        <ErrorCallout message={error.message} errorId={error.errorId} context="admin_dashboard" />
      ) : null}

      {statusMessage ? (
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#DBEAFE" }}>
          <Typography color="#1D4ED8">{statusMessage}</Typography>
        </Box>
      ) : null}

      <Card>
        <CardContent>
          <Typography variant="h6">Configuración de etapas</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Define fechas base para Stage 1 y Stage 2 del proceso.
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            <TextField
              label="Stage 1 inicio"
              type="date"
              value={stage1OpenAt}
              onChange={(event) => setStage1OpenAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Stage 1 cierre"
              type="date"
              value={stage1CloseAt}
              onChange={(event) => setStage1CloseAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Stage 2 inicio"
              type="date"
              value={stage2OpenAt}
              onChange={(event) => setStage2OpenAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Stage 2 cierre"
              type="date"
              value={stage2CloseAt}
              onChange={(event) => setStage2CloseAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Button variant="outlined" onClick={saveStageConfiguration}>
              Guardar fechas
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Plantillas de etapas</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Personaliza etiquetas e hitos por etapa. Las fechas se gestionan en la sección
            `Configuración de etapas`.
          </Typography>
          <Stack spacing={2}>
            {templates.map((template) => (
              <Box key={template.id} sx={{ border: "1px solid #E5E7EB", borderRadius: 2, p: 1.5 }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
                <Chip
                  label={template.stage_code === "documents" ? "Stage 1" : "Stage 2"}
                  color={template.stage_code === "documents" ? "primary" : "default"}
                  sx={{ width: 110 }}
                />
                <TextField
                  label="Nombre de etapa"
                  value={template.stage_label}
                  onChange={(event) => updateTemplate(template.id, "stage_label", event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Hito"
                  value={template.milestone_label}
                  onChange={(event) => updateTemplate(template.id, "milestone_label", event.target.value)}
                  fullWidth
                />
                <Button
                  component={Link}
                  href={`/admin/process/${cycle.id}/stage/${template.stage_code}`}
                  variant="outlined"
                  prefetch
                  sx={{ minWidth: 132 }}
                >
                  Editar campos
                </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
          <Button variant="outlined" sx={{ mt: 2 }} onClick={saveStageTemplates}>
            Guardar plantillas
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Resumen del proceso</Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mt: 1.5 }} useFlexGap flexWrap="wrap">
            <Chip label={`Total: ${applications.length}`} />
            <Chip label={`Draft: ${statusRollup.draft}`} />
            <Chip label={`Enviadas: ${statusRollup.submitted}`} />
            <Chip label={`Elegibles: ${statusRollup.eligible}`} color="success" />
            <Chip label={`No elegibles: ${statusRollup.ineligible}`} color="warning" />
            <Chip label={`Avanzadas: ${statusRollup.advanced}`} color="primary" />
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            Stage 1 (Documentos): {stageRollup.documents} · Stage 2 (Placeholder): {stageRollup.exam_placeholder}
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            Fechas de referencia: Stage 1 cierra {formatDate(cycle.stage1_close_at)}; Stage 2 cierra{" "}
            {formatDate(cycle.stage2_close_at)}.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Postulaciones</Typography>
            <Button onClick={refreshData} variant="outlined">
              Refrescar
            </Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Etapa</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Última actualización</TableCell>
                <TableCell>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orderedApplications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell sx={{ fontFamily: "monospace" }}>{application.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <StageBadge stage={application.stage_code} />
                  </TableCell>
                  <TableCell>{application.status}</TableCell>
                  <TableCell>{new Date(application.updated_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                      <Button
                        variant="outlined"
                        size="small"
                        color="success"
                        onClick={() => validateApplication(application.id, "eligible")}
                      >
                        Elegible
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="warning"
                        onClick={() => validateApplication(application.id, "ineligible")}
                      >
                        No elegible
                      </Button>
                      <TextField
                        select
                        size="small"
                        value={application.stage_code}
                        onChange={(event) =>
                          transition(application.id, event.target.value as StageCode)
                        }
                      >
                        <MenuItem value="documents">Stage 1</MenuItem>
                        <MenuItem
                          value="exam_placeholder"
                          disabled={
                            !canTransition({
                              fromStage: application.stage_code,
                              toStage: "exam_placeholder",
                              status: application.status,
                            })
                          }
                        >
                          Stage 2 placeholder
                        </MenuItem>
                      </TextField>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => void loadOcrHistory(application.id)}
                      >
                        {selectedOcrApplicationId === application.id ? "Ocultar OCR" : "Ver OCR"}
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => void runOcrValidation(application)}
                        disabled={
                          !getDefaultOcrFileKey(application) ||
                          ocrLoadingApplicationId === application.id
                        }
                      >
                        {ocrLoadingApplicationId === application.id ? "OCR..." : "OCR"}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedOcrApplicationId ? (
        <Card>
          <CardContent>
            <Typography variant="h6">Historial OCR</Typography>
            <Typography color="text.secondary" sx={{ mb: 1.5 }}>
              Postulación seleccionada:{" "}
              <Typography component="span" sx={{ fontFamily: "monospace" }}>
                {selectedOcrApplicationId.slice(0, 8)}
              </Typography>
            </Typography>
            {isOcrHistoryLoading ? (
              <Typography color="text.secondary">Cargando historial OCR...</Typography>
            ) : ocrChecks.length === 0 ? (
              <Typography color="text.secondary">
                Aún no existen validaciones OCR para esta postulación.
              </Typography>
            ) : (
              <Stack spacing={1.2}>
                {ocrChecks.map((check) => (
                  <Box key={check.id} sx={{ border: "1px solid #E5E7EB", borderRadius: 2, p: 1.5 }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1}
                      justifyContent="space-between"
                    >
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                        {new Date(check.created_at).toLocaleString()}
                      </Typography>
                      <Chip label={`Confianza ${Math.round(check.confidence * 100)}%`} size="small" />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Archivo: {check.file_key}
                    </Typography>
                    <Typography sx={{ mt: 0.8 }}>{check.summary}</Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <Typography variant="h6">Importación de examen externo</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Pega tu CSV con columnas: applicant_email, score, passed.
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 1.5 }}>
            Este módulo está en modo demo: muestra resumen de importación sin persistir notas de examen.
          </Typography>
          <TextField
            value={csvData}
            onChange={(event) => setCsvData(event.target.value)}
            multiline
            minRows={4}
            fullWidth
          />
          <Button variant="outlined" sx={{ mt: 2 }} onClick={importExamCsv}>
            Importar CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Comunicaciones</Typography>
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            Registra correos en cola y ejecútalos con envío real (proveedor configurado).
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
            <Chip label={`Cola: ${communicationSummary.queued}`} />
            <Chip label={`Procesando: ${communicationSummary.processing}`} />
            <Chip label={`Enviadas: ${communicationSummary.sent}`} color="success" />
            <Chip label={`Fallidas: ${communicationSummary.failed}`} color="warning" />
          </Stack>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <Button variant="contained" onClick={sendStatusEmails}>
              Enviar resultados
            </Button>
            <Button
              variant="outlined"
              onClick={() => void processCommunications("queued")}
              disabled={processingTargetStatus !== null}
            >
              {processingTargetStatus === "queued" ? "Procesando..." : "Procesar cola"}
            </Button>
            <Button
              variant="outlined"
              onClick={() => void processCommunications("failed")}
              disabled={processingTargetStatus !== null}
            >
              {processingTargetStatus === "failed" ? "Reintentando..." : "Reintentar fallidas"}
            </Button>
            <Button variant="text" onClick={() => void refreshCommunications()} disabled={isCommunicationLoading}>
              {isCommunicationLoading ? "Actualizando..." : "Actualizar estado"}
            </Button>
          </Stack>
          <Table size="small" sx={{ mt: 1.5 }}>
            <TableHead>
              <TableRow>
                <TableCell>Destino</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Intentos</TableCell>
                <TableCell>Último intento</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {communications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>Sin registros todavía. Usa `Actualizar estado`.</TableCell>
                </TableRow>
              ) : (
                communications.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.recipient_email}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{item.attempt_count}</TableCell>
                    <TableCell>
                      {item.last_attempt_at ? new Date(item.last_attempt_at).toLocaleString() : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
