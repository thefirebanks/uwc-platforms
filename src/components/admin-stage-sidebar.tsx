"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { CycleStageTemplate } from "@/types/domain";

interface AdminStageSidebarProps {
  cycleId: string;
  cycleName: string;
  stages: CycleStageTemplate[];
}

export function AdminStageSidebar({ cycleId, cycleName, stages }: AdminStageSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCreatingStage, setIsCreatingStage] = useState(false);

  // Determine active stage from URL: /admin/process/[cycleId]/stage/[stageId]
  const activeStageId = pathname.split(`/stage/`)[1]?.split("/")[0];

  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

  async function handleCreateStage() {
    setIsCreatingStage(true);
    try {
      const response = await fetch(`/api/cycles/${cycleId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return;
      const body = await response.json() as { template: CycleStageTemplate };
      router.push(`/admin/process/${cycleId}/stage/${body.template.id}`);
      router.refresh();
    } finally {
      setIsCreatingStage(false);
    }
  }

  return (
    <aside className="sidebar">
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
          >
            {isCreatingStage ? "Creando etapa..." : "+ Añadir etapa"}
          </button>
        </div>
      </div>
    </aside>
  );
}
