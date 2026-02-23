"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
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
import type { AuditEventListItem } from "@/lib/server/audit-service";
import { ErrorCallout } from "@/components/error-callout";
import { useAppLanguage } from "@/components/language-provider";

interface ApiError {
  message: string;
  errorId?: string;
}

type AuditFiltersForm = {
  action: string;
  requestId: string;
  applicationId: string;
  actorId: string;
  from: string;
  to: string;
};

type AppliedFilters = AuditFiltersForm & {
  page: number;
  pageSize: number;
};

type AuditResponse = {
  events: AuditEventListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const defaultFormFilters: AuditFiltersForm = {
  action: "",
  requestId: "",
  applicationId: "",
  actorId: "",
  from: "",
  to: "",
};

const actionOptions = [
  "",
  "application.upserted",
  "application.submitted",
  "application.validated",
  "application.stage_transitioned",
  "application.ocr_checked",
  "recommendations.requested",
  "communications.queued",
  "communications.processed",
  "communications.retried",
  "bug.reported",
  "exam.imported",
  "exam.import.simulated",
  "cycle.created",
  "cycle.updated",
  "cycle.templates_updated",
  "cycle.stage_config_updated",
];

function buildQuery(filters: AppliedFilters, includePagination: boolean) {
  const params = new URLSearchParams();

  if (includePagination) {
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
  }

  if (filters.action) {
    params.set("action", filters.action);
  }
  if (filters.requestId) {
    params.set("requestId", filters.requestId);
  }
  if (filters.applicationId) {
    params.set("applicationId", filters.applicationId);
  }
  if (filters.actorId) {
    params.set("actorId", filters.actorId);
  }
  if (filters.from) {
    params.set("from", filters.from);
  }
  if (filters.to) {
    params.set("to", filters.to);
  }

  return params.toString();
}

function shortId(value: string | null) {
  if (!value) {
    return "-";
  }

  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}

export function AdminAuditLog() {
  const { t } = useAppLanguage();
  const [filters, setFilters] = useState<AuditFiltersForm>(defaultFormFilters);
  const [applied, setApplied] = useState<AppliedFilters>({
    ...defaultFormFilters,
    page: 1,
    pageSize: 25,
  });
  const [events, setEvents] = useState<AuditEventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const listQuery = useMemo(() => buildQuery(applied, true), [applied]);
  const exportQuery = useMemo(() => buildQuery(applied, false), [applied]);
  const exportHref = `/api/audit/export${exportQuery ? `?${exportQuery}` : ""}`;

  useEffect(() => {
    let isMounted = true;

    async function loadAuditEvents() {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/audit?${listQuery}`, { cache: "no-store" });
      const body = (await response.json()) as AuditResponse | ApiError;

      if (!isMounted) {
        return;
      }

      if (!response.ok) {
        setError(body as ApiError);
        setEvents([]);
        setTotal(0);
        setTotalPages(0);
        setIsLoading(false);
        return;
      }

      const result = body as AuditResponse;
      setEvents(result.events ?? []);
      setTotal(result.total ?? 0);
      setTotalPages(result.totalPages ?? 0);
      setIsLoading(false);
    }

    void loadAuditEvents();

    return () => {
      isMounted = false;
    };
  }, [listQuery]);

  function applyFilters() {
    setApplied((current) => ({
      ...current,
      ...filters,
      page: 1,
    }));
  }

  function clearFilters() {
    setFilters(defaultFormFilters);
    setApplied((current) => ({
      ...current,
      ...defaultFormFilters,
      page: 1,
    }));
  }

  function goToPage(nextPage: number) {
    setApplied((current) => ({
      ...current,
      page: nextPage,
    }));
  }

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h5">{t("audit.title")}</Typography>
              <Typography color="text.secondary">
                {t("audit.description")}
              </Typography>
            </Box>
            <Button component="a" href={exportHref} variant="outlined">
              {t("audit.exportCsv")}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error ? <ErrorCallout message={error.message} errorId={error.errorId} context="admin_audit" /> : null}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <TextField
                select
                label={t("audit.action")}
                value={filters.action}
                onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
                size="small"
              >
                {actionOptions.map((action) => (
                  <MenuItem key={action || "all"} value={action}>
                    {action || t("audit.allActions")}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={t("audit.requestId")}
                value={filters.requestId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, requestId: event.target.value }))
                }
                size="small"
              />
              <TextField
                label={t("audit.applicationId")}
                value={filters.applicationId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, applicationId: event.target.value }))
                }
                size="small"
              />
              <TextField
                label={t("audit.actorId")}
                value={filters.actorId}
                onChange={(event) => setFilters((current) => ({ ...current, actorId: event.target.value }))}
                size="small"
              />
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems="center">
              <TextField
                label={t("audit.from")}
                type="datetime-local"
                value={filters.from}
                onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label={t("audit.to")}
                type="datetime-local"
                value={filters.to}
                onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                select
                label={t("audit.rowsPerPage")}
                value={String(applied.pageSize)}
                onChange={(event) =>
                  setApplied((current) => ({
                    ...current,
                    pageSize: Number.parseInt(event.target.value, 10),
                    page: 1,
                  }))
                }
                size="small"
              >
                <MenuItem value="10">10</MenuItem>
                <MenuItem value="25">25</MenuItem>
                <MenuItem value="50">50</MenuItem>
                <MenuItem value="100">100</MenuItem>
              </TextField>
              <Button variant="contained" onClick={applyFilters}>
                {t("audit.search")}
              </Button>
              <Button variant="text" onClick={clearFilters}>
                {t("audit.clear")}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">{t("audit.events")}</Typography>
            <Typography color="text.secondary">
              {t("audit.totalPage", {
                total,
                page: applied.page,
                pages: Math.max(totalPages, 1),
              })}
            </Typography>
          </Stack>

          {isLoading ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography color="text.secondary">{t("audit.loading")}</Typography>
            </Stack>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("audit.date")}</TableCell>
                  <TableCell>{t("audit.action")}</TableCell>
                  <TableCell>{t("audit.requestId")}</TableCell>
                  <TableCell>{t("audit.application")}</TableCell>
                  <TableCell>{t("audit.actor")}</TableCell>
                  <TableCell>{t("audit.metadata")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>{t("audit.empty")}</TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{new Date(event.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{event.action}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>{shortId(event.requestId)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>
                        {shortId(event.applicationId)}
                      </TableCell>
                      <TableCell>
                        {event.actorName || "-"}
                        <Typography variant="caption" display="block" color="text.secondary">
                          {event.actorEmail || event.actorId || "-"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 320 }}>
                        <Typography
                          variant="caption"
                          component="pre"
                          sx={{ m: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                        >
                          {JSON.stringify(event.metadata)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              disabled={isLoading || applied.page <= 1}
              onClick={() => goToPage(applied.page - 1)}
            >
              {t("audit.previous")}
            </Button>
            <Button
              variant="outlined"
              disabled={isLoading || totalPages === 0 || applied.page >= totalPages}
              onClick={() => goToPage(applied.page + 1)}
            >
              {t("audit.next")}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
