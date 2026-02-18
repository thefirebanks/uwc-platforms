"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { CycleStageField, StageAutomationTemplate, StageCode } from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
import { normalizeFieldKey } from "@/lib/stages/form-schema";

interface ApiError {
  message: string;
  errorId?: string;
}

type EditableField = CycleStageField & {
  localId: string;
};

type EditableAutomation = StageAutomationTemplate & {
  localId: string;
};

function mapFieldsWithLocalId(fields: CycleStageField[]) {
  return fields.map((field) => ({
    ...field,
    localId: field.id,
  }));
}

function mapAutomationsWithLocalId(automations: StageAutomationTemplate[]) {
  return automations.map((automation) => ({
    ...automation,
    localId: automation.id,
  }));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function StageConfigEditor({
  cycleId,
  cycleName,
  stageCode,
  stageLabel,
  initialFields,
  initialAutomations,
}: {
  cycleId: string;
  cycleName: string;
  stageCode: StageCode;
  stageLabel: string;
  initialFields: CycleStageField[];
  initialAutomations: StageAutomationTemplate[];
}) {
  const [fields, setFields] = useState<EditableField[]>(mapFieldsWithLocalId(initialFields));
  const [automations, setAutomations] = useState<EditableAutomation[]>(
    mapAutomationsWithLocalId(initialAutomations),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const orderedFields = useMemo(
    () => [...fields].sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  );

  function addField() {
    const nextIndex = fields.length + 1;
    setFields((current) => [
      ...current,
      {
        id: `new-${crypto.randomUUID()}`,
        localId: `new-${crypto.randomUUID()}`,
        cycle_id: cycleId,
        stage_code: stageCode,
        field_key: `nuevoCampo${nextIndex}`,
        field_label: `Nuevo campo ${nextIndex}`,
        field_type: "short_text",
        is_required: false,
        placeholder: "",
        help_text: "",
        sort_order: nextIndex,
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ]);
  }

  function addAutomation() {
    const baseTrigger = automations.some((automation) => automation.trigger_event === "application_submitted")
      ? "stage_result"
      : "application_submitted";
    setAutomations((current) => [
      ...current,
      {
        id: `new-${crypto.randomUUID()}`,
        localId: `new-${crypto.randomUUID()}`,
        cycle_id: cycleId,
        stage_code: stageCode,
        trigger_event: baseTrigger,
        channel: "email",
        is_enabled: false,
        template_subject: "Nuevo asunto",
        template_body: "Nuevo cuerpo de automatización",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }

  function removeField(localId: string) {
    setFields((current) =>
      current
        .filter((field) => field.localId !== localId)
        .map((field, index) => ({ ...field, sort_order: index + 1 })),
    );
  }

  function removeAutomation(localId: string) {
    setAutomations((current) => current.filter((automation) => automation.localId !== localId));
  }

  async function saveStageConfig() {
    setError(null);
    setStatusMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/cycles/${cycleId}/stages/${stageCode}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: orderedFields.map((field, index) => ({
            id: isUuid(field.id) ? field.id : undefined,
            fieldKey: field.field_key,
            fieldLabel: field.field_label,
            fieldType: field.field_type,
            isRequired: field.is_required,
            placeholder: field.placeholder,
            helpText: field.help_text,
            sortOrder: index + 1,
            isActive: field.is_active,
          })),
          automations: automations.map((automation) => ({
            id: isUuid(automation.id) ? automation.id : undefined,
            triggerEvent: automation.trigger_event,
            channel: automation.channel,
            isEnabled: automation.is_enabled,
            templateSubject: automation.template_subject,
            templateBody: automation.template_body,
          })),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setFields(mapFieldsWithLocalId(body.fields ?? []));
      setAutomations(mapAutomationsWithLocalId(body.automations ?? []));
      setStatusMessage("Configuración de etapa guardada.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
            <Box>
              <Typography variant="h5">Editar etapa</Typography>
              <Typography color="text.secondary">
                {cycleName} · {stageLabel}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button component={Link} href={`/admin/process/${cycleId}`} variant="outlined">
                Volver al proceso
              </Button>
              <Button variant="contained" onClick={saveStageConfig} disabled={isSaving}>
                Guardar configuración
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {error ? <ErrorCallout message={error.message} errorId={error.errorId} context="stage_config" /> : null}
      {statusMessage ? (
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#DCFCE7" }}>
          <Typography color="#166534">{statusMessage}</Typography>
        </Box>
      ) : null}

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6">Campos requeridos</Typography>
            <Button variant="outlined" size="small" onClick={addField}>
              Agregar campo
            </Button>
          </Stack>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Solo mostramos y pedimos lo estrictamente necesario para esta etapa.
          </Typography>
          <Stack spacing={2}>
            {orderedFields.map((field) => (
              <Box key={field.localId} sx={{ border: "1px solid #E5E7EB", borderRadius: 2, p: 2 }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                  <TextField
                    label="Título"
                    value={field.field_label}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFields((current) =>
                        current.map((item) =>
                          item.localId === field.localId
                            ? {
                                ...item,
                                field_label: value,
                                field_key:
                                  item.id.startsWith("new-") || item.field_key.startsWith("nuevoCampo")
                                    ? normalizeFieldKey(value)
                                    : item.field_key,
                              }
                            : item,
                        ),
                      );
                    }}
                    fullWidth
                  />
                  <TextField
                    select
                    label="Tipo"
                    value={field.field_type}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((item) =>
                          item.localId === field.localId
                            ? {
                                ...item,
                                field_type: event.target.value as CycleStageField["field_type"],
                              }
                            : item,
                        ),
                      )
                    }
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="short_text">Texto corto</MenuItem>
                    <MenuItem value="long_text">Texto largo</MenuItem>
                    <MenuItem value="number">Número</MenuItem>
                    <MenuItem value="date">Fecha</MenuItem>
                    <MenuItem value="email">Correo</MenuItem>
                    <MenuItem value="file">Archivo</MenuItem>
                  </TextField>
                  <TextField
                    label="Clave"
                    value={field.field_key}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((item) =>
                          item.localId === field.localId
                            ? {
                                ...item,
                                field_key: normalizeFieldKey(event.target.value),
                              }
                            : item,
                        ),
                      )
                    }
                    sx={{ minWidth: 180 }}
                  />
                  <IconButton aria-label={`Eliminar ${field.field_label}`} onClick={() => removeField(field.localId)}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} sx={{ mt: 1.2 }}>
                  <TextField
                    label="Placeholder"
                    value={field.placeholder ?? ""}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((item) =>
                          item.localId === field.localId ? { ...item, placeholder: event.target.value } : item,
                        ),
                      )
                    }
                    fullWidth
                  />
                  <TextField
                    label="Ayuda"
                    value={field.help_text ?? ""}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((item) =>
                          item.localId === field.localId ? { ...item, help_text: event.target.value } : item,
                        ),
                      )
                    }
                    fullWidth
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={field.is_required}
                        onChange={(event) =>
                          setFields((current) =>
                            current.map((item) =>
                              item.localId === field.localId
                                ? {
                                    ...item,
                                    is_required: event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    }
                    label="Obligatorio"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={field.is_active}
                        onChange={(event) =>
                          setFields((current) =>
                            current.map((item) =>
                              item.localId === field.localId
                                ? {
                                    ...item,
                                    is_active: event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    }
                    label="Visible"
                  />
                </Stack>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Automatizaciones de correo (Avanzado)</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography color="text.secondary">
                Define plantillas por evento. Mantén solo las necesarias para no saturar al postulante.
              </Typography>
              <Button variant="outlined" size="small" onClick={addAutomation}>
                Agregar automatización
              </Button>
            </Stack>
            {automations.map((automation) => (
              <Box key={automation.localId} sx={{ border: "1px solid #E5E7EB", borderRadius: 2, p: 2 }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                  <TextField
                    select
                    label="Evento"
                    value={automation.trigger_event}
                    onChange={(event) =>
                      setAutomations((current) =>
                        current.map((item) =>
                          item.localId === automation.localId
                            ? {
                                ...item,
                                trigger_event: event.target.value as StageAutomationTemplate["trigger_event"],
                              }
                            : item,
                        ),
                      )
                    }
                    sx={{ minWidth: 220 }}
                  >
                    <MenuItem value="application_submitted">Postulación enviada</MenuItem>
                    <MenuItem value="stage_result">Resultado de etapa</MenuItem>
                  </TextField>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={automation.is_enabled}
                        onChange={(event) =>
                          setAutomations((current) =>
                            current.map((item) =>
                              item.localId === automation.localId
                                ? {
                                    ...item,
                                    is_enabled: event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    }
                    label="Habilitada"
                  />
                  <IconButton
                    aria-label={`Eliminar automatización ${automation.trigger_event}`}
                    onClick={() => removeAutomation(automation.localId)}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
                <TextField
                  label="Asunto"
                  value={automation.template_subject}
                  onChange={(event) =>
                    setAutomations((current) =>
                      current.map((item) =>
                        item.localId === automation.localId
                          ? {
                              ...item,
                              template_subject: event.target.value,
                            }
                          : item,
                      ),
                    )
                  }
                  fullWidth
                  sx={{ mt: 1.2 }}
                />
                <TextField
                  label="Cuerpo"
                  value={automation.template_body}
                  onChange={(event) =>
                    setAutomations((current) =>
                      current.map((item) =>
                        item.localId === automation.localId
                          ? {
                              ...item,
                              template_body: event.target.value,
                            }
                          : item,
                      ),
                    )
                  }
                  fullWidth
                  multiline
                  minRows={4}
                  sx={{ mt: 1.2 }}
                />
              </Box>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
