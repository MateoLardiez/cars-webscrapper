# Cars Web Scraper, Planning Document

A natural language car search app. The user types a query like "Search cars on https://www.kavak.com/ar below $10,000 USD, less than 100,000 km, manual, not yellow or green", and a Claude agent navigates the given site, extracts matching listings, and saves them to a local database. The frontend streams progress live and lets the user browse past searches.

The primary goal of this project is to learn the Claude Agent SDK and improve full-stack agentic-app skills.

---

## Decisions Log

| # | Question | Decision |
|---|---|---|
| 1 | Input format | Natural language. The agent parses intent. |
| 2 | Site coverage | Any URL. The agent navigates whatever site the user provides. Quality is best-effort and varies per site. |
| 3 | Backend language | TypeScript on Node. |
| 4 | Storage | SQLite, snapshot-per-search model (every run is preserved with its filters and results). |
| 5 | Filtering strategy | The agent decides at runtime, not predefined. |
| 6 | Frontend scope | Minimal plus history (search page, results, history view). |
| 7 | Progress UX | Server-Sent Events streaming live updates. |
| 8 | Run limits | Soft cap in prompt (about 5 pages of listings), hard timeout in backend (5 minutes). |

---

## Section 1: Architecture Overview

```
[ React frontend ]  <-- SSE stream + REST -->  [ Node backend ]  <-- Agent SDK -->  [ Claude Agent ]
                                                       |                                   |
                                                       v                                   v
                                                 [ SQLite DB ]                  [ Playwright + tools ]
```

**Frontend (React + Vite + TypeScript).** Two routes:
- Search page: textarea for the natural language query, "Run search" button, live progress feed, results table.
- History page: list of past searches, click to open one and see its results.

Uses `EventSource` to receive live agent updates over SSE.

**Backend (Node + TypeScript, Express).** Three endpoints:
- `POST /searches` (SSE): receives the NL query, spawns the agent, streams events back.
- `GET /searches`: list past searches.
- `GET /searches/:id`: get one search with its cars.

Owns the SQLite database and orchestrates the Agent SDK invocation. Enforces the 5-minute hard timeout on agent runs.

**The agent.** Spawned per search request via the Claude Agent SDK. Receives the user's NL query (which includes the source URL) plus a system prompt describing its job. Has a small toolbelt (browser navigation, DOM extraction, save-to-DB, possibly currency conversion). Responsibilities: parse intent, navigate the site, identify listings, normalize units, apply filters, persist matches, and report failure cleanly when extraction is not possible.

**Why this shape.** The frontend has no scraping logic and no LLM calls. The backend is a thin orchestration layer (DB, agent lifecycle, SSE plumbing). The agent holds all the intelligence. Each piece is independently testable and replaceable.

### Realistic expectations on "any URL"

"Any URL" is a target, not a guarantee. The agent will perform well on sites that look like typical car marketplaces (grid of cards, visible prices and specs) and poorly on:
- Sites behind login walls or aggressive anti-bot.
- Sites that require complex interactions (location prompts, mandatory modals).
- Sites with non-standard fields or units.

The agent must be allowed to give up gracefully and emit a clear failure event rather than fabricate results.

### Cross-cutting concerns

- **Currency and unit normalization.** Listings may be in ARS, USD, EUR, etc., and distance in km or miles. The agent records the original values and a normalized USD price plus km distance.
- **Run limits.** Soft cap of about 5 pages of listings in the agent prompt, plus a 5-minute hard timeout enforced by the backend. Prevents runaway token spend on hostile or confusing sites.
- **Failure as a first-class outcome.** SSE emits explicit "extraction_failed" events. The frontend renders them as a real result state, not as a generic error.

---

## Section 2: Agent design

### 2.1 System prompt

The system prompt is fixed across runs. The user's natural-language query goes in as the first user message.

```
You are a car-listing extraction agent. Given a URL of a car marketplace
and a set of natural-language filter criteria, your job is to:

1. Navigate the URL using the browser tools.
2. Identify the car listings on the page (cards, rows, etc.).
3. For each listing, extract: name, model, year, kilometers, price (with
   currency), transmission, color, general characteristics, and the link
   to the listing.
4. Apply the user's filters. Exclude listings that do not match.
5. Normalize values: distance in km, price in original currency AND in USD.
   If you do not know an exchange rate, use the convert_currency tool.
6. For each matching listing, call save_car exactly once.
7. Visit at most ~5 pages of listings. Stop earlier if you have enough
   data or if the site has no more results.
8. If you cannot extract listings (login wall, bot protection, broken
   page, unknown layout), call report_failure with a clear reason and stop.

Rules:
- Never fabricate data. If a field is not visible, leave it null.
- Do not save the same listing twice (dedupe by link).
- Be honest about uncertainty. Better to skip a listing than guess.
```

The rules section is intentionally heavy on "what not to do". Hallucination is the biggest risk with agent extractors, and explicit anti-fabrication instructions reduce it in practice.

### 2.2 Toolset

**Browser tools, via the Playwright MCP server.** The Claude Agent SDK mounts MCP servers as tools. Playwright already publishes one. We do not write any browser code ourselves, we configure the SDK to load the Playwright MCP and the agent gets `browser_navigate`, `browser_snapshot`, `browser_click`, etc. for free.

**Custom tools, defined by us:**

| Tool | Inputs | Purpose |
|---|---|---|
| `save_car` | name, model, year, km, price_original, currency_original, price_usd, transmission, color, characteristics, link | Insert one car into the current search's results in SQLite. |
| `convert_currency` | amount, from_currency, to_currency | Returns a converted amount. Backend uses a free FX API (e.g. exchangerate.host) with a small in-memory cache. |
| `report_failure` | reason | Marks the search as failed with a human-readable reason and ends the run. |

We deliberately do not give the agent raw SQL. `save_car` enforces the schema, validates types, and makes intent obvious to the model.

### 2.3 Conversation loop

Single-shot task. The Agent SDK runs a loop where the model emits text or tool calls, we execute tool calls, feed results back, repeat until the model stops. No human-in-the-loop.

```ts
const result = await query({
  prompt: userQuery,
  options: {
    systemPrompt: SYSTEM_PROMPT,
    mcpServers: { playwright: playwrightMcpConfig },
    tools: [saveCar, convertCurrency, reportFailure],
    maxTurns: 50,        // safety cap on tool-call cycles
    abortSignal: timeoutSignal(5 * 60_000),
  },
});

for await (const event of result) {
  bridgeToSse(event);
}
```

`maxTurns` and `abortSignal` are the safety nets that complement the soft caps in the prompt.

### 2.4 SSE bridge

The SDK yields a stream of events. The backend translates each one into an SSE event the frontend can render.

| SDK event | SSE event emitted | UI behavior |
|---|---|---|
| `assistant_text` | `agent_thinking` | Append to a live thoughts log. |
| `tool_use` (start) | `tool_call` (name + input summary) | Show "Navigating to ...", "Saving Ford Focus", etc. |
| `tool_result` | (internal, surfaced only on error) | Used internally. |
| `save_car` called | `car_saved` (the car row) | Append row to results table live. |
| `report_failure` called | `extraction_failed` (reason) | Show a failure card. |
| stream end | `done` (summary: count, duration) | Stop the spinner. |

Emitting `car_saved` immediately when the tool runs (not at run end) is what makes the results table fill in live.

## Section 3: Database schema

SQLite, two tables, snapshot-per-search model. The schema below is the conceptual model. The actual definitions live in `apps/backend/prisma/schema.prisma` as Prisma models, and types are derived from the generated client.

### `searches`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | Auto-increment. |
| `created_at` | TEXT | ISO 8601 timestamp. |
| `query` | TEXT | Raw NL query the user typed. |
| `source_url` | TEXT | URL the agent was pointed at. Extracted by regex from `query` before agent run, with a fallback where the agent reports it back if regex finds none. |
| `status` | TEXT | `running`, `done`, `failed`, or `timeout`. |
| `failure_reason` | TEXT NULL | Set when `status = failed`, from `report_failure`. |
| `duration_ms` | INTEGER NULL | Filled when run ends. |
| `cars_found` | INTEGER NOT NULL DEFAULT 0 | Cached count of saved cars (avoids JOINs in history list). |

### `cars`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | Auto-increment. |
| `search_id` | INTEGER | FK to `searches(id)`, ON DELETE CASCADE. |
| `name` | TEXT | e.g. "Ford Focus". |
| `model` | TEXT NULL | e.g. "SE Hatchback". |
| `year` | INTEGER NULL | |
| `km` | INTEGER NULL | Always normalized to km. |
| `price_original` | REAL NULL | Listed price as-is. |
| `currency_original` | TEXT NULL | ISO code (USD, ARS, etc.). |
| `price_usd` | REAL NULL | Normalized for cross-listing comparison. |
| `transmission` | TEXT NULL | "manual", "automatic", or null. |
| `color` | TEXT NULL | |
| `characteristics` | TEXT NULL | Free-form JSON blob for everything else (engine, fuel, doors). Keeps schema stable as the agent finds new fields. |
| `link` | TEXT NOT NULL | The listing URL. |
| `saved_at` | TEXT | ISO 8601 timestamp. |

**Indexes and constraints:**
- Index on `cars(search_id)` for per-search lookup.
- `UNIQUE(search_id, link)` to enforce dedupe at the DB level (defense in depth, the agent should already dedupe).

### Design notes

- **Most car columns are nullable.** The agent is explicitly told to leave fields null rather than guess. The schema must allow that or the agent will be tempted to fabricate.
- **`characteristics` is a JSON blob, not a separate table.** YAGNI for v1. We rarely query inside it. Promote to columns or a side table later if filtering needs grow.
- **No global deduped `cars` table.** Deferred (was option C in Q4). Snapshot-per-search keeps it simple. A migration to global dedupe is straightforward if needed later.
- **`query` and `source_url` are stored separately.** `query` is the audit trail of what the user typed, `source_url` is the queryable field for filtering history by site.

## Section 4: Frontend

React + Vite + TypeScript. Two routes, deliberately small in v1.

### Routes

**`/` (Search page).** Layout, top to bottom:
1. **Query input.** Multi-line `<textarea>`, "Run search" button, placeholder showing an example query.
2. **Live progress feed** (visible while a search is running). Scrolling list of agent events from SSE. By default shows tool calls and results only. A "Show agent thoughts" toggle reveals the `assistant_text` events.
3. **Results table.** Fills in live as `car_saved` events arrive. Columns: name, year, km, price (USD), transmission, color, link (opens new tab).
4. **Status banner.** "Running...", "Done, found N cars in T", or "Failed: <reason>".

**`/history` (History page).** Table of past searches, newest first. Columns: timestamp, source URL (hostname), query (truncated), cars found, status. Click a row to open `/history/:id`, which reuses the results table component plus the original query at the top.

### State and data flow

Three custom hooks, no global state library:

- **`useSearchStream(query)`**: opens `EventSource` to `POST /searches`, returns `{ status, events, cars, summary }`. All SSE handling lives here.
- **`useSearchHistory()`**: `fetch` against `GET /searches`.
- **`useSearchDetail(id)`**: `fetch` against `GET /searches/:id`.

### Styling

Tailwind CSS. Zero-config with Vite, no need to invent a design system, styling decisions visible in markup.

### Out of scope for v1

- Authentication (local single-user).
- Editing or deleting past searches from the UI.
- One-click re-run of past searches.
- History filtering and sorting.
- Per-car detail page.

## Section 5: Project structure and tech stack summary

### Repo layout

Monorepo with npm workspaces, three workspaces: `apps/backend`, `apps/frontend`, `shared`.

```
cars-webscrapper/
├── package.json                # workspace root
├── PLANNING.md
├── README.md
├── apps/
│   ├── backend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # data model
│   │   │   └── migrations/     # generated migration files
│   │   ├── data/               # SQLite file (gitignored)
│   │   └── src/
│   │       ├── config/         # env loader, app constants (timeouts, max turns)
│   │       ├── controllers/    # SearchController: thin, parses request, calls service
│   │       ├── enum/           # SearchStatus, etc.
│   │       ├── error/          # AppError class, errorHandler middleware
│   │       ├── generated/
│   │       │   └── prisma/     # generated Prisma client output
│   │       ├── interfaces/     # Car, Search, SseEvent (re-exported from shared/)
│   │       ├── logger/         # pino wrapper
│   │       ├── repositories/   # SearchRepository, CarRepository (DB access only)
│   │       ├── routers/        # searchRouter wires URLs to controller methods
│   │       ├── services/
│   │       │   ├── searchService.ts # orchestrates search lifecycle and agent run
│   │       │   ├── agent/
│   │       │   │   ├── runAgent.ts  # spawns Agent SDK, bridges events
│   │       │   │   ├── prompt.ts    # system prompt
│   │       │   │   └── tools.ts     # save_car, convert_currency, report_failure
│   │       │   └── fxService.ts     # currency conversion with cache
│   │       ├── tests/
│   │       ├── lib/
│   │       │   ├── extractUrl.ts    # regex source URL extraction
│   │       │   └── sse.ts           # tiny SSE helper
│   │       └── index.ts        # express app boot
│   └── frontend/
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx           # router
│           ├── pages/
│           │   ├── SearchPage.tsx
│           │   ├── HistoryPage.tsx
│           │   └── HistoryDetailPage.tsx
│           ├── components/
│           │   ├── ResultsTable.tsx
│           │   ├── ProgressFeed.tsx
│           │   └── StatusBanner.tsx
│           ├── hooks/
│           │   ├── useSearchStream.ts
│           │   ├── useSearchHistory.ts
│           │   └── useSearchDetail.ts
│           └── lib/
│               └── api.ts        # fetch wrappers, SSE event types
└── shared/
    └── types.ts                  # Car, Search, SseEvent shared between front and back
```

### Layer responsibilities

- **Router**: URL paths to controller methods. No logic.
- **Controller**: parses request, validates with zod, calls service, formats response (or pipes SSE).
- **Service**: business logic. `searchService` owns the lifecycle of a search and the agent run. Agent tools (`save_car`, etc.) call repositories directly without going through controllers.
- **Repository**: Prisma queries only. No business logic.

### Tech stack

**Backend:**
- `express` for HTTP. SSE handled with raw `res.write()` plus a small `sse.ts` helper (no extra library).
- `prisma` and `@prisma/client` for DB. SQLite provider. Generated client output in `src/generated/prisma/`.
- `@anthropic-ai/claude-agent-sdk` (package name to confirm at install time).
- `@playwright/mcp` for the Playwright MCP server, mounted into the agent via the SDK's `mcpServers` config. Run as a child process by the SDK, not embedded in the backend.
- `zod` for request body and tool input validation.
- `pino` for structured logging.
- `dotenv` for env loading.
- `tsx` for dev (`tsx watch src/index.ts`), `tsc` for build.
- Env: `ANTHROPIC_API_KEY` in `.env`.

**Frontend:**
- `react`, `react-dom`, `react-router-dom`.
- `vite`, `@vitejs/plugin-react`.
- `tailwindcss`.

**Tooling, root:**
- `typescript`, `prettier`, `eslint` with typescript-eslint preset.
- `concurrently` to run backend and frontend in parallel during dev.
- npm workspaces.

### Running it

```
npm install
npx prisma migrate dev   # creates SQLite file and applies schema
npm run dev              # backend on 3001, frontend on 5173
npm run build            # builds both
```

### Testing approach

- **Backend unit tests** (vitest) for pure pieces: `extractUrl`, `fxService` cache, repositories with a test DB.
- **Backend integration test** for one happy path of the searches API, with a mocked Agent SDK runner emitting a fake event stream. Verifies SSE wiring without burning real API tokens.
- **No E2E tests in v1.** Manual testing against real sites is the realistic check.
- **No agent-against-real-site tests in CI.** Too flaky and too expensive. Provide an opt-in `npm run test:agent` script for occasional manual runs.
