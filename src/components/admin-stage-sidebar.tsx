"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CycleStageTemplate } from "@/types/domain";

const STORAGE_KEY = "uwc:admin-sidebar-collapsed";

interface AdminStageSidebarProps {
  cycleId: string;
  cycleName: string;
  stages: CycleStageTemplate[];
}

export function AdminStageSidebar({ cycleId, cycleName, stages }: AdminStageSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCreatingStage, setIsCreatingStage] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Determine active stage from URL: /admin/process/[cycleId]/stage/[stageId]
  const activeStageId = pathname.split(`/stage/`)[1]?.split("/")[0];

  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

  // Read collapsed state from localStorage on mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "1") setIsCollapsed(true);
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  // Persist collapsed state + toggle class on .admin-shell ancestor
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, isCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
    const shell = document.querySelector(".admin-shell");
    if (shell) {
      shell.classList.toggle("sidebar-collapsed", isCollapsed);
    }
  }, [isCollapsed]);

  // Escape key closes mobile drawer
  useEffect(() => {
    if (!isMobileOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsMobileOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  async function handleCreateStage() {
    setIsCreatingStage(true);
    try {
      const response = await fetch(`/api/cycles/${cycleId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return;
      const body = (await response.json()) as { template: CycleStageTemplate };
      router.push(`/admin/process/${cycleId}/stage/${body.template.id}`);
      router.refresh();
    } finally {
      setIsCreatingStage(false);
    }
  }

  return (
    <>
      {/* Mobile toggle button — only visible at ≤980px */}
      <button
        type="button"
        className="sidebar-mobile-toggle"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Abrir menú de etapas"
        aria-expanded={isMobileOpen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        Etapas
      </button>

      {/* Backdrop for mobile drawer */}
      {isMobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "sidebar",
          isCollapsed ? "sidebar--collapsed" : "",
          isMobileOpen ? "sidebar--mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Collapse toggle — lives inside sidebar for mini rail */}
        <div className="sidebar-toggle-row">
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-label={isCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isCollapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile close button */}
        <button
          type="button"
          className="sidebar-mobile-close"
          onClick={() => setIsMobileOpen(false)}
          aria-label="Cerrar menú de etapas"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="sidebar-header">
          <Link href="/admin/processes" className="admin-sidebar-backlink">
            <div className="eyebrow">← Volver a procesos</div>
          </Link>
          <h2 className="admin-sidebar-title">{cycleName}</h2>
        </div>

        <div className="sidebar-nav">
          <div className="builder-section-title admin-sidebar-section-title">
            Etapas del Proceso
          </div>
          {sortedStages.map((template, index) => {
            const title =
              template.stage_code === "documents"
                ? "Formulario Principal"
                : template.stage_code === "exam_placeholder"
                  ? "Examen Académico"
                  : template.stage_label;
            const subtitle =
              template.stage_code === "documents"
                ? "Formulario extenso"
                : template.stage_code === "exam_placeholder"
                  ? "Evaluación externa"
                  : "Etapa personalizada";
            const isActive = template.id === activeStageId;

            return (
              <Link
                key={template.id}
                href={`/admin/process/${cycleId}/stage/${template.id}`}
                className={`stage-item ${isActive ? "active" : ""}`}
                title={isCollapsed ? title : undefined}
                onClick={() => setIsMobileOpen(false)}
              >
                <div className="stage-icon">{index + 1}</div>
                <div className="stage-info">
                  <div className="stage-title">{title}</div>
                  <div className="stage-type">{subtitle}</div>
                </div>
              </Link>
            );
          })}
          <div className="admin-sidebar-footer">
            <button
              type="button"
              className="btn btn-ghost admin-sidebar-add-stage"
              onClick={() => void handleCreateStage()}
              disabled={isCreatingStage}
              title={isCollapsed ? "Añadir etapa" : undefined}
            >
              {isCollapsed
                ? (isCreatingStage ? "…" : "+")
                : (isCreatingStage ? "Creando etapa..." : "+ Añadir etapa")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
