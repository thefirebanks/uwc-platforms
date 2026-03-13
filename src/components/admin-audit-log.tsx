"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuditEventListItem } from "@/lib/server/audit-service";
import { ErrorCallout } from "@/components/error-callout";
import { useAppLanguage } from "@/components/language-provider";
import { fetchApi, ApiRequestError, type NormalizedApiError } from "@/lib/client/api-client";

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
  const [error, setError] = useState<NormalizedApiError | null>(null);

  const listQuery = useMemo(() => buildQuery(applied, true), [applied]);
  const exportQuery = useMemo(() => buildQuery(applied, false), [applied]);
  const exportHref = `/api/audit/export${exportQuery ? `?${exportQuery}` : ""}`;

  useEffect(() => {
    let isMounted = true;

    async function loadAuditEvents() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchApi<AuditResponse>(`/api/audit?${listQuery}`, {
          cache: "no-store",
        });
        if (!isMounted) return;
        setEvents(result.events ?? []);
        setTotal(result.total ?? 0);
        setTotalPages(result.totalPages ?? 0);
      } catch (err) {
        if (!isMounted) return;
        if (err instanceof ApiRequestError) {
          setError({ message: err.userMessage, errorId: err.errorId });
        }
        setEvents([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        if (isMounted) setIsLoading(false);
      }
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
    <main className="main full-width">
      <div className="canvas-header">
        <div className="canvas-title-row">
          <div>
            <h1>{t("audit.title")}</h1>
            <p>{t("audit.description")}</p>
          </div>
          <a className="btn btn-outline" href={exportHref}>
            {t("audit.exportCsv")}
          </a>
        </div>
      </div>

      <div className="canvas-body full admin-page-stack">
        {error ? (
          <ErrorCallout
            message={error.message}
            errorId={error.errorId}
            context="admin_audit"
          />
        ) : null}

        <section className="settings-card" aria-labelledby="audit-filters-title">
          <div className="settings-card-header">
            <h3 id="audit-filters-title">{t("audit.search")}</h3>
            <p>Filtra eventos por acción, IDs y rango de fechas.</p>
          </div>

          <div className="admin-filter-grid">
            <div className="admin-form-field">
              <label htmlFor="audit-action">{t("audit.action")}</label>
              <select
                id="audit-action"
                className="admin-form-control"
                value={filters.action}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, action: event.target.value }))
                }
              >
                {actionOptions.map((action) => (
                  <option key={action || "all"} value={action}>
                    {action || t("audit.allActions")}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-form-field">
              <label htmlFor="audit-request-id">{t("audit.requestId")}</label>
              <input
                id="audit-request-id"
                className="admin-form-control"
                type="text"
                value={filters.requestId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, requestId: event.target.value }))
                }
              />
            </div>

            <div className="admin-form-field">
              <label htmlFor="audit-application-id">{t("audit.applicationId")}</label>
              <input
                id="audit-application-id"
                className="admin-form-control"
                type="text"
                value={filters.applicationId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    applicationId: event.target.value,
                  }))
                }
              />
            </div>

            <div className="admin-form-field">
              <label htmlFor="audit-actor-id">{t("audit.actorId")}</label>
              <input
                id="audit-actor-id"
                className="admin-form-control"
                type="text"
                value={filters.actorId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, actorId: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="admin-filter-grid admin-filter-grid-secondary">
            <div className="admin-form-field admin-filter-span-2">
              <label htmlFor="audit-from">{t("audit.from")}</label>
              <input
                id="audit-from"
                className="admin-form-control"
                type="datetime-local"
                value={filters.from}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, from: event.target.value }))
                }
              />
            </div>

            <div className="admin-form-field admin-filter-span-2">
              <label htmlFor="audit-to">{t("audit.to")}</label>
              <input
                id="audit-to"
                className="admin-form-control"
                type="datetime-local"
                value={filters.to}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, to: event.target.value }))
                }
              />
            </div>

            <div className="admin-form-field">
              <label htmlFor="audit-page-size">{t("audit.rowsPerPage")}</label>
              <select
                id="audit-page-size"
                className="admin-form-control"
                value={String(applied.pageSize)}
                onChange={(event) =>
                  setApplied((current) => ({
                    ...current,
                    pageSize: Number.parseInt(event.target.value, 10),
                    page: 1,
                  }))
                }
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>

            <div className="admin-form-actions admin-form-actions-inline">
              <button type="button" className="btn btn-primary" onClick={applyFilters}>
                {t("audit.search")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={clearFilters}>
                {t("audit.clear")}
              </button>
            </div>
          </div>
        </section>

        <section className="settings-card" aria-labelledby="audit-events-title">
          <div className="settings-card-header">
            <div className="admin-toolbar">
              <h3 id="audit-events-title" className="admin-toolbar-heading">
                {t("audit.events")}
              </h3>
              <p className="admin-toolbar-caption">
                {t("audit.totalPage", {
                  total,
                  page: applied.page,
                  pages: Math.max(totalPages, 1),
                })}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="admin-loading-row" role="status" aria-live="polite">
              <span className="admin-spinner" aria-hidden="true"></span>
              <span>{t("audit.loading")}</span>
            </div>
          ) : null}

          <div className="table-container">
            <table className="candidates-table">
              <thead>
                <tr>
                  <th>{t("audit.date")}</th>
                  <th>{t("audit.action")}</th>
                  <th>{t("audit.requestId")}</th>
                  <th>{t("audit.application")}</th>
                  <th>{t("audit.actor")}</th>
                  <th>{t("audit.metadata")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="admin-empty-cell">
                      {t("audit.loading")}
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-empty-cell">
                      {t("audit.empty")}
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.createdAt).toLocaleString()}</td>
                      <td>{event.action}</td>
                      <td className="admin-mono">{shortId(event.requestId)}</td>
                      <td className="admin-mono">{shortId(event.applicationId)}</td>
                      <td>
                        <div>{event.actorName || "-"}</div>
                        <div className="admin-text-muted">{event.actorEmail || event.actorId || "-"}</div>
                      </td>
                      <td>
                        <pre className="admin-audit-metadata">
                          {JSON.stringify(event.metadata ?? {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <button
              type="button"
              className="btn btn-outline"
              disabled={isLoading || applied.page <= 1}
              onClick={() => goToPage(applied.page - 1)}
            >
              {t("audit.previous")}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={isLoading || totalPages === 0 || applied.page >= totalPages}
              onClick={() => goToPage(applied.page + 1)}
            >
              {t("audit.next")}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
