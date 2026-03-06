"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppLanguage } from "@/components/language-provider";
import type { Application, SelectionProcess } from "@/types/domain";
import { StageBadge } from "@/components/stage-badge";
import type { ApplicationStatus } from "@/types/domain";
import { ApplicantCommunicationsDashboard } from "@/components/applicant-communications-dashboard";
import { ApplicantSupportForm } from "@/components/applicant-support-form";

export type ApplicantApplicationSummary = Pick<
  Application,
  "id" | "cycle_id" | "status" | "stage_code" | "updated_at"
>;

export type StageTemplateSummary = {
  cycle_id: string;
  stage_code: string;
  stage_label: string;
  sort_order: number;
};

export type RecentTransition = {
  application_id: string;
  from_stage: string;
  to_stage: string;
  created_at: string;
};

const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: "Borrador",
  submitted: "Enviado",
  eligible: "En revisión",
  ineligible: "En revisión",
  advanced: "Avanzado",
};

const APP_STATUS_COLOR: Record<ApplicationStatus, string> = {
  draft: "var(--muted)",
  submitted: "var(--uwc-blue)",
  eligible: "var(--success)",
  ineligible: "var(--danger)",
  advanced: "var(--uwc-maroon)",
};

const APP_STATUS_BG: Record<ApplicationStatus, string> = {
  draft: "var(--sand-light)",
  submitted: "var(--uwc-blue-soft)",
  eligible: "var(--warning-soft)",
  ineligible: "var(--warning-soft)",
  advanced: "var(--uwc-maroon-soft)",
};

const HIDDEN_APPLICANT_OUTCOMES: ApplicationStatus[] = ["eligible", "ineligible"];

function AppStatusBadge({ status }: { status: ApplicationStatus }) {
  if (HIDDEN_APPLICANT_OUTCOMES.includes(status)) {
    return null;
  }

  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color: APP_STATUS_COLOR[status],
        background: APP_STATUS_BG[status],
        padding: "2px 10px",
        borderRadius: "20px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {APP_STATUS_LABEL[status]}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getPreferredApplicantName(fullName: string | null | undefined) {
  const normalized = fullName?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  return normalized.split(/\s+/)[0] ?? null;
}

export function ApplicantProcessesDashboard({
  processes,
  applications,
  maxApplications = 3,
  stageTemplates = [],
  recentTransitions = [],
  applicantName = null,
}: {
  processes: SelectionProcess[];
  applications: ApplicantApplicationSummary[];
  maxApplications?: number;
  stageTemplates?: StageTemplateSummary[];
  recentTransitions?: RecentTransition[];
  applicantName?: string | null;
}) {
  const { t, language } = useAppLanguage();
  const applicationMap = new Map(applications.map((a) => [a.cycle_id, a]));
  const reachedLimit = applications.length >= maxApplications;

  // Template map: cycle_id + stage_code → stage_label
  const templateMap = new Map(
    stageTemplates.map((tpl) => [`${tpl.cycle_id}:${tpl.stage_code}`, tpl.stage_label]),
  );

  // Determine active cycle (first active cycle with an application)
  const activeCycle = processes.find((p) => p.is_active && applicationMap.has(p.id));
  const activeApplication = activeCycle ? applicationMap.get(activeCycle.id) : undefined;

  // Drafts the user has on inactive cycles (orphaned drafts)
  const orphanedDrafts = applications.filter(
    (a) => a.status === "draft" && !processes.some((p) => p.is_active && p.id === a.cycle_id),
  );

  const stageLabel = activeApplication
    ? (templateMap.get(`${activeCycle?.id}:${activeApplication.stage_code}`) ??
        activeApplication.stage_code)
    : null;

  // Detect recent advancement (any recent transition that went to a new stage)
  const recentAdvancement =
    activeApplication && recentTransitions.length > 0
      ? recentTransitions.find((t) => t.application_id === activeApplication.id)
      : null;

  const advancedToLabel = recentAdvancement
    ? (templateMap.get(`${activeCycle?.id}:${recentAdvancement.to_stage}`) ??
        recentAdvancement.to_stage)
    : null;

  // Inactive / old processes (for collapsible section)
  const otherProcesses = processes.filter(
    (p) => p.id !== activeCycle?.id && (!p.is_active || !applicationMap.has(p.id)),
  );
  const [showOldProcesses, setShowOldProcesses] = useState(false);
  const preferredName = getPreferredApplicantName(applicantName);
  const greetingName = preferredName ?? (language === "en" ? "Applicant" : "Postulante");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          border: "1px solid var(--sand)",
          borderRadius: "var(--radius-lg)",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--uwc-maroon-soft) 65%, transparent), color-mix(in srgb, var(--uwc-blue-soft) 62%, transparent))",
          padding: "16px 20px",
        }}
      >
        <p style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--ink)" }}>
          {t("dashboard.applicantGreeting", { name: greetingName })}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "0.86rem", color: "var(--ink-light)" }}>
          {t("dashboard.applicantGreetingSubtitle")}
        </p>
      </div>

      {/* Congratulations banner */}
      {recentAdvancement && advancedToLabel && (
        <div
          style={{
            background: "var(--success-soft)",
            border: "1px solid var(--success)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
          role="status"
        >
          <span style={{ fontSize: "24px" }}>🎉</span>
          <div>
            <p style={{ fontWeight: 700, color: "var(--success)", margin: "0 0 2px", fontSize: "15px" }}>
              {t("dashboard.congrats").replace("{stage}", advancedToLabel)}
            </p>
            <p style={{ fontSize: "13px", color: "var(--success)", margin: 0 }}>
              {formatDate(recentAdvancement.created_at)}
            </p>
          </div>
        </div>
      )}

      {/* Hero card — active application */}
      {activeCycle && activeApplication && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--sand)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-md)",
            overflow: "hidden",
          }}
        >
          {/* Card header */}
          <div
            style={{
              background: "var(--uwc-maroon-soft)",
              borderBottom: "1px solid var(--sand)",
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "var(--uwc-maroon)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Tu proceso activo
              </p>
              <h2 style={{ margin: "2px 0 0", fontSize: "18px", fontWeight: 700, color: "var(--ink)" }}>
                {activeCycle.name}
              </h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <StageBadge stage={activeApplication.stage_code} />
              <AppStatusBadge status={activeApplication.status} />
            </div>
          </div>

          {/* Card body */}
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {stageLabel && (
              <p style={{ margin: 0, fontSize: "14px", color: "var(--ink-light)" }}>
                Etapa actual:{" "}
                <strong style={{ color: "var(--ink)" }}>{stageLabel}</strong>
              </p>
            )}

            <Link
              href={`/applicant/process/${activeCycle.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "var(--uwc-maroon)",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: "var(--radius)",
                fontWeight: 700,
                fontSize: "14px",
                textDecoration: "none",
                alignSelf: "flex-start",
              }}
            >
              {t("dashboard.continuarPostulacion")} →
            </Link>

            {/* Communications timeline */}
            <div>
              <p
                style={{
                  fontWeight: 700,
                  fontSize: "13px",
                  color: "var(--ink-light)",
                  marginBottom: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {t("comms.title")}
              </p>
              <ApplicantCommunicationsDashboard applicationId={activeApplication.id} />
            </div>
          </div>
        </div>
      )}

      {/* No active application — show process cards */}
      {!activeCycle && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--sand)",
            borderRadius: "var(--radius-lg)",
            padding: "20px 24px",
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--ink)" }}>
            {t("applicantProcesses.title")}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--ink-light)", marginBottom: "16px" }}>
            {t("applicantProcesses.description", { count: maxApplications })}
          </p>
          {orphanedDrafts.length > 0 && (
            <div
              style={{
                background: "var(--uwc-blue-soft)",
                border: "1px solid var(--uwc-blue)",
                borderRadius: "var(--radius)",
                padding: "12px 16px",
                fontSize: "13px",
                color: "var(--uwc-blue)",
                marginBottom: "8px",
              }}
            >
              {t("applicantProcesses.orphanedDraftNotice")}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {processes.filter((p) => p.is_active).map((process) => {
              const app = applicationMap.get(process.id);
              return (
                <div
                  key={process.id}
                  style={{
                    border: "1px solid var(--sand)",
                    borderRadius: "var(--radius)",
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "14px", margin: "0 0 4px" }}>{process.name}</p>
                    <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
                      Cierre etapa 1: {formatDate(process.stage1_close_at) ?? t("date.notConfigured")}
                    </p>
                  </div>
                  <Link
                    href={`/applicant/process/${process.id}`}
                    style={{
                      background: app ? "var(--uwc-blue)" : "var(--uwc-maroon)",
                      color: "#fff",
                      padding: "8px 16px",
                      borderRadius: "var(--radius)",
                      fontWeight: 600,
                      fontSize: "13px",
                      textDecoration: "none",
                      opacity: reachedLimit && !app ? 0.5 : 1,
                      pointerEvents: reachedLimit && !app ? "none" : "auto",
                    }}
                  >
                    {app
                      ? app.status === "draft"
                        ? t("dashboard.continuarPostulacion")
                        : t("applicantProcesses.open")
                      : reachedLimit
                        ? t("applicantProcesses.limit")
                        : t("applicantProcesses.start")}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Previous / inactive processes */}
      {otherProcesses.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowOldProcesses((prev) => !prev)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              color: "var(--ink-light)",
              fontWeight: 600,
              padding: "8px 0",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {showOldProcesses ? "▲" : "▼"} {t("dashboard.oldProcesses")} ({otherProcesses.length})
          </button>

          {showOldProcesses && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
              {otherProcesses.map((process) => {
                const app = applicationMap.get(process.id);
                return (
                  <div
                    key={process.id}
                    style={{
                      border: "1px solid var(--sand-light)",
                      borderRadius: "var(--radius)",
                      padding: "12px 16px",
                      background: "var(--cream)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                      opacity: 0.85,
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 600, fontSize: "13px", margin: "0 0 2px", color: "var(--ink)" }}>
                        {process.name}
                      </p>
                      {app && (
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <StageBadge stage={app.stage_code} />
                          <AppStatusBadge status={app.status} />
                        </div>
                      )}
                    </div>
                    {app && (
                      <Link
                        href={`/applicant/process/${process.id}`}
                        style={{
                          fontSize: "12px",
                          color: "var(--uwc-blue)",
                          textDecoration: "underline",
                        }}
                      >
                        Ver postulación
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating support form — always visible when there's an active application */}
      {activeCycle && activeApplication && (
        <ApplicantSupportForm applicationId={activeApplication.id} />
      )}
    </div>
  );
}
