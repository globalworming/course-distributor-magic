# Repository Guidelines

## Project Structure & Module Organization
This app is a TanStack Start + React + TypeScript project. Keep application code in `src/`:

- `src/routes/` contains file-based routes; `index.tsx` is the main screen.
- `src/components/` contains reusable UI, with low-level primitives in `src/components/ui/`.
- `src/lib/` holds domain logic such as CSV parsing, scheduling, and local state persistence.
- `src/hooks/` contains shared React hooks.
- `tests/` contains Playwright end-to-end specs, with CSV fixtures in `tests/fixtures/`.

Generated output lives in `dist/`. Do not hand-edit `src/routeTree.gen.ts`; TanStack Router regenerates it.

## Build, Test, and Development Commands
- `npm run dev` starts the local dev server with Vite.
- `npm run build` creates the production build and is the best project-wide correctness check.
- `npm run preview` serves the production bundle locally.
- `npm run lint` runs ESLint across the repo.
- `npm run format` applies Prettier formatting.
- `npm run test:e2e` runs the Playwright suite in `tests/` against a local server on `127.0.0.1:8080`.

## Coding Style & Naming Conventions
Use TypeScript with strict typing and existing `@/*` path aliases. Follow the current style:

- 2-space indentation, semicolons, double quotes, trailing commas.
- React components and route components use `PascalCase`.
- Hooks use `camelCase` and start with `use`.
- Utility modules in `src/lib/` use descriptive lowercase filenames such as `distribution.ts`.

ESLint (`eslint.config.js`) and Prettier (`.prettierrc`) are the source of truth. Run `npm run lint` and `npm run format` before opening a PR.

## Testing Guidelines
This repository currently uses Playwright for end-to-end coverage. Add new specs under `tests/` with `*.spec.ts` names, and keep fixtures beside them in `tests/fixtures/` when imports or downloads are involved. Prefer user-visible assertions and cover CSV import/export flows when changing table or distribution behavior.

## Commit & Pull Request Guidelines
Recent commits use short, imperative subjects such as `Update site info for publish` and `Added course distribution tool`. Keep commit titles brief, present tense, and focused on one behavior change.

PRs should include:

- a concise description of the user-visible change,
- linked issue or task reference when available,
- verification steps (`npm run build`, `npm run test:e2e`, etc.),
- screenshots or recordings for UI changes.
