import Chip from "@mui/material/Chip";
import type { StageCode } from "@/types/domain";

const labelMap: Record<StageCode, string> = {
  documents: "Stage 1: Documentos",
  exam_placeholder: "Stage 2: Examen (Placeholder)",
};

export function StageBadge({ stage }: { stage: StageCode }) {
  return <Chip color="primary" variant="outlined" label={labelMap[stage]} />;
}
