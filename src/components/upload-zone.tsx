"use client";

import { type ChangeEvent, useCallback, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";

/* ── Types ──────────────────────────────────────────────────── */

interface FileEntry {
  path: string;
  title?: string;
  original_name?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at?: string;
}

interface UploadZoneProps {
  label: string;
  hint?: string;
  fileEntry: FileEntry | null;
  fileName: string | null;
  isUploading: boolean;
  disabled: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  language: "es" | "en";
}

/* ── Helpers ────────────────────────────────────────────────── */

function copy(es: string, en: string, language: "es" | "en") {
  return language === "en" ? en : es;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(mimeType?: string, name?: string): string {
  if (mimeType?.includes("pdf") || name?.endsWith(".pdf")) return "PDF";
  if (mimeType?.includes("png") || name?.endsWith(".png")) return "PNG";
  if (mimeType?.includes("jpeg") || mimeType?.includes("jpg") || name?.endsWith(".jpg") || name?.endsWith(".jpeg")) return "JPG";
  if (mimeType?.includes("webp") || name?.endsWith(".webp")) return "WEBP";
  return "FILE";
}

/* ── Component ──────────────────────────────────────────────── */

export function UploadZone({
  label,
  hint,
  fileEntry,
  fileName,
  isUploading,
  disabled,
  onUpload,
  language,
}: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    // The actual upload is handled by the hidden input's onChange
    // Drag-and-drop requires programmatic file assignment to input
    // For now the zone acts as a visual target; click triggers the real input
  }, []);

  return (
    <Box>
      {/* Label */}
      <Typography
        sx={{
          fontSize: "0.78rem",
          fontWeight: 500,
          color: "var(--ink)",
          mb: "5px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        {label}
      </Typography>
      {hint ? (
        <Typography sx={{ fontSize: "0.7rem", color: "var(--muted)", mb: 1 }}>
          {hint}
        </Typography>
      ) : null}

      {/* Uploaded file card */}
      {fileEntry && fileName ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: "14px",
            py: "12px",
            background: "var(--surface, #fff)",
            border: "1.5px solid var(--sand)",
            borderRadius: "var(--radius)",
            mt: "10px",
          }}
        >
          {/* File type badge */}
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "6px",
              background: "var(--uwc-maroon-soft, #FAF0F2)",
              color: "var(--uwc-maroon)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.6rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {fileTypeLabel(fileEntry.mime_type, fileName)}
          </Box>
          {/* File info */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: "0.8rem",
                fontWeight: 500,
                color: "var(--ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {fileName}
            </Typography>
            <Typography sx={{ fontSize: "0.68rem", color: "var(--muted)" }}>
              {[
                formatFileSize(fileEntry.size_bytes),
                fileEntry.uploaded_at
                  ? copy("Subido", "Uploaded", language) +
                    " " +
                    new Date(fileEntry.uploaded_at).toLocaleDateString(
                      language === "en" ? "en-US" : "es-PE",
                      { day: "numeric", month: "short", year: "numeric" },
                    )
                  : null,
              ]
                .filter(Boolean)
                .join(" \u00b7 ")}
            </Typography>
          </Box>
        </Box>
      ) : null}

      {/* Upload drop zone */}
      {!fileEntry || !fileName ? (
        <Box
          component="label"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            display: "block",
            border: "2px dashed var(--sand)",
            borderRadius: "var(--radius-lg, 12px)",
            p: "28px",
            textAlign: "center",
            background: dragging ? "var(--uwc-maroon-soft, #FAF0F2)" : "var(--cream)",
            cursor: disabled ? "default" : "pointer",
            transition: "all 0.2s",
            borderColor: dragging ? "var(--uwc-maroon)" : "var(--sand)",
            transform: dragging ? "scale(1.01)" : "none",
            opacity: disabled ? 0.5 : 1,
            "&:hover": disabled
              ? {}
              : {
                  borderColor: "var(--uwc-maroon)",
                  background: "var(--uwc-maroon-soft, #FAF0F2)",
                },
          }}
        >
          {/* Upload icon */}
          <Box
            component="svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            sx={{
              width: 36,
              height: 36,
              mx: "auto",
              mb: "10px",
              color: "var(--muted)",
            }}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </Box>
          <Typography sx={{ fontSize: "0.82rem", color: "var(--ink-light, #5A5450)" }}>
            {isUploading
              ? copy("Subiendo...", "Uploading...", language)
              : (
                  <>
                    {copy("Arrastra aqu\u00ed o ", "Drag here or ", language)}
                    <Typography
                      component="strong"
                      sx={{ color: "var(--uwc-maroon)", fontWeight: 500, fontSize: "inherit" }}
                    >
                      {copy("selecciona archivo", "select a file", language)}
                    </Typography>
                  </>
                )}
          </Typography>
          <Typography sx={{ fontSize: "0.7rem", color: "var(--muted)", mt: "4px" }}>
            PDF, PNG, JPG &middot; {copy("max. 10 MB", "max. 10 MB", language)}
          </Typography>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
            hidden
            disabled={disabled || isUploading}
            onChange={onUpload}
          />
        </Box>
      ) : null}

      {/* Replace button for existing files */}
      {fileEntry && fileName ? (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Box
            component="label"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              px: 2,
              py: 0.75,
              fontSize: "0.78rem",
              fontWeight: 500,
              color: "var(--uwc-maroon)",
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.5 : 1,
              "&:hover": disabled ? {} : { textDecoration: "underline" },
            }}
          >
            {isUploading
              ? copy("Subiendo...", "Uploading...", language)
              : copy("Reemplazar archivo", "Replace file", language)}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
              hidden
              disabled={disabled || isUploading}
              onChange={onUpload}
            />
          </Box>
        </Stack>
      ) : null}
    </Box>
  );
}
