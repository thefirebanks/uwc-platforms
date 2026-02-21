"use client";

import Chip from "@mui/material/Chip";
import { useAppLanguage } from "@/components/language-provider";
import type { StageCode } from "@/types/domain";

type BadgeVariant = "progress" | "complete" | "pending";

interface StageBadgeProps {
  stage: StageCode;
  variant?: BadgeVariant;
}

export function StageBadge({ stage, variant = "progress" }: StageBadgeProps) {
  const { t } = useAppLanguage();
  const labelMap: Record<StageCode, string> = {
    documents: t("stage.documents"),
    exam_placeholder: t("stage.exam"),
  };
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

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const { t } = useAppLanguage();
  const statusLabels: Record<StatusBadgeProps["status"], string> = {
    complete: t("status.complete"),
    in_progress: t("status.inProgress"),
    pending: t("status.pending"),
    not_started: t("status.notStarted"),
  };
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
