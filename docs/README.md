# Docs Index

This folder contains the shared product and engineering source of truth for the UWC Peru platform.

## Core Documents
- `docs/BRAINSTORMING.md`: Raw product brainstorming and context.
- `docs/TODOS_FOR_ADMIN_VIEW.md`: Follow-up list for admin-view parity and rendering boundaries.
- `docs/V1_IMPROVEMENTS_PART2.md`: V1 workstream plan with priorities and acceptance criteria.
- `docs/POTENTIAL_REFACTOR.md`: Deep refactor audit and prioritized technical debt list.
- `docs/STAGE1_PDF_FIELD_INVENTORY.md`: Inventario completo de campos de Stage 1 extraídos del PDF oficial.
- `docs/PRODUCT_SPEC.md`: Functional requirements and non-functional requirements.
- `docs/ARCHITECTURE.md`: Technical architecture, system boundaries, and major design decisions.
- `docs/PLANNING.md`: Iterative rollout plan and release milestones.
- `docs/SETUP_PROCESSES.md`: Environment setup for Supabase, Cloudflare, OAuth, CI secrets.
- `docs/OBSERVABILITY.md`: Runtime logging strategy (Cloudflare), audit boundaries, and debug commands.

## Quality and Execution
- `docs/MANUAL_TEST_FLOWS.md`: Manual end-to-end test flows for smoke/UAT.
- `docs/TEST_STRATEGY.md`: Automated testing strategy and coverage expectations.
- `docs/WORKING_INSTRUCTIONS.md`: Working agreements for implementation, docs updates, and testing discipline.

## Maintenance Rule
Whenever requirements, architecture, auth flow, or workflows change, update the corresponding file(s) in `docs/` in the same PR.

## Repo Defaults
- Supabase operations for this project must use the UWC profile (`sbu`).
- UWC project ref for this repository: `lnuugnvwjyndvxhzbuib`.
