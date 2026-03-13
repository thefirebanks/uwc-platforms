"use client";

import { startTransition, type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  IconButton,
  Typography,
} from "@mui/material";
import { ApplicantFormFields } from "@/components/applicant-form-fields";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useAppLanguage } from "@/components/language-provider";
import { ApplicantSidebar, type SidebarStep } from "@/components/applicant-sidebar";
import { ApplicantMobileProgress } from "@/components/applicant-mobile-progress";
import { ApplicantActionBar } from "@/components/applicant-action-bar";
import { ApplicantTopNav } from "@/components/applicant-top-nav";
import type { Application, CycleStageField, RecommenderRole, StageSection } from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
import { ApplicantPreparationChecklist } from "@/components/applicant-preparation-checklist";
import { ApplicantReviewSubmit } from "@/components/applicant-review-submit";
import { ApplicantDocumentUploadSection } from "@/components/applicant-document-upload-section";
import { ApplicantRecommendersSection, type RecommenderSummary } from "@/components/applicant-recommenders-section";
import { validateStagePayload } from "@/lib/stages/form-schema";
import { buildFallbackStageFields } from "@/lib/stages/stage-field-fallback";
import {
  groupFieldsBySections,
  type ResolvedSection,
} from "@/lib/stages/applicant-sections";
import { roleLabel } from "@/lib/utils/domain-labels";
import {
  fetchApi,
  toNormalizedApiError,
  type NormalizedApiError,
} from "@/lib/client/api-client";
import {
  normalizeEmailAddress,
  parseFileEntry,
  type ApplicationFileValue,
} from "@/lib/client/applicant-utils";
import {
  EMPTY_STAGE_FIELDS,
  PREP_SECTION_ID,
  SIDEBAR_VISIBILITY_STORAGE_KEY,
  SECTION_TITLES_ES,
  SECTION_TITLES_EN,
  SECTION_DESCRIPTIONS_EN,
  getLocalizedDisplayFieldLabel,
  getLocalizedFieldHelpText,
  getPayloadValue,
  isMeaningfulValue,
  getStepState,
  formatSaveStatusLabel,
  getSectionFieldStatus,
  getInitialActiveSectionId,
  isCurrentStageReadOnly,
  isCurrentStageSubmissionComplete,
  type ProgressState,
  type SaveState,
  type WizardSectionId,
} from "@/lib/client/applicant-form-helpers";

export function ApplicantApplicationForm({
  existingApplication,
  cycleId,
  accountDisplayName,
  accountEmail,
  cycleName,
  stageCode,
  stageLabel,
  stageInstructions,
  stageFields,
  stageCloseAt,
  initialRecommenders = [],
  sections = [],
}: {
  existingApplication: Application | null;
  cycleId: string;
  accountDisplayName?: string | null;
  accountEmail?: string | null;
  cycleName?: string;
  stageCode?: string;
  stageLabel?: string;
  stageInstructions?: string;
  stageFields?: CycleStageField[];
  stageCloseAt?: string | null;
  initialRecommenders?: RecommenderSummary[];
  sections?: StageSection[];
}) {
  const { language } = useAppLanguage();
  const isEnglish = language === "en";
  const locale = isEnglish ? "en-US" : "es-PE";
  const copy = useCallback((spanish: string, english: string) => (isEnglish ? english : spanish), [isEnglish]);
  const staticSectionTitles: Record<string, string> = isEnglish ? SECTION_TITLES_EN : SECTION_TITLES_ES;

  const [application, setApplication] = useState<Application | null>(existingApplication);
  const [error, setError] = useState<NormalizedApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [recommenders, setRecommenders] = useState<RecommenderSummary[]>(initialRecommenders);
  const [recommenderInputs, setRecommenderInputs] = useState<{ mentor: string; friend: string }>({
    mentor:
      initialRecommenders.find((row) => row.role === "mentor" && !row.invalidatedAt)?.email ?? "",
    friend:
      initialRecommenders.find((row) => row.role === "friend" && !row.invalidatedAt)?.email ?? "",
  });
  const [loadingRecommenders, setLoadingRecommenders] = useState(false);
  const [savingRecommenderRole, setSavingRecommenderRole] = useState<RecommenderRole | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [uploadingFieldKey, setUploadingFieldKey] = useState<string | null>(null);
  const [fileTitleEdits, setFileTitleEdits] = useState<Record<string, string>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(existingApplication?.updated_at ?? null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [activeSectionId, setActiveSectionId] = useState<WizardSectionId>(
    getInitialActiveSectionId({
      cycleId,
      stageCode,
      stageFields,
      sections,
    }),
  );
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);

  const isStageClosed = Boolean(stageCloseAt && Date.parse(stageCloseAt) < Date.now());
  const isLocked = isCurrentStageReadOnly({ application, stageCode });
  const isEditingEnabled = !isStageClosed && (!isLocked || isEditMode);
  const providedStageFields = stageFields ?? EMPTY_STAGE_FIELDS;
  const initialApplicationIdRef = useRef<string | null>(existingApplication?.id ?? null);
  const skippedInitialRecommenderFetchRef = useRef(false);
  const formValuesRef = useRef<Record<string, string>>({});
  const hasPendingChangesRef = useRef(false);
  const isSavingDraftRef = useRef(false);
  const isEditingEnabledRef = useRef(isEditingEnabled);
  const isLockedRef = useRef(isLocked);
  const saveQueuedRef = useRef(false);
  const localEditRevisionRef = useRef(0);
  const forceHydrateFormValuesRef = useRef(true);
  const previousHydratedApplicationIdRef = useRef<string | null>(existingApplication?.id ?? null);

  const refreshApplicationSnapshot = useCallback(
    async ({ includeRecommenders = true }: { includeRecommenders?: boolean } = {}) => {
      const [applicationResponse, recommenderResponse] = await Promise.all([
        fetchApi<{ application?: Application | null }>(`/api/applications?cycleId=${cycleId}`).catch(
          () => null,
        ),
        includeRecommenders && application?.id
          ? fetchApi<{ recommenders?: RecommenderSummary[] }>(
            `/api/recommendations?applicationId=${application.id}`,
          ).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (applicationResponse?.application) {
        startTransition(() => {
          setApplication(applicationResponse.application ?? null);
          setLastSavedAt(applicationResponse.application?.updated_at ?? null);
        });
      }

      if (recommenderResponse) {
        const rows = recommenderResponse.recommenders ?? [];
        startTransition(() => {
          setRecommenders(rows);
          setRecommenderInputs({
            mentor: rows.find((row) => row.role === "mentor" && !row.invalidatedAt)?.email ?? "",
            friend: rows.find((row) => row.role === "friend" && !row.invalidatedAt)?.email ?? "",
          });
        });
      }
    },
    [application?.id, cycleId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const saved = window.localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY);
    if (saved === "1") {
      setIsSidebarHidden(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_VISIBILITY_STORAGE_KEY, isSidebarHidden ? "1" : "0");
  }, [isSidebarHidden]);

  useEffect(() => {
    formValuesRef.current = formValues;
  }, [formValues]);

  useEffect(() => {
    hasPendingChangesRef.current = hasPendingChanges;
  }, [hasPendingChanges]);

  useEffect(() => {
    isSavingDraftRef.current = isSavingDraft;
  }, [isSavingDraft]);

  useEffect(() => {
    isEditingEnabledRef.current = isEditingEnabled;
    isLockedRef.current = isLocked;
  }, [isEditingEnabled, isLocked]);

  const effectiveStageFields = useMemo(() => {
    if (providedStageFields.length > 0) {
      return providedStageFields;
    }

    return buildFallbackStageFields(cycleId);
  }, [cycleId, providedStageFields]);

  const orderedStageFields = useMemo(
    () => [...effectiveStageFields].sort((a, b) => a.sort_order - b.sort_order),
    [effectiveStageFields],
  );

  const formStageFields = useMemo(
    () => orderedStageFields.filter((field) => field.is_active && field.field_type !== "file"),
    [orderedStageFields],
  );

  const fileStageFields = useMemo(
    () => orderedStageFields.filter((field) => field.is_active && field.field_type === "file"),
    [orderedStageFields],
  );

  const groupedFormSections = useMemo(
    () =>
      groupFieldsBySections(formStageFields, sections, {
        includeInactive: false,
        includeFileFields: false,
      }),
    [formStageFields, sections],
  );

  const documentFormSection = useMemo(
    () =>
      groupedFormSections.find(
        (section) => section.sectionKey === "documents",
      ) ?? null,
    [groupedFormSections],
  );

  const wizardSections = useMemo(() => {
    const wizardSteps: Array<{
      id: WizardSectionId;
      title: string;
      description: string;
      formSection: ResolvedSection | null;
      status: ProgressState;
    }> = [];

    const isDocumentsStage = !stageCode || stageCode === "documents";

    if (isDocumentsStage) {
      wizardSteps.push({
        id: PREP_SECTION_ID,
        title: staticSectionTitles.prep_intro,
        description: copy(
          "Checklist rápida de preparación para enviar sin fricción.",
          "Quick checklist to prepare and submit smoothly.",
        ),
        formSection: null,
        status: "complete",
      });
    }

    for (const section of groupedFormSections) {
      // "documents" and "recommenders" are rendered as special wizard steps below
      // The old "eligibility" block is hidden for the main documents stage.
      if (
        section.sectionKey === "documents" ||
        section.sectionKey === "recommenders" ||
        (isDocumentsStage && section.sectionKey === "eligibility")
      ) {
        continue;
      }

      wizardSteps.push({
        id: section.sectionKey as WizardSectionId,
        title: section.title,
        description:
          isEnglish && SECTION_DESCRIPTIONS_EN[section.sectionKey]
            ? SECTION_DESCRIPTIONS_EN[section.sectionKey]
            : section.description,
        formSection: section,
        status: getSectionFieldStatus({
          fields: section.fields,
          payload: application?.payload ?? {},
        }),
      });
    }

    if (documentFormSection || fileStageFields.length > 0) {
      const docFields = documentFormSection?.fields ?? [];
      const docMetadataStatus = getSectionFieldStatus({
        fields: docFields,
        payload: application?.payload ?? {},
      });
      wizardSteps.push({
        id: "documents_uploads",
        title: staticSectionTitles.documents_uploads,
        description: copy(
          "Sube los archivos solicitados para esta etapa. Formatos aceptados: PDF, PNG, JPG.",
          "Upload the files requested for this stage. Accepted formats: PDF, PNG, JPG.",
        ),
        formSection: documentFormSection,
        status: docMetadataStatus,
      });
    }

    if (isDocumentsStage) {
      wizardSteps.push({
        id: "recommenders_flow",
        title: staticSectionTitles.recommenders_flow,
        description: copy(
          "Registra un mentor y un amigo (no familiar). Les enviaremos una invitación por correo.",
          "Register a mentor and a friend (non-family). We will email them an invitation.",
        ),
        formSection:
          groupedFormSections.find(
            (section) => section.sectionKey === "recommenders",
          ) ?? null,
        status: "not_started",
      });
    }

    wizardSteps.push({
      id: "review_submit",
      title: staticSectionTitles.review_submit,
      description: copy(
        "Revisa que toda la información esté correcta antes de enviar tu postulación.",
        "Review that all information is correct before submitting your application.",
      ),
      formSection: null,
      status: "not_started",
    });

    return wizardSteps;
  }, [application?.payload, copy, documentFormSection, fileStageFields.length, groupedFormSections, isEnglish, stageCode, staticSectionTitles]);

  const documentsStatus = useMemo(() => {
    const requiredFileFields = fileStageFields.filter((field) => field.is_required);
    const files = (application?.files as Record<string, ApplicationFileValue> | undefined) ?? {};
    const completedCount = requiredFileFields.filter((field) => {
      const entry = parseFileEntry(files[field.field_key]);
      return isMeaningfulValue(entry?.path);
    }).length;
    const hasAnyFile = fileStageFields.some((field) => isMeaningfulValue(parseFileEntry(files[field.field_key])?.path));

    if (requiredFileFields.length === 0) {
      return getStepState({
        complete: false,
        inProgress: false,
      });
    }

    return getStepState({
      complete: completedCount === requiredFileFields.length,
      inProgress: hasAnyFile,
    });
  }, [application?.files, fileStageFields]);

  const activeRecommendersByRole = useMemo(() => {
    const map = new Map<RecommenderRole, RecommenderSummary>();
    for (const row of recommenders) {
      if (row.invalidatedAt) {
        continue;
      }
      if (!map.has(row.role)) {
        map.set(row.role, row);
      }
    }
    return map;
  }, [recommenders]);

  const recommenderStatus = useMemo(
    () =>
      getStepState({
        complete: activeRecommendersByRole.size === 2,
        inProgress: activeRecommendersByRole.size > 0,
      }),
    [activeRecommendersByRole],
  );

  const submissionStatus = useMemo(
    () =>
      getStepState({
        complete: isCurrentStageSubmissionComplete({ application, stageCode }),
        inProgress: false,
      }),
    [application, stageCode],
  );

  const progressWizardSections = useMemo(
    () => wizardSections.filter((section) => section.id !== PREP_SECTION_ID),
    [wizardSections],
  );

  const progressSteps = useMemo(
    () =>
      progressWizardSections.map((section) => {
        // Compute status
        let status: ProgressState;
        if (section.id === "documents_uploads") {
          status = documentsStatus;
        } else if (section.id === "recommenders_flow") {
          status = recommenderStatus;
        } else if (section.id === "review_submit") {
          status = submissionStatus;
        } else {
          status = section.status;
        }

        // Compute statusLabel (percentage or fraction)
        let statusLabel: string | undefined;
        if (status === "complete") {
          // No label for complete — the check icon is sufficient
          statusLabel = undefined;
        } else if (section.id === "recommenders_flow") {
          const registeredCount = activeRecommendersByRole.size;
          if (registeredCount > 0) {
            statusLabel = `${registeredCount}/2`;
          }
        } else if (section.id === "documents_uploads") {
          const requiredFileFields = fileStageFields.filter((f) => f.is_required);
          const files = (application?.files as Record<string, ApplicationFileValue> | undefined) ?? {};
          const uploadedCount = requiredFileFields.filter((f) => isMeaningfulValue(parseFileEntry(files[f.field_key])?.path)).length;
          if (requiredFileFields.length > 0 && (status === "in_progress" || uploadedCount > 0)) {
            const pct = Math.round((uploadedCount / requiredFileFields.length) * 100);
            statusLabel = `${pct}%`;
          }
        } else if (section.id !== "review_submit" && section.formSection && status === "in_progress") {
          const reqFields = section.formSection.fields.filter((f) => f.is_required);
          const payload = application?.payload ?? {};
          const filledCount = reqFields.filter((f) => isMeaningfulValue((payload as Record<string, unknown>)[f.field_key])).length;
          if (reqFields.length > 0) {
            const pct = Math.round((filledCount / reqFields.length) * 100);
            statusLabel = `${pct}%`;
          }
        }

        return { key: section.id, label: section.title, status, statusLabel };
      }),
    [
      activeRecommendersByRole,
      application?.files,
      application?.payload,
      documentsStatus,
      fileStageFields,
      progressWizardSections,
      recommenderStatus,
      submissionStatus,
    ],
  );

  const completedSteps = progressSteps.filter((step) => step.status === "complete").length;
  const progressPercent = progressSteps.length > 0
    ? Math.round((completedSteps / progressSteps.length) * 100)
    : 0;
  const draftStatusLabel = formatSaveStatusLabel(saveState, lastSavedAt, language);
  const requiredDocumentLabels = useMemo(
    () =>
      fileStageFields
        .filter((field) => field.is_required)
        .map((field) => getLocalizedDisplayFieldLabel({ sectionId: "documents", field, language })),
    [fileStageFields, language],
  );
  const currentSection = wizardSections.find((section) => section.id === activeSectionId) ?? wizardSections[0] ?? null;
  const currentFormSectionId = currentSection?.formSection
    ? currentSection.formSection.sectionKey
    : null;
  const currentSectionIndex = currentSection
    ? wizardSections.findIndex((section) => section.id === currentSection.id)
    : -1;
  const previousSectionId = currentSectionIndex > 0 ? wizardSections[currentSectionIndex - 1]?.id ?? null : null;
  const nextSectionId =
    currentSectionIndex >= 0 && currentSectionIndex < wizardSections.length - 1
      ? wizardSections[currentSectionIndex + 1]?.id ?? null
      : null;
  const currentProgressSectionIndex =
    currentSection && currentSection.id !== PREP_SECTION_ID
      ? progressWizardSections.findIndex((section) => section.id === currentSection.id)
      : -1;
  const showNumberedStepHeader = Boolean(currentSection && currentSection.id !== PREP_SECTION_ID);
  const modeStatusLabel = isStageClosed
    ? copy("Modo: solo lectura (etapa cerrada)", "Mode: read-only (stage closed)")
    : isLocked && isEditMode
      ? copy("Modo: edición manual habilitada", "Mode: manual editing enabled")
      : isLocked
        ? copy("Modo: solo lectura", "Mode: read-only")
        : undefined;
  const modeStatusDot: "success" | "warning" | "error" | "info" | undefined = isStageClosed
    ? "error"
    : isLocked && isEditMode
      ? "success"
      : isLocked
        ? "warning"
        : undefined;
  const editToggleLabel =
    isLocked && isEditMode
      ? hasPendingChanges
        ? copy("Descartar cambios y salir", "Discard changes & exit")
        : copy("Salir de edición", "Exit editing")
      : copy("Editar respuesta", "Edit response");

  useEffect(() => {
    if (wizardSections.length === 0) {
      return;
    }

    if (!wizardSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(
        getInitialActiveSectionId({
          cycleId,
          stageCode,
          stageFields,
          sections,
        }),
      );
    }
  }, [activeSectionId, cycleId, sections, stageCode, stageFields, wizardSections]);

  useEffect(() => {
    const applicationId = application?.id ?? null;
    const applicationChanged = previousHydratedApplicationIdRef.current !== applicationId;
    previousHydratedApplicationIdRef.current = applicationId;
    const shouldHydrate =
      applicationChanged || forceHydrateFormValuesRef.current || !hasPendingChangesRef.current;

    if (!shouldHydrate) {
      return;
    }

    forceHydrateFormValuesRef.current = false;

    const payload = application?.payload ?? {};
    const nextValues: Record<string, string> = {};

    for (const field of formStageFields) {
      nextValues[field.field_key] = getPayloadValue(payload, field.field_key);
    }

    formValuesRef.current = nextValues;
    setFormValues(nextValues);
    if (applicationChanged || !hasPendingChangesRef.current) {
      hasPendingChangesRef.current = false;
      setHasPendingChanges(false);
    }
  }, [application?.id, application?.payload, formStageFields]);

  useEffect(() => {
    const nextTitles: Record<string, string> = {};
    const files = (application?.files as Record<string, ApplicationFileValue> | undefined) ?? {};
    for (const field of fileStageFields) {
      const entry = parseFileEntry(files[field.field_key]);
      if (entry) {
        nextTitles[field.field_key] = entry.title;
      }
    }
    setFileTitleEdits(nextTitles);
  }, [application?.files, fileStageFields]);

  useEffect(() => {
    if (!application?.id) {
      setRecommenders([]);
      setRecommenderInputs({ mentor: "", friend: "" });
      skippedInitialRecommenderFetchRef.current = false;
      return;
    }

    const applicationId = application.id;
    if (
      !skippedInitialRecommenderFetchRef.current &&
      initialApplicationIdRef.current === applicationId
    ) {
      skippedInitialRecommenderFetchRef.current = true;
      return;
    }

    let isMounted = true;

    async function loadRecommenders() {
      setLoadingRecommenders(true);

      try {
        const body = await fetchApi<{ recommenders?: RecommenderSummary[] }>(
          `/api/recommendations?applicationId=${applicationId}`,
        );

        if (!isMounted) {
          return;
        }

        const rows = body.recommenders ?? [];
        setRecommenders(rows);
        const mentor = rows.find((row) => row.role === "mentor" && !row.invalidatedAt)?.email ?? "";
        const friend = rows.find((row) => row.role === "friend" && !row.invalidatedAt)?.email ?? "";
        setRecommenderInputs({ mentor, friend });
      } catch {
        if (isMounted) {
          setRecommenders([]);
        }
      } finally {
        if (isMounted) {
          setLoadingRecommenders(false);
        }
      }
    }

    void loadRecommenders();

    return () => {
      isMounted = false;
    };
  }, [application?.id]);

  useEffect(() => {
    if (!application?.id || hasPendingChanges || isSavingDraft) {
      return;
    }

    const refresh = () => {
      void refreshApplicationSnapshot({
        includeRecommenders: true,
      });
    };

    const interval = window.setInterval(refresh, 20_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [application?.id, hasPendingChanges, isSavingDraft, refreshApplicationSnapshot]);

  const saveDraft = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!isEditingEnabledRef.current) {
        return false;
      }

      if (isSavingDraftRef.current) {
        saveQueuedRef.current = true;
        return false;
      }

      if (!silent) {
        setError(null);
        setSuccessMessage(null);
      }

      const currentValues = formValuesRef.current;
      const requestedRevision = localEditRevisionRef.current;

      const validation = validateStagePayload({
        fields: formStageFields,
        payload: currentValues,
        skipFileValidation: true,
        enforceRequired: false,
      });

      if (!validation.isValid) {
        setFieldErrors(validation.errors);
        setSaveState("error");
        if (!silent) {
          const firstError = Object.values(validation.errors)[0] ?? copy("Hay campos inválidos.", "There are invalid fields.");
          setError({ message: firstError });
        }
        return false;
      }

      setFieldErrors({});
      isSavingDraftRef.current = true;
      setIsSavingDraft(true);
      setSaveState("saving");

      try {
        const body = await fetchApi<{ application: Application }>("/api/applications", {
          method: "POST",
          body: JSON.stringify({
            cycleId,
            payload: validation.normalizedPayload,
            allowPartial: true,
          }),
        });

        const completedAt = new Date().toISOString();
        const hasNewerLocalEdits = localEditRevisionRef.current !== requestedRevision;
        if (!hasNewerLocalEdits) {
          forceHydrateFormValuesRef.current = true;
        }
        setApplication(body.application);
        if (!isLockedRef.current) {
          setIsEditMode(false);
        }
        setLastSavedAt(completedAt);

        if (hasNewerLocalEdits) {
          hasPendingChangesRef.current = true;
          setHasPendingChanges(true);
          setSaveState("dirty");
          saveQueuedRef.current = true;
        } else {
          hasPendingChangesRef.current = false;
          setHasPendingChanges(false);
          setSaveState("saved");
        }
        return true;
      } catch (requestError) {
        setSaveState("error");
        if (!silent) {
          setError(
            toNormalizedApiError(
              requestError,
              copy(
                "No se pudo guardar el borrador.",
                "Could not save your draft.",
              ),
            ),
          );
        }
        return false;
      } finally {
        isSavingDraftRef.current = false;
        setIsSavingDraft(false);

        if (saveQueuedRef.current) {
          saveQueuedRef.current = false;
          if (isEditingEnabledRef.current && hasPendingChangesRef.current) {
            window.setTimeout(() => {
              void saveDraft({ silent: true });
            }, 0);
          }
        }
      }
    },
    [copy, cycleId, formStageFields],
  );

  useEffect(() => {
    if (!isEditingEnabled || !hasPendingChanges || isSavingDraft) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveDraft({ silent: true });
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [hasPendingChanges, isEditingEnabled, isSavingDraft, saveDraft]);

  function markFieldDirty() {
    localEditRevisionRef.current += 1;
    if (!hasPendingChangesRef.current) {
      hasPendingChangesRef.current = true;
      setHasPendingChanges(true);
    }
    if (saveState !== "saving") {
      setSaveState("dirty");
    }
  }

  function jumpToSection(sectionId: WizardSectionId) {
    if (sectionId === activeSectionId) {
      return;
    }

    if (isEditingEnabled && hasPendingChanges) {
      void saveDraft({ silent: true });
    }
    setActiveSectionId(sectionId);
  }

  function handleFieldChange(fieldKey: string, value: string) {
    setFormValues((current) => ({ ...current, [fieldKey]: value }));
    markFieldDirty();
  }

  async function submitApplication() {
    setError(null);
    setSuccessMessage(null);

    if (!application?.id) {
      setError({ message: copy("Primero guarda tu borrador antes de enviar.", "Save your draft before submitting.") });
      return;
    }

    if (isStageClosed) {
      setError({
        message: copy(
          "La etapa ya cerró y no puedes enviar o editar esta postulación. Contacta al comité.",
          "This stage is closed and you cannot submit or edit this application. Contact the committee.",
        ),
      });
      return;
    }

    try {
      const body = await fetchApi<{ application: Application }>(
        `/api/applications/${application.id}/submit`,
        {
          method: "POST",
        },
      );

      setApplication(body.application);
      void refreshApplicationSnapshot({
        includeRecommenders: true,
      });
      setSuccessMessage(copy("Postulación enviada. El comité revisará tu información.", "Application submitted. The committee will review your information."));
    } catch (requestError) {
      setError(
        toNormalizedApiError(
          requestError,
          copy(
            "No se pudo enviar la postulación.",
            "Could not submit your application.",
          ),
        ),
      );
    }
  }

  async function saveRecommender(role: RecommenderRole) {
    setError(null);
    setSuccessMessage(null);

    if (!application?.id) {
      setError({ message: copy("Guarda tu postulación antes de registrar recomendadores.", "Save your application before registering recommenders.") });
      return;
    }

    if (isLocked && !isEditMode) {
      setError({
        message: copy(
          "Tu postulación ya fue enviada. Haz clic en 'Editar respuesta' para habilitar cambios.",
          "Your application was already submitted. Click 'Edit response' to enable changes.",
        ),
      });
      return;
    }

    const email = recommenderInputs[role].trim();
    const normalizedAccountEmail = normalizeEmailAddress(accountEmail);

    if (!email) {
      setError({
        message: copy(
          "Ingresa el correo del recomendador antes de enviar la invitación.",
          "Enter the recommender email before sending the invitation.",
        ),
      });
      return;
    }

    if (normalizedAccountEmail && normalizeEmailAddress(email) === normalizedAccountEmail) {
      setError({
        message: copy(
          "No puedes registrarte como tu propio recomendador. Usa dos correos distintos al de tu cuenta.",
          "You cannot register yourself as your own recommender. Use two emails different from your account.",
        ),
      });
      return;
    }

    setSavingRecommenderRole(role);
    try {
      const body = await fetchApi<{
        recommenders?: RecommenderSummary[];
        createdCount?: number;
        replacedCount?: number;
        failedEmailCount?: number;
      }>("/api/recommendations", {
        method: "PUT",
        body: JSON.stringify({
          applicationId: application.id,
          recommenders: [{ role, email }],
        }),
      });

      const rows = (body.recommenders as RecommenderSummary[] | undefined) ?? [];
      setRecommenders(rows);
      void refreshApplicationSnapshot({
        includeRecommenders: true,
      });

      const createdCount = Number(body.createdCount ?? 0);
      const replacedCount = Number(body.replacedCount ?? 0);
      const failedEmailCount = Number(body.failedEmailCount ?? 0);
      const sentEmailCount = Math.max(createdCount - failedEmailCount, 0);
      const resolvedRoleLabel = roleLabel(role, language);

      const chunks = [];
      if (replacedCount > 0 && sentEmailCount > 0) {
        chunks.push(
          copy(
            `${resolvedRoleLabel} actualizado. Se envió una nueva invitación.`,
            `${resolvedRoleLabel} updated. A new invitation was sent.`,
          ),
        );
      } else if (sentEmailCount > 0) {
        chunks.push(
          copy(
            `Invitación enviada a ${email}.`,
            `Invitation sent to ${email}.`,
          ),
        );
      }
      if (createdCount > 0 && failedEmailCount >= createdCount) {
        chunks.push(
          copy(
            `${resolvedRoleLabel} registrado, pero el correo no salió. Usa "Enviar recordatorio" para reintentar.`,
            `${resolvedRoleLabel} saved, but the email did not go out. Use "Send reminder" to retry.`,
          ),
        );
      }
      if (replacedCount > 0 && failedEmailCount > 0) {
        chunks.push(
          copy(
            `${resolvedRoleLabel} actualizado, pero no se pudo enviar la nueva invitación.`,
            `${resolvedRoleLabel} updated, but the new invitation could not be sent.`,
          ),
        );
      }

      setSuccessMessage(chunks.length > 0 ? chunks.join(" ") : copy("Recomendador actualizado.", "Recommender updated."));
    } catch (requestError) {
      setError(
        toNormalizedApiError(
          requestError,
          copy(
            "No se pudo registrar el recomendador.",
            "Could not save the recommender.",
          ),
        ),
      );
    } finally {
      setSavingRecommenderRole(null);
    }
  }

  async function sendReminder(recommendationId: string) {
    setError(null);
    setSuccessMessage(null);
    setRemindingId(recommendationId);

    try {
      const body = await fetchApi<{ recommender: RecommenderSummary }>(
        `/api/recommendations/${recommendationId}/remind`,
        {
        method: "POST",
        },
      );

      const updated = body.recommender as RecommenderSummary;
      setRecommenders((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      void refreshApplicationSnapshot({
        includeRecommenders: true,
      });
      setSuccessMessage(copy("Recordatorio enviado al recomendador.", "Reminder sent to recommender."));
    } catch (requestError) {
      setError(
        toNormalizedApiError(
          requestError,
          copy(
            "No se pudo enviar el recordatorio.",
            "Could not send the reminder.",
          ),
        ),
      );
    } finally {
      setRemindingId(null);
    }
  }

  async function uploadDocument(fieldKey: string, event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccessMessage(null);

    const file = event.target.files?.[0];
    if (!file || !application?.id) {
      return;
    }

    if (isLocked && !isEditMode) {
      setError({
        message: copy(
          "Tu postulación ya fue enviada. Haz clic en 'Editar respuesta' para actualizar documentos.",
          "Your application was already submitted. Click 'Edit response' to update documents.",
        ),
      });
      return;
    }

    setUploadingFieldKey(fieldKey);
    const isReplacingExistingFile = Boolean(application.files?.[fieldKey]);

    try {
      const signedUrlBody = await fetchApi<{ signedUrl: string; path: string }>(
        `/api/applications/${application.id}/upload-url`,
        {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        }),
        },
      );

      const uploadResponse = await fetch(signedUrlBody.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        setError({ message: copy("No se pudo subir el archivo al almacenamiento.", "Could not upload the file to storage.") });
        return;
      }

      const associateBody = await fetchApi<{ application: Application }>(
        `/api/applications/${application.id}/files`,
        {
        method: "POST",
        body: JSON.stringify({
          key: fieldKey,
          path: signedUrlBody.path,
          title: fileTitleEdits[fieldKey]?.trim() || file.name,
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString(),
        }),
        },
      );

      setApplication(associateBody.application);
      void refreshApplicationSnapshot({
        includeRecommenders: false,
      });
      setFileTitleEdits((current) => ({
        ...current,
        [fieldKey]: current[fieldKey]?.trim() || file.name,
      }));
      setSuccessMessage(
        copy(
          isReplacingExistingFile
            ? "Documento actualizado correctamente."
            : "Documento subido correctamente.",
          isReplacingExistingFile
            ? "Document updated successfully."
            : "Document uploaded successfully.",
          ),
      );
    } catch (requestError) {
      setError(
        toNormalizedApiError(
          requestError,
          copy(
            "No se pudo completar la subida del archivo. Intenta nuevamente.",
            "Could not complete the file upload. Please try again.",
          ),
        ),
      );
    } finally {
      setUploadingFieldKey(null);
    }
  }

  const sidebarSteps: SidebarStep[] = useMemo(() => {
    const progressByKey = new Map(progressSteps.map((step) => [step.key, step]));
    return wizardSections.map((section) => {
      const progressStep = progressByKey.get(section.id);
      if (progressStep) {
        return progressStep;
      }
      return {
        key: section.id,
        label: section.title,
        status: "not_started" as const,
      };
    });
  }, [progressSteps, wizardSections]);
  const sidebarDraftDot: "success" | "warning" | "error" | "info" =
    saveState === "error" ? "error" : saveState === "saving" ? "info" : saveState === "dirty" ? "warning" : "success";
  const sidebarProgressLabel = isEnglish
    ? `${completedSteps} of ${progressSteps.length} complete`
    : `${completedSteps} de ${progressSteps.length} completado`;
  const currentStepLabel = currentSection?.title ?? "";

  return (
    <Box>
      {/* Fixed top navigation */}
      <ApplicantTopNav
        accountDisplayName={accountDisplayName}
        accountEmail={accountEmail}
        currentProcessHref={`/applicant/process/${cycleId}`}
        draftStatusLabel={draftStatusLabel}
        draftStatusDot={sidebarDraftDot}
        modeStatusLabel={modeStatusLabel}
        modeStatusDot={modeStatusDot}
      />

      <Box
        sx={{
          display: "flex",
          pt: "var(--topbar-height)",
          minHeight: "calc(100vh - var(--topbar-height))",
        }}
      >
      {/* Desktop Sidebar */}
      <ApplicantSidebar
        processLabel={cycleName ?? copy("Proceso 2026", "Process 2026")}
        title={stageLabel ?? copy("Tu postulación", "Your application")}
        deadline={
          stageCloseAt
            ? `${copy("Cierre", "Closes")}: ${new Date(stageCloseAt).toLocaleDateString(locale)}`
            : undefined
        }
        progressPercent={progressPercent}
        progressLabel={sidebarProgressLabel}
        steps={sidebarSteps}
        activeStepKey={activeSectionId}
        onStepClick={(key) => jumpToSection(key as WizardSectionId)}
        onHide={() => setIsSidebarHidden(true)}
        hideLabel={copy("Ocultar barra lateral", "Hide sidebar")}
        hiddenDesktop={isSidebarHidden}
      />

      {isSidebarHidden ? (
        <Box
          sx={{
            display: "none",
            "@media (min-width: 769px)": {
              display: "block",
              position: "fixed",
              top: "calc(var(--topbar-height) + 14px)",
              left: 10,
              zIndex: 55,
            },
          }}
        >
          <IconButton
            onClick={() => setIsSidebarHidden(false)}
            aria-label={copy("Mostrar barra lateral", "Show sidebar")}
            size="small"
            sx={{
              width: 34,
              height: 34,
              border: "1px solid var(--sand)",
              borderRadius: "10px",
              color: "var(--muted)",
              bgcolor: "var(--surface)",
              boxShadow: "var(--shadow-sm)",
              "&:hover": {
                bgcolor: "var(--cream)",
                borderColor: "var(--muted)",
                color: "var(--ink)",
              },
            }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      ) : null}

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flex: 1,
          ml: 0,
          pb: "120px",
          transition: "margin-left 220ms ease",
          "@media (max-width: 768px)": {
            pb: "140px",
          },
          "@media (min-width: 769px)": {
            ml: isSidebarHidden ? 0 : "var(--sidebar-width, 280px)",
          },
        }}
      >
        <Box sx={{ maxWidth: 760, mx: "auto", px: { xs: 2, sm: 4 }, pt: { xs: 3, sm: 5 } }}>
          {/* Mobile progress panel */}
          <ApplicantMobileProgress
            currentStepLabel={currentStepLabel}
            progressPercent={progressPercent}
            draftStatusLabel={draftStatusLabel}
            draftStatusDot={sidebarDraftDot}
            steps={sidebarSteps}
            activeStepKey={activeSectionId}
            onStepClick={(key) => jumpToSection(key as WizardSectionId)}
          />

          {/* Locked status banner */}
          {isLocked && !isEditMode ? (
            <Box sx={{ mb: 3, p: 2, bgcolor: "var(--cream)", border: "1px solid var(--sand)", borderRadius: "var(--radius)" }}>
              <Typography color="text.secondary">
                {copy(
                  "Tu postulación ya fue enviada. Para cambiar datos, usa “Editar respuesta” en la barra inferior.",
                  "Your application was already submitted. Use “Edit response” in the bottom bar to make changes.",
                )}
              </Typography>
              {isStageClosed ? (
                <Typography variant="body2" color="error.main">
                  {copy(
                    "La etapa está cerrada. Solo el comité puede reabrir cambios.",
                    "The stage is closed. Only the committee can reopen changes.",
                  )}
                </Typography>
              ) : null}
            </Box>
          ) : null}

          {isStageClosed ? (
            <Typography variant="body2" color="error.main" sx={{ mb: 2 }}>
              {copy(
                "Etapa cerrada: no se permiten nuevas ediciones del postulante.",
                "Stage closed: no further applicant edits are allowed.",
              )}
            </Typography>
          ) : null}

          {error ? <Box sx={{ mb: 3 }}><ErrorCallout message={error.message} errorId={error.errorId} context="applicant_form" /></Box> : null}

          {successMessage ? (
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#DCFCE7", mb: 3 }}>
              <Typography color="#166534">{successMessage}</Typography>
            </Box>
          ) : null}

          {/* Animated section wrapper — re-mounts on section change */}
          <Box
            key={activeSectionId}
            sx={{
              animation: "fadeUp 0.35s ease both",
            }}
          >
          {/* Section eyebrow header */}
          {currentSection ? (
            <Box sx={{ mb: 4 }}>
              {showNumberedStepHeader ? (
                <Typography
                  sx={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--uwc-maroon)",
                    mb: 0.75,
                  }}
                >
                  {isEnglish
                    ? `Step ${currentProgressSectionIndex + 1} of ${progressWizardSections.length}`
                    : `Paso ${currentProgressSectionIndex + 1} de ${progressWizardSections.length}`}
                </Typography>
              ) : null}
              <Typography
                sx={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: { xs: "1.45rem", sm: "1.8rem" },
                  fontWeight: 400,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.25,
                  color: "var(--ink)",
                  mb: 1,
                }}
              >
                {currentSection.title}
              </Typography>
              <Typography sx={{ fontSize: "0.85rem", color: "var(--muted)", maxWidth: 520 }}>
                {currentSection.description}
              </Typography>
            </Box>
          ) : null}

          {/* Form section content */}
          {currentSection?.id === PREP_SECTION_ID ? (
            <ApplicantPreparationChecklist
              stageInstructions={stageInstructions}
              requiredDocumentLabels={requiredDocumentLabels}
              copy={copy}
            />
          ) : null}

          {currentSection && currentSection.formSection && currentSection.id !== "documents_uploads" && currentSection.id !== "recommenders_flow" && currentSection.id !== "review_submit" ? (
            <Box>
              {currentFormSectionId
                ? <ApplicantFormFields
                    fields={currentSection.formSection.fields}
                    sectionId={currentFormSectionId}
                    formValues={formValues}
                    fieldErrors={fieldErrors}
                    isEditingEnabled={isEditingEnabled}
                    language={language}
                    onFieldChange={handleFieldChange}
                  />
                : null}
            </Box>
          ) : null}

          {currentSection?.id === "documents_uploads" ? (
            <ApplicantDocumentUploadSection
              metadataContent={
                currentSection.formSection?.fields.length
                  ? <ApplicantFormFields
                      fields={currentSection.formSection.fields}
                      sectionId="documents"
                      formValues={formValues}
                      fieldErrors={fieldErrors}
                      isEditingEnabled={isEditingEnabled}
                      language={language}
                      onFieldChange={handleFieldChange}
                    />
                  : undefined
              }
              fileStageFields={fileStageFields}
              applicationFiles={application?.files as Record<string, string | { path: string; title?: string; original_name?: string; mime_type?: string; size_bytes?: number; uploaded_at?: string }> | undefined}
              applicationId={application?.id ?? null}
              uploadingFieldKey={uploadingFieldKey}
              isEditingEnabled={isEditingEnabled}
              language={language}
              onUpload={(fieldKey, event) => uploadDocument(fieldKey, event)}
              getFieldLabel={getLocalizedDisplayFieldLabel}
              getFieldHelpText={getLocalizedFieldHelpText}
              copy={copy}
            />
          ) : null}

          {currentSection?.id === "recommenders_flow" ? (
            <ApplicantRecommendersSection
              metadataContent={
                currentSection.formSection?.fields.length
                  ? <ApplicantFormFields
                      fields={currentSection.formSection.fields}
                      sectionId="recommenders"
                      formValues={formValues}
                      fieldErrors={fieldErrors}
                      isEditingEnabled={isEditingEnabled}
                      language={language}
                      onFieldChange={handleFieldChange}
                    />
                  : undefined
              }
              activeRecommendersByRole={activeRecommendersByRole}
              recommenderInputs={recommenderInputs}
              onRecommenderInputChange={(role, value) =>
                setRecommenderInputs((prev) => ({ ...prev, [role]: value }))
              }
              onSaveRecommender={saveRecommender}
              onSendReminder={sendReminder}
              savingRecommenderRole={savingRecommenderRole}
              remindingId={remindingId}
              loadingRecommenders={loadingRecommenders}
              recommenders={recommenders}
              applicationId={application?.id}
              isEditingEnabled={isEditingEnabled}
              language={language}
              locale={locale}
              copy={copy}
            />
          ) : null}

          {currentSection?.id === "review_submit" ? (
            <ApplicantReviewSubmit
              progressSteps={progressSteps}
              sidebarProgressLabel={sidebarProgressLabel}
              copy={copy}
            />
          ) : null}
          </Box>{/* end animated section wrapper */}
        </Box>
      </Box>

      {/* Fixed bottom action bar */}
      <ApplicantActionBar
        onPrevious={() => { if (previousSectionId) jumpToSection(previousSectionId); }}
        onSaveDraft={() => void saveDraft({ silent: false })}
        onToggleEdit={() => {
          setError(null);
          setSuccessMessage(null);
          if (isEditMode) {
            if (hasPendingChanges) {
              let confirmed = true;
              if (typeof window !== "undefined") {
                try {
                  confirmed = window.confirm(
                    copy(
                      "Se descartarán los cambios no guardados y saldrás del modo edición. ¿Continuar?",
                      "Unsaved changes will be discarded and editing mode will be closed. Continue?",
                    ),
                  );
                } catch {
                  confirmed = true;
                }
              }
              if (!confirmed) {
                return;
              }
            }
            setIsEditMode(false);
            setFieldErrors({});
            setFormValues(() => {
              const payload = application?.payload ?? {};
              const nextValues: Record<string, string> = {};
              for (const field of formStageFields) {
                nextValues[field.field_key] = getPayloadValue(payload, field.field_key);
              }
              formValuesRef.current = nextValues;
              return nextValues;
            });
            hasPendingChangesRef.current = false;
            setHasPendingChanges(false);
            setSaveState(lastSavedAt ? "saved" : "idle");
            return;
          }
          setIsEditMode(true);
        }}
        onNext={() => {
          if (nextSectionId) {
            jumpToSection(nextSectionId);
          } else if (activeSectionId === "review_submit") {
            submitApplication();
          }
        }}
        previousLabel={copy("\u2190 Anterior", "\u2190 Previous")}
        editLabel={editToggleLabel}
        saveDraftLabel={isSavingDraft ? copy("Guardando...", "Saving...") : copy("Guardar borrador", "Save draft")}
        nextLabel={
          activeSectionId === "review_submit"
            ? copy("Enviar postulación", "Submit application")
            : nextSectionId
              ? `${copy("Siguiente", "Next")} \u2192`
              : copy("Finalizado", "Finished")
        }
        hasPrevious={Boolean(previousSectionId)}
        hasNext={
          Boolean(nextSectionId) ||
          (
            activeSectionId === "review_submit" &&
            Boolean(application?.id) &&
            !(isLocked && !isEditMode) &&
            !isStageClosed
          )
        }
        isSaving={isSavingDraft}
        isEditingEnabled={isEditingEnabled}
        hasPendingChanges={hasPendingChanges}
        showEditToggle={isLocked && !isStageClosed}
        isEditToggleDisabled={isStageClosed || isSavingDraft}
        sidebarVisibleDesktop={!isSidebarHidden}
      />
      </Box>{/* end layout flex container */}
    </Box>
  );
}
