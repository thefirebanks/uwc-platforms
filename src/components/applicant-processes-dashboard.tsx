"use client";

import { Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { useAppLanguage } from "@/components/language-provider";
import type { Application, SelectionProcess } from "@/types/domain";
import { StageBadge } from "@/components/stage-badge";

export type ApplicantApplicationSummary = Pick<
  Application,
  "id" | "cycle_id" | "status" | "stage_code" | "updated_at"
>;

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString();
}

export function ApplicantProcessesDashboard({
  processes,
  applications,
  maxApplications = 3,
}: {
  processes: SelectionProcess[];
  applications: ApplicantApplicationSummary[];
  maxApplications?: number;
}) {
  const { t } = useAppLanguage();
  const applicationMap = new Map(applications.map((application) => [application.cycle_id, application]));
  const reachedLimit = applications.length >= maxApplications;

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h5">{t("applicantProcesses.title")}</Typography>
          <Typography color="text.secondary">
            {t("applicantProcesses.description", { count: maxApplications })}
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            {t("applicantProcesses.current", { current: applications.length, max: maxApplications })}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t("applicantProcesses.available")}
          </Typography>
          <Stack spacing={2}>
            {processes.map((process) => {
              const application = applicationMap.get(process.id);

              return (
                <Card key={process.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1.2}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {process.name} {process.is_active ? `(${t("state.active")})` : ""}
                      </Typography>
                      <Typography color="text.secondary" variant="body2">
                        Stage 1: {formatDate(process.stage1_open_at) ?? t("date.notConfigured")} -{" "}
                        {formatDate(process.stage1_close_at) ?? t("date.notConfigured")}
                      </Typography>
                      <Typography color="text.secondary" variant="body2">
                        Stage 2: {formatDate(process.stage2_open_at) ?? t("date.notConfigured")} -{" "}
                        {formatDate(process.stage2_close_at) ?? t("date.notConfigured")}
                      </Typography>

                      {application ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2">{t("applicantProcesses.status")}</Typography>
                          <StageBadge stage={application.stage_code} />
                          <Typography variant="body2">{application.status}</Typography>
                        </Stack>
                      ) : null}

                      <Stack direction="row" spacing={1}>
                        {application ? (
                          <Button href={`/applicant/process/${process.id}`} variant="contained">
                            {t("applicantProcesses.open")}
                          </Button>
                        ) : reachedLimit ? (
                          <Button disabled variant="outlined">
                            {t("applicantProcesses.limit")}
                          </Button>
                        ) : (
                          <Button href={`/applicant/process/${process.id}`} variant="contained">
                            {t("applicantProcesses.start")}
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
