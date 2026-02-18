import type { StageCode } from "@/types/domain";

export const STAGES: Record<StageCode, { label: string; description: string }> = {
  documents: {
    label: "Stage 1 · Document Submission",
    description:
      "Applicants complete forms, upload documents, and request recommendations.",
  },
  exam_placeholder: {
    label: "Stage 2 · Exam Placeholder",
    description:
      "External written exam results are imported and tracked in-platform.",
  },
};
