# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

npm workspaces monorepo (`apps/backend`, `apps/frontend`, `apps/shared`) plus a Python tool in `tools/scrapling`. Setup steps (env file, Prisma migrate, `npm run setup:scrapling`) are in README.md.

- `npm run dev`: backend (:3001, `tsx watch`) and frontend (:5173, Vite) together. The frontend proxies `/searches` and `/catalog` to the backend, so `PORT=3001` must be set in `apps/backend/.env`.
- `npm test`: runs vitest in backend and frontend. Single file: `npm --workspace @cars-webscrapper/backend exec vitest run tests/filters.test.ts`. Single test: add `-t "name"`.
- Python tests: `cd tools/scrapling && uv run pytest` (single: `uv run pytest tests/test_kavak.py -k name`).
- `npm run build`: `tsc` for the backend, `vite build` for the frontend.
- Prisma: `cd apps/backend && npx prisma migrate dev && npx prisma generate`.
- `npm run lint` is wired up but no ESLint config or dependency exists in the repo, so it will not run as is.

## Architecture

A search is a structured filter form (price in USD, km, year, transmission, brand, model, colors), not natural language. **A search makes no LLM calls** (cost and tokens are 0).

Flow: `POST /searches` (SSE stream) -> `searchController` -> `searchService` -> `services/search/searchSites.ts` -> `pipeline.ts` -> `extractorClient.ts` -> `python tools/scrapling/cars_cli.py` (child process, prints one JSON object on stdout) -> site adapter in `tools/scrapling/cars_extractors/`.

- `searchSites` runs the pipeline on every site that has an adapter, at most `MAX_PARALLEL_SITES` (3) at a time, sequentially within a site. A failing site is reported as a `site_status` SSE event and does not stop the others. Cars saved before a failure stay saved.
- Layering in the backend: routers -> controllers -> services -> repositories (Prisma, SQLite at `apps/backend/data/dev.db`). Each search is stored as a snapshot with its filters, per-site status and cars.
- The TS side validates the Python JSON with zod schemas in `extractorClient.ts`. Changing the adapter output means changing both sides.
- Adding a site: write an adapter module in `tools/scrapling/cars_extractors/` and register it by hostname in `registry.py`. Sites without an adapter are reported as unsupported. Only Kavak exists today; `tickets/todo/` holds planned work (e.g. a CarOne adapter).
- Pages are fetched through Scrapling, installed into `tools/scrapling/.venv` and `.browsers` (gitignored, about 1 GB) by `npm run setup:scrapling`. Paths to the venv/binaries are centralized in `apps/backend/src/lib/scrapling.ts`.
- `apps/shared` holds code shared by both sides: `types.ts` (SearchFilters, SseEvent, SiteStatus, shared between backend and frontend) and `catalog.json` (brands and models), which the backend, frontend form and Python adapters all read. Add a brand or model only after checking it on each site.
- Frontend (React 19, Vite, Tailwind 4, shadcn/ui in `components/ui`): `useSearchStream` consumes the SSE stream; pages are Search, History and HistoryDetail. `lib/searchForm.ts` converts form state to filters.
- `services/agent/` (Claude Agent SDK) is the original natural-language design and is no longer called by the search path. `PLANNING.md` and `PRODUCT.md` still describe that older agent design, so trust the code and README over them.

## Tooling notes

Product management (tasks, projects, labels) lives in Kaneo, reachable through the `mcp__kaneo__*` tools. Use it, not Linear or GitHub issues, to look up or update tickets. The `tickets/` folder in the repo holds local ticket notes.

`.claude/` and `.cursor/` contain the Impeccable design skill and its hooks (UI design work only).
