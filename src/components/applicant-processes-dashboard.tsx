import { Button, Card, CardContent, Stack, Typography } from "@mui/material";
import type { Application, SelectionProcess } from "@/types/domain";
import { StageBadge } from "@/components/stage-badge";

export type ApplicantApplicationSummary = Pick<
  Application,
  "id" | "cycle_id" | "status" | "stage_code" | "updated_at"
>;

function formatDate(value: string | null) {
  if (!value) {
    return "No configurada";
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
  const applicationMap = new Map(applications.map((application) => [application.cycle_id, application]));
  const reachedLimit = applications.length >= maxApplications;

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h5">Tus procesos de selección</Typography>
          <Typography color="text.secondary">
            Puedes postular a un máximo de {maxApplications} procesos en distintos años.
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            Postulaciones actuales: {applications.length}/{maxApplications}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Procesos disponibles
          </Typography>
          <Stack spacing={2}>
            {processes.map((process) => {
              const application = applicationMap.get(process.id);

              return (
                <Card key={process.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1.2}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {process.name} {process.is_active ? "(Activo)" : ""}
                      </Typography>
                      <Typography color="text.secondary" variant="body2">
                        Stage 1: {formatDate(process.stage1_open_at)} - {formatDate(process.stage1_close_at)}
                      </Typography>
                      <Typography color="text.secondary" variant="body2">
                        Stage 2: {formatDate(process.stage2_open_at)} - {formatDate(process.stage2_close_at)}
                      </Typography>

                      {application ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2">Estado:</Typography>
                          <StageBadge stage={application.stage_code} />
                          <Typography variant="body2">{application.status}</Typography>
                        </Stack>
                      ) : null}

                      <Stack direction="row" spacing={1}>
                        {application ? (
                          <Button href={`/applicant/process/${process.id}`} variant="contained">
                            Abrir postulación
                          </Button>
                        ) : reachedLimit ? (
                          <Button disabled variant="outlined">
                            Límite alcanzado
                          </Button>
                        ) : (
                          <Button href={`/applicant/process/${process.id}`} variant="contained">
                            Iniciar postulación
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
