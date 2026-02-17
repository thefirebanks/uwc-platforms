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
- Keep service-role key usage out of runtime request paths.

## Supabase CLI Usage
- For this repository, always use UWC Supabase profile commands (`sbu`).
- Do not run plain `supabase ...` commands in this repo unless you intentionally override profile.
- Required baseline commands:
  - `sbu link --project-ref lnuugnvwjyndvxhzbuib`
  - `sbu migration list`
  - `sbu db push`
