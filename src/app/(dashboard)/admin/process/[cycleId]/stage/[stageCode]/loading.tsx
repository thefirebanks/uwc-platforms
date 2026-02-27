export default function AdminStageRouteLoading() {
  return (
    <div className="view active admin-stage-editor-view">
      <main className="main">
        {/* Canvas Header skeleton */}
        <div className="canvas-header">
          {/* Stage status badge */}
          <div
            className="admin-route-loading-block"
            style={{ width: 96, height: 20, borderRadius: 999, marginBottom: 16 }}
          />

          {/* Title row */}
          <div className="canvas-title-row">
            <div>
              <div
                className="admin-route-loading-block"
                style={{ width: 240, height: 28, borderRadius: 999, marginBottom: 8 }}
              />
              <div
                className="admin-route-loading-block"
                style={{ width: 340, height: 13, borderRadius: 999 }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div
                className="admin-route-loading-block"
                style={{ width: 178, height: 36, borderRadius: 6 }}
              />
              <div
                className="admin-route-loading-block"
                style={{ width: 158, height: 36, borderRadius: 6 }}
              />
            </div>
          </div>

          {/* Save status row */}
          <div
            className="admin-route-loading-block"
            style={{ width: 140, height: 12, borderRadius: 999, marginBottom: 18 }}
          />

          {/* Tabs */}
          <div className="page-tabs" style={{ pointerEvents: "none" }}>
            {[170, 140, 155, 110].map((w, i) => (
              <div
                key={i}
                className="admin-route-loading-block"
                style={{ width: w, height: 14, borderRadius: 999, marginBottom: 14 }}
              />
            ))}
          </div>
        </div>

        {/* Content body skeleton */}
        <div className="admin-stage-loading-body">
          {[3, 2, 4].map((fieldCount, sectionIdx) => (
            <div key={sectionIdx} className="admin-stage-loading-section">
              {/* Section header */}
              <div className="admin-stage-loading-section-header">
                <div
                  className="admin-route-loading-block"
                  style={{ width: [150, 110, 130][sectionIdx], height: 13, borderRadius: 999 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  {[28, 28, 28].map((sz, i) => (
                    <div
                      key={i}
                      className="admin-route-loading-block"
                      style={{ width: sz, height: sz, borderRadius: 6 }}
                    />
                  ))}
                </div>
              </div>

              {/* Field rows */}
              {Array.from({ length: fieldCount }).map((_, fieldIdx) => (
                <div key={fieldIdx} className="admin-stage-loading-field-row">
                  <div className="admin-stage-loading-field-label admin-route-loading-block" />
                  <div className="admin-stage-loading-field-input admin-route-loading-block" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
