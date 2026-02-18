import Chip from "@mui/material/Chip";
import type { StageCode } from "@/types/domain";

const labelMap: Record<StageCode, string> = {
  documents: "Stage 1: Documentos",
  exam_placeholder: "Stage 2: Examen (Placeholder)",
};

type BadgeVariant = "progress" | "complete" | "pending";

interface StageBadgeProps {
  stage: StageCode;
  variant?: BadgeVariant;
}

export function StageBadge({ stage, variant = "progress" }: StageBadgeProps) {
  const colorMap: Record<BadgeVariant, "primary" | "success" | "default"> = {
    progress: "primary",
    complete: "success",
    pending: "default",
  };

  return (
    <Chip
      label={labelMap[stage]}
      color={colorMap[variant]}
      size="small"
      sx={{
        borderRadius: 0,
        fontWeight: 600,
        fontSize: "0.6875rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        px: 1.5,
        py: 0.5,
        ...(variant === "pending" && {
          backgroundColor: "var(--cream)",
          color: "var(--muted)",
        }),
      }}
    />
  );
}

interface StatusBadgeProps {
  status: "complete" | "in_progress" | "pending" | "not_started";
  label?: string;
}

const statusLabels: Record<StatusBadgeProps["status"], string> = {
  complete: "Completado",
  in_progress: "En Progreso",
  pending: "Pendiente",
  not_started: "No Iniciado",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const displayLabel = label ?? statusLabels[status];

  const styles: Record<StatusBadgeProps["status"], { bg: string; color: string }> = {
    complete: { bg: "var(--success-soft)", color: "var(--success)" },
    in_progress: { bg: "var(--uwc-maroon-soft)", color: "var(--uwc-maroon)" },
    pending: { bg: "var(--cream)", color: "var(--muted)" },
    not_started: { bg: "var(--cream)", color: "var(--muted)" },
  };

  return (
    <Chip
      label={displayLabel}
      size="small"
      sx={{
        borderRadius: 0,
        fontWeight: 600,
        fontSize: "0.6875rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        px: 1.5,
        py: 0.5,
        backgroundColor: styles[status].bg,
        color: styles[status].color,
      }}
    />
  );
}
