# Applicant Edit/View Mode Flows

This document defines the applicant-facing edit/non-edit behavior used to keep UI signals consistent.

## Goal

Make it obvious when the applicant is in:

1. normal editing mode
2. submitted read-only mode
3. submitted manual-edit mode
4. stage-closed read-only mode

The UI should never show a success message that contradicts the current button states.

## Core rules (implemented)

1. Draft/save status belongs in the top bar (`Borrador guardado`, `Cambios pendientes`, etc.).
2. Edit/read-only mode status also belongs in the top bar for submitted/locked applications.
3. The bottom action bar is the only place where applicants toggle manual editing (`Editar respuesta` / `Salir de edición` / `Descartar cambios y salir`).
4. Enabling manual edit mode must persist across saves until the applicant explicitly cancels or resubmits.
5. In read-only mode, `Guardar borrador` is disabled. In manual edit mode, it is enabled.

## User flows

### Flow A: Draft (not submitted)

- State: application is not locked.
- Top bar:
  - draft status only (no extra mode badge needed)
- Bottom bar:
  - `Guardar borrador` enabled
  - no `Editar respuesta` button
- Form fields:
  - editable

### Flow B: Submitted, read-only

- State: application is locked and manual edit mode is off.
- Top bar:
  - draft status
  - `Modo: solo lectura`
- In-page banner:
  - informational text explaining to use `Editar respuesta` in the bottom bar
- Bottom bar:
  - `Editar respuesta` visible
  - `Guardar borrador` disabled
- Form fields:
  - read-only

### Flow C: Submitted, manual edit enabled

- State: application is locked and manual edit mode is on.
- Top bar:
  - draft status
  - `Modo: edición manual habilitada`
- Bottom bar:
  - `Salir de edición` visible when there are no pending local changes
  - `Descartar cambios y salir` visible when there are unsaved local changes
  - `Guardar borrador` enabled
- Form fields:
  - editable
- Important:
  - saving does NOT auto-exit manual edit mode
  - exiting edit mode with unsaved changes requires confirmation and discards local changes back to the last saved draft

### Flow D: Stage closed

- State: stage close date passed.
- Top bar:
  - draft status
  - `Modo: solo lectura (etapa cerrada)`
- Bottom bar:
  - `Editar respuesta` hidden or disabled
  - `Guardar borrador` disabled
- Form fields:
  - read-only
- In-page message:
  - explicit stage-closed warning

## Checklist section behavior

- `Antes de empezar` is a dedicated intro step (`prep_intro`) instead of a repeated accordion on every section.
- It appears before `Elegibilidad` in the step sequence.
- It is excluded from progress counts so the numbered form flow remains aligned with the mockup (e.g. `Paso 1 de 8` for `Elegibilidad`).
