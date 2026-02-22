import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadZone } from "@/components/upload-zone";

describe("UploadZone", () => {
  const defaultProps = {
    label: "Documento de identidad",
    hint: "Subir una copia escaneada",
    fileEntry: null,
    fileName: null,
    isUploading: false,
    disabled: false,
    onUpload: vi.fn(),
    language: "es" as const,
  };

  it("renders the label text", () => {
    render(<UploadZone {...defaultProps} />);
    expect(screen.getByText("Documento de identidad")).toBeInTheDocument();
  });

  it("renders the hint text when provided", () => {
    render(<UploadZone {...defaultProps} />);
    expect(screen.getByText("Subir una copia escaneada")).toBeInTheDocument();
  });

  it("does not render hint when not provided", () => {
    render(<UploadZone {...defaultProps} hint={undefined} />);
    expect(screen.queryByText("Subir una copia escaneada")).not.toBeInTheDocument();
  });

  it("renders drop zone when no file is present", () => {
    render(<UploadZone {...defaultProps} />);
    expect(screen.getByText(/Arrastra aquí o/)).toBeInTheDocument();
    expect(screen.getByText("selecciona archivo")).toBeInTheDocument();
    expect(screen.getByText(/max. 10 MB/)).toBeInTheDocument();
  });

  it("renders drop zone in English", () => {
    render(<UploadZone {...defaultProps} language="en" />);
    expect(screen.getByText(/Drag here or/)).toBeInTheDocument();
    expect(screen.getByText("select a file")).toBeInTheDocument();
  });

  it("renders file card when file exists", () => {
    render(
      <UploadZone
        {...defaultProps}
        fileEntry={{
          path: "bucket/file.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024 * 500,
          uploaded_at: "2026-02-18T20:00:00.000Z",
        }}
        fileName="mi-documento.pdf"
      />,
    );

    expect(screen.getByText("mi-documento.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    // Should show size (500 * 1024 = 512000 bytes = 500.0 KB)
    expect(screen.getByText(/500\.0 KB/)).toBeInTheDocument();
    // Should NOT show the drop zone
    expect(screen.queryByText(/Arrastra aqui/)).not.toBeInTheDocument();
  });

  it("shows replace button when file exists", () => {
    render(
      <UploadZone
        {...defaultProps}
        fileEntry={{ path: "bucket/file.pdf" }}
        fileName="file.pdf"
      />,
    );
    expect(screen.getByText("Reemplazar archivo")).toBeInTheDocument();
  });

  it("shows English replace text", () => {
    render(
      <UploadZone
        {...defaultProps}
        language="en"
        fileEntry={{ path: "bucket/file.pdf" }}
        fileName="file.pdf"
      />,
    );
    expect(screen.getByText("Replace file")).toBeInTheDocument();
  });

  it("shows uploading state in drop zone", () => {
    render(<UploadZone {...defaultProps} isUploading={true} />);
    expect(screen.getByText("Subiendo...")).toBeInTheDocument();
  });

  it("shows English uploading state", () => {
    render(<UploadZone {...defaultProps} language="en" isUploading={true} />);
    expect(screen.getByText("Uploading...")).toBeInTheDocument();
  });

  it("shows uploading state on replace button", () => {
    render(
      <UploadZone
        {...defaultProps}
        isUploading={true}
        fileEntry={{ path: "bucket/file.pdf" }}
        fileName="file.pdf"
      />,
    );
    expect(screen.getByText("Subiendo...")).toBeInTheDocument();
  });

  it("triggers onUpload when file input changes", () => {
    const onUpload = vi.fn();
    const { container } = render(<UploadZone {...defaultProps} onUpload={onUpload} />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = new File(["hello"], "test.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("disables file input when disabled prop is true", () => {
    const { container } = render(<UploadZone {...defaultProps} disabled={true} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);
  });

  it("disables file input when uploading", () => {
    const { container } = render(<UploadZone {...defaultProps} isUploading={true} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);
  });

  it("detects file type labels correctly", () => {
    const testCases = [
      { mime_type: "application/pdf", name: "doc.pdf", expected: "PDF" },
      { mime_type: "image/png", name: "img.png", expected: "PNG" },
      { mime_type: "image/jpeg", name: "photo.jpg", expected: "JPG" },
      { mime_type: "image/webp", name: "photo.webp", expected: "WEBP" },
    ];

    for (const tc of testCases) {
      const { unmount } = render(
        <UploadZone
          {...defaultProps}
          fileEntry={{
            path: "bucket/" + tc.name,
            mime_type: tc.mime_type,
            original_name: tc.name,
          }}
          fileName={tc.name}
        />,
      );
      expect(screen.getByText(tc.expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("falls back to FILE label for unknown types", () => {
    render(
      <UploadZone
        {...defaultProps}
        fileEntry={{
          path: "bucket/file.docx",
          mime_type: "application/msword",
          original_name: "file.docx",
        }}
        fileName="file.docx"
      />,
    );
    expect(screen.getByText("FILE")).toBeInTheDocument();
  });

  it("accepts correct file types in input", () => {
    const { container } = render(<UploadZone {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.accept).toBe(".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif");
  });
});
