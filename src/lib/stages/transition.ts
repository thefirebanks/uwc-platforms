import type { ApplicationStatus, StageCode } from "@/types/domain";

interface TransitionContext {
  fromStage: StageCode;
  toStage: StageCode;
  status: ApplicationStatus;
}

export function canTransition({ fromStage, toStage, status }: TransitionContext) {
  if (fromStage === "documents" && toStage === "exam_placeholder") {
    return status === "eligible" || status === "advanced";
  }

  if (fromStage === "exam_placeholder" && toStage === "documents") {
    return true;
  }

  return false;
}
