import type { Database } from "@/types/supabase";

type CycleRow = Database["public"]["Tables"]["cycles"]["Row"];
type CycleTemplateInsert = Database["public"]["Tables"]["cycle_stage_templates"]["Insert"];

export function buildDefaultCycleStageTemplates({
  cycleId,
  stage1CloseAt,
  stage2CloseAt,
}: {
  cycleId: CycleRow["id"];
  stage1CloseAt: CycleRow["stage1_close_at"];
  stage2CloseAt: CycleRow["stage2_close_at"];
}): CycleTemplateInsert[] {
  return [
    {
      cycle_id: cycleId,
      stage_code: "documents",
      stage_label: "Stage 1: Documentos",
      milestone_label: "Recepción y validación documental",
      due_at: stage1CloseAt,
      sort_order: 1,
    },
    {
      cycle_id: cycleId,
      stage_code: "exam_placeholder",
      stage_label: "Stage 2: Examen (placeholder)",
      milestone_label: "Evaluación externa y consolidación",
      due_at: stage2CloseAt,
      sort_order: 2,
    },
  ];
}
