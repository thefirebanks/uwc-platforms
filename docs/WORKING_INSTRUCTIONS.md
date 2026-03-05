# Working Instructions

## Documentation Discipline
- Keep product and architecture truth in `docs/`.
- Any behavior change must update relevant docs in the same PR.
- Prefer concise, decision-oriented docs over long narratives.

## Branch and PR Discipline
- Branch from `main` using `codex/` prefix.
- Open PRs for all feature work.
- Include verification outputs in PR description.

## Testing Discipline
- Add tests for all new behaviors.
- Prefer deterministic tests and stable selectors.
- Keep unit + integration coverage close to domain logic.
- Keep component tests for user-facing edge states and error states.

## Quality Gates
Before merge:
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`

## Security and Runtime
- OAuth is Google-only in production path.
- Dev bypass auth must remain opt-in and disabled in production.
- Keep Supabase secret-key usage out of client code and runtime request paths.
- Keep Cloudflare as the primary runtime log destination; keep Supabase logging limited to business audit events.

## Supabase CLI Usage
- For this repository, always use UWC Supabase profile commands (`sbu`).
- Do not run plain `supabase ...` commands in this repo unless you intentionally override profile.
- Required baseline commands:
  - `sbu link --project-ref lnuugnvwjyndvxhzbuib`
  - `sbu migration list`
  - `sbu db push`

## Execution Defaults
- Use `bun` for install, run, lint, test, typecheck, and build commands in this repository.
- Prefer `sbu` (Supabase CLI wrapper) and `gh` (GitHub CLI) when database or GitHub operations are needed.
- For feature work, always perform browser-level verification (manual flow or E2E) to visually confirm behavior.
- Assume local execution authority for running and testing the project end-to-end.
- Keep progress in small, logical git commits instead of one large commit.
