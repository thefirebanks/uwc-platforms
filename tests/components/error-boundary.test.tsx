import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/error-boundary";

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>Child content</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Hello")).toBeDefined();
  });

  it("shows error UI when a child throws", () => {
    // Suppress console.error for the expected error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Ocurrió un error inesperado")).toBeDefined();
    expect(screen.getByText("Reintentar")).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("recovers when Reintentar is clicked", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Use a stateful wrapper to control throwing
    let shouldThrow = true;
    function Wrapper() {
      if (shouldThrow) {
        throw new Error("boom");
      }
      return <div>Recovered</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <Wrapper />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Reintentar")).toBeDefined();

    // Stop throwing and click retry
    shouldThrow = false;
    fireEvent.click(screen.getByText("Reintentar"));

    rerender(
      <ErrorBoundary>
        <Wrapper />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Recovered")).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("renders custom fallback when provided", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom fallback")).toBeDefined();

    consoleSpy.mockRestore();
  });
});
