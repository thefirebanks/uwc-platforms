function SkeletonLine({
  width = "100%",
  height = 12,
}: {
  width?: string;
  height?: number;
}) {
  return (
    <div
      className="admin-route-loading-block"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export default function AdminLoading() {
  return (
    <div className="admin-route-loading" aria-label="Cargando vista de administración">
      <div className="admin-route-loading-header">
        <div className="admin-route-loading-header-copy">
          <div className="admin-route-loading-title" aria-hidden="true" />
          <div className="admin-route-loading-subtitle" aria-hidden="true" />
        </div>
        <div className="admin-route-loading-actions" aria-hidden="true">
          <div className="admin-route-loading-action admin-route-loading-block" />
          <div className="admin-route-loading-action admin-route-loading-block" />
        </div>
      </div>

      <div className="admin-route-loading-body">
        <div className="admin-route-loading-shell">
          <div className="admin-route-loading-grid" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="admin-route-loading-stat" key={index}>
                <div className="admin-route-loading-lines">
                  <SkeletonLine width="54%" height={10} />
                  <SkeletonLine width="28%" height={28} />
                  <SkeletonLine width="42%" height={10} />
                </div>
              </div>
            ))}
          </div>

          <div className="admin-route-loading-table" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <div className="admin-route-loading-table-row" key={rowIndex}>
                <SkeletonLine width={rowIndex === 0 ? "72%" : "84%"} />
                <SkeletonLine width="70%" />
                <SkeletonLine width="62%" />
                <SkeletonLine width="58%" />
                <SkeletonLine width="44%" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
