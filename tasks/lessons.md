# Lessons

## Package Manager

**Rule: Always use `bun` for this project. Never use `npm` or `npx`.**

- This project uses bun (lockfile: `bun.lock`). Using `npm install` creates a `package-lock.json`, uses a different resolution strategy (`--legacy-peer-deps`), and can silently drop packages that bun had installed transitively — breaking the test suite.
- Correct commands:
  - Install a package: `bun add <package>` / `bun add -d <package>` (dev)
  - Install all deps: `bun install`
  - Run scripts: `bun run <script>` or `bunx <bin>`
  - Run vitest: `bunx vitest run`
- If you are unsure what package manager a project uses, check for `bun.lock`, `yarn.lock`, `pnpm-lock.yaml`, or `package-lock.json` before running any install command.
