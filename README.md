# cars-webscrapper
Web scrappet for used cars

## Running locally

Requirements: Node.js 20+, npm and [uv](https://docs.astral.sh/uv/) (for the Scrapling browser tools).

1. Install dependencies (from the repo root):

   ```bash
   npm install
   npm run setup:scrapling
   ```

   `setup:scrapling` creates a Python environment and downloads the browsers inside `tools/scrapling/` (about 1 GB, gitignored). Nothing is installed globally. On Linux you may also need system libraries once: `sudo tools/scrapling/.venv/bin/python -m playwright install-deps chromium`.

2. Create the backend env file:

   ```bash
   cp apps/backend/.env.example apps/backend/.env
   ```

   Then edit `apps/backend/.env`:

   ```
   PORT=3001
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

   The frontend proxies `/searches` and `/catalog` to `http://localhost:3001`, so keep `PORT=3001`.

3. Set up the database (SQLite, stored in `apps/backend/data/dev.db`):

   ```bash
   cd apps/backend
   npx prisma migrate dev
   npx prisma generate
   cd ../..
   ```

4. Start the backend and the frontend together:

   ```bash
   npm run dev
   ```

   Or in two terminals:

   ```bash
   npm --workspace @cars-webscrapper/backend run dev    # http://localhost:3001
   npm --workspace @cars-webscrapper/frontend run dev   # http://localhost:5173
   ```

5. Open http://localhost:5173.

### Troubleshooting

If `npm install` fails with `ENOTEMPTY: directory not empty, rename ...`, a previous install was interrupted and left temporary folders (names starting with a dot, like `.fast-uri-hBpXM3Ee`) inside `node_modules`. Remove them and retry:

```bash
find node_modules -maxdepth 3 -name '.*-????????' -not -name '.bin' -not -name '.cache' -exec rm -rf {} +
npm install
```

If it still fails, delete `node_modules` and run `npm install` again.

### How a search works

The search form sends structured filters (price in USD, km, year, transmission, brand, model, colors). The backend runs the code pipeline on every site that has an adapter (`tools/scrapling/cars_extractors/registry.py`), at most 3 sites at a time. A site that fails is reported in the UI and the others keep going. No search calls Claude, so tokens and cost are 0.

Brands and models come from one catalog, `apps/shared/catalog.json`, used by the backend and by the Python adapters. Start small and add a brand or model only after checking it on each site.

The pages are read through Scrapling (`tools/scrapling`, pinned in `pyproject.toml` and `uv.lock`). If it is missing, the search fails with "Run: npm run setup:scrapling".

Tests: `npm --workspace @cars-webscrapper/backend test`, `npm --workspace @cars-webscrapper/frontend test` and `uv run pytest` in `tools/scrapling`.

## Software factory (agents that implement Kaneo tasks)

Tasks are planned in [Kaneo](https://kaneo.app) (self-hosted). A dispatcher picks a ready task and launches a headless Claude Code agent that implements it and opens a pull request.

```
Kaneo task (to-do + agent-task)
  -> dispatcher (tools/factory/dispatcher.ts) picks one, one at a time
    -> agent (claude -p, prompt in tools/factory/agent-prompt.md)
         moves the task to in-progress, creates a worktree and a branch,
         implements, runs the tests, commits, pushes, opens the PR,
         moves the task to in-review
    -> dispatcher links the PR in Kaneo (or flags the task for a human)
```

### Requirements

- Kaneo running at `http://localhost:5173`. The frontend dev server also defaults to port 5173; when Kaneo is up, Vite moves the frontend to the next free port (5174) and prints it.
- The Claude Code CLI (`claude`) logged in.
- The Kaneo MCP server added to Claude Code **from the repo root** (local scope), and logged in:
  ```bash
  claude mcp add --transport http kaneo http://localhost:5173/api/mcp
  claude mcp list   # kaneo should show "Connected"
  ```
- The GitHub CLI (`gh`) logged in with push access to this repo, and `uv` installed.
- A Kaneo API key for the dispatcher. Create it in Kaneo and store it outside the repo:
  ```bash
  mkdir -p ~/.config/factory
  printf 'KANEO_API_KEY=%s\n' 'YOUR_KEY' > ~/.config/factory/kaneo.env
  chmod 600 ~/.config/factory/kaneo.env
  ```

### Which tasks an agent takes

- The task is in the **To Do** column and has the **`agent-task`** label.
- No task it depends on is unfinished: a Kaneo "blocks" relation from a task that is not in Done makes the dispatcher skip it.
- Only one agent runs at a time. If an `agent-task` is already In Progress, nothing is picked.
- Highest priority first, then lowest task number.

Optional area labels limit the folders the agent may change: `backend` (`apps/backend`, `apps/shared`), `frontend` (`apps/frontend`, `apps/shared`), `scrapling` (`tools/scrapling`, `apps/shared`). Without an area label the agent may change the whole repo except `.github/`.

When the agent finds work outside the task, it creates a new Kaneo task in To Do, related to the original, **without** `agent-task`, so you decide whether an agent takes it.

### Running it

From the repo root:

```bash
npx tsx tools/factory/dispatcher.ts --dry-run       # show the task and the agent command, change nothing
npx tsx tools/factory/dispatcher.ts                 # run once: pick one task, run the agent, exit
npx tsx tools/factory/dispatcher.ts --interval 600  # keep polling every 600 seconds (Ctrl+C to stop)
```

The agent can take a long time (the dispatcher kills it after 90 minutes). To run it once a day, schedule the one-shot command instead of a long `--interval`, for example with cron (cron has a minimal `PATH`, so set it to include `node`, `claude`, `gh` and `uv`):

```cron
0 9 * * * cd /path/to/cars-webscrapper && PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin npx tsx tools/factory/dispatcher.ts >> $HOME/.local/state/factory.log 2>&1
```

Optional environment variables: `KANEO_URL` (default `http://localhost:5173`) and `KANEO_PROJECT_ID` (default: the Cars Webscrapper project).

### Watching the running agents

A small separate app (`tools/factory/ui`, React + shadcn/ui) shows the agents that are running right now and the task each one took. It is independent from the cars app: start it on its own, in another terminal, from the repo root:

```bash
npm run factory:ui   # http://localhost:5180/agents
```

It refreshes every 3 seconds. The dispatcher writes one file per running agent in `tools/factory/runs/` (gitignored) and removes it when the agent ends; the app reads that folder and hides entries whose process is gone (for example, after the dispatcher was killed). Tests: `npm --workspace @cars-webscrapper/factory-ui test`.

### After a run

- **Success:** the task is In Review, with the PR linked in Kaneo and a result comment. Review and merge the PR yourself.
- **Needs a human:** if the agent stopped (unclear task, failing tests) or the run failed, the dispatcher comments "Necesita humano: ...", moves the task back to To Do and **removes `agent-task`**, so it is not retried in a loop. Read the comments, fix the task, and add the label again to retry.
- Each task gets its own worktree in `../cars-webscrapper-worktrees/CW-N` on branch `agent/CW-N-<slug>`. Remove it when the PR is merged:
  ```bash
  git worktree remove ../cars-webscrapper-worktrees/CW-7
  ```

### Known limits

- If you stop the dispatcher while an agent is running, the agent stops too and the task stays In Progress with `agent-task`. The dispatcher then reports "busy" until you move that task by hand.
- The deny rules for the agent (no force push, no push to `main`) are a safety net, not a guarantee. Protect `main` with GitHub branch protection.
