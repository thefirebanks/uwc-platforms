import Link from "next/link";

export type AdminHomeStat = {
  title: string;
  value: string;
  trendLabel: string;
  trendTone: "up" | "down" | "neutral";
};

export type AdminHomeActivity = {
  id: string;
  text: string;
  timeLabel: string;
  icon: string;
  iconTone: "blue" | "green";
  actionHref?: string;
  actionLabel?: string;
};

export function AdminHomeDashboard({
  activeProcessName,
  activeProcessEditorHref,
  stats,
  activities,
}: {
  activeProcessName: string | null;
  activeProcessEditorHref: string | null;
  stats: AdminHomeStat[];
  activities: AdminHomeActivity[];
}) {
  return (
    <main className="main full-width">
      <div className="canvas-header admin-processes-header">
        <div className="canvas-title-row">
          <div>
            <h1 className="admin-processes-title">{"¡Hola, Admin!"}</h1>
            <p className="admin-processes-description">
              {activeProcessName
                ? `Aquí tienes el resumen del proceso activo "${activeProcessName}".`
                : "Aquí tienes el resumen del estado actual de la plataforma."}
            </p>
          </div>
          {activeProcessEditorHref ? (
            <Link href={activeProcessEditorHref} className="btn btn-primary">
              {"Ir al Editor del Proceso activo →"}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="canvas-body wide">
        <div className="dashboard-grid">
          {stats.map((stat) => (
            <div key={stat.title} className="stat-card">
              <div className="stat-title">{stat.title}</div>
              <div className="stat-value">{stat.value}</div>
              <div className={`stat-trend ${stat.trendTone === "down" ? "down" : stat.trendTone === "neutral" ? "neutral" : ""}`}>
                {stat.trendLabel}
              </div>
            </div>
          ))}
        </div>

        <div className="section-title">{"Actividad Reciente"}</div>
        <div className="activity-list">
          {activities.length === 0 ? (
            <div className="activity-item">
              <div className="activity-icon" aria-hidden="true">
                •
              </div>
              <div className="activity-details">
                <div className="activity-text">{"Aún no hay actividad para mostrar."}</div>
                <div className="activity-time">{"Se actualizará cuando ingresen postulaciones."}</div>
              </div>
            </div>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="activity-item">
                <div
                  className="activity-icon"
                  style={
                    activity.iconTone === "green"
                      ? {
                          background: "var(--success-soft)",
                          color: "var(--success)",
                        }
                      : undefined
                  }
                  aria-hidden="true"
                >
                  {activity.icon}
                </div>
                <div className="activity-details">
                  <div className="activity-text">{activity.text}</div>
                  <div className="activity-time">{activity.timeLabel}</div>
                </div>
                {activity.actionHref && activity.actionLabel ? (
                  <Link href={activity.actionHref} className="btn btn-ghost">
                    {activity.actionLabel}
                  </Link>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

