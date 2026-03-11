"use client";

import React, { type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI. Defaults to a built-in error card. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Root-level error boundary that catches unhandled React errors.
 * Renders a user-friendly error card with a "Reintentar" button.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Unhandled error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            padding: "2rem",
            textAlign: "center",
            fontFamily: "var(--font-body), system-ui, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              padding: "2rem",
              borderRadius: 12,
              border: "1px solid var(--sand, #e5e0dc)",
              background: "var(--surface, #fff)",
            }}
          >
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.2rem" }}>
              Ocurrió un error inesperado
            </h2>
            <p style={{ margin: "0 0 1.5rem", color: "var(--muted, #666)", fontSize: "0.9rem" }}>
              Algo salió mal. Intenta recargar la página o haz clic en el botón de abajo.
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{
                padding: "0.6rem 1.5rem",
                borderRadius: 8,
                border: "1px solid var(--sand, #e5e0dc)",
                background: "var(--primary, #1a1a1a)",
                color: "#fff",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
