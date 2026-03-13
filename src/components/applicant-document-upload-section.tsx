"use client";

import type { ChangeEvent, ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { UploadZone } from "@/components/upload-zone";
import type { AppLanguage } from "@/lib/i18n/messages";
import type { CycleStageField } from "@/types/domain";
import { parseFileEntry, type ApplicationFileValue } from "@/lib/client/applicant-utils";

interface ApplicantDocumentUploadSectionProps {
  /** Optional metadata fields rendered above the upload zones (via parent's renderEditableFields) */
  metadataContent?: ReactNode;
  fileStageFields: CycleStageField[];
  applicationFiles: Record<string, ApplicationFileValue> | null | undefined;
  applicationId: string | null | undefined;
  uploadingFieldKey: string | null;
  isEditingEnabled: boolean;
  language: AppLanguage;
  onUpload: (fieldKey: string, event: ChangeEvent<HTMLInputElement>) => void;
  getFieldLabel: (params: { sectionId: string; field: CycleStageField; language: AppLanguage }) => string;
  getFieldHelpText: (field: CycleStageField, language: AppLanguage) => string | null | undefined;
  copy: (spanish: string, english: string) => string;
}

/**
 * Document upload grid for file-type stage fields.
 * Shows one UploadZone per file field with upload status and file metadata.
 */
export function ApplicantDocumentUploadSection({
  metadataContent,
  fileStageFields,
  applicationFiles,
  applicationId,
  uploadingFieldKey,
  isEditingEnabled,
  language,
  onUpload,
  getFieldLabel,
  getFieldHelpText,
  copy,
}: ApplicantDocumentUploadSectionProps) {
  return (
    <Box>
      {metadataContent ? (
        <Box sx={{ mb: 2 }}>
          {metadataContent}
        </Box>
      ) : null}

      <Stack spacing={3}>
        {fileStageFields.map((field) => {
          const rawValue = applicationFiles?.[field.field_key] ?? null;
          const fileEntry = parseFileEntry(rawValue);
          const fileName = fileEntry?.original_name ?? null;

          return (
            <UploadZone
              key={field.id}
              label={getFieldLabel({ sectionId: "documents", field, language })}
              hint={getFieldHelpText(field, language) ?? undefined}
              fileEntry={fileEntry ? {
                path: fileEntry.path,
                title: fileEntry.title ?? undefined,
                original_name: fileEntry.original_name ?? undefined,
                mime_type: fileEntry.mime_type ?? undefined,
                size_bytes: fileEntry.size_bytes ?? undefined,
                uploaded_at: fileEntry.uploaded_at ?? undefined,
              } : null}
              fileName={fileName}
              isUploading={uploadingFieldKey === field.field_key}
              disabled={!applicationId || !isEditingEnabled}
              onUpload={(event) => onUpload(field.field_key, event)}
              language={language}
            />
          );
        })}
      </Stack>
      {!applicationId ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontSize: "0.78rem" }}>
          {copy("Guarda primero un borrador para habilitar la subida.", "Save a draft first to enable uploads.")}
        </Typography>
      ) : null}
    </Box>
  );
}
