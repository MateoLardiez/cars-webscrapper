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

   The frontend proxies `/searches` to `http://localhost:3001`, so keep `PORT=3001`.

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

Note: the agent fetches pages through the Scrapling MCP server (`tools/scrapling`, pinned in `pyproject.toml` and `uv.lock`). If it is missing, the search fails with "Run: npm run setup:scrapling".
