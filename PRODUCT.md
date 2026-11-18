# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Today the author is the only user: a developer searching for a used car to buy, working mostly in a desktop browser. The author intends to open it to the public later, so strangers who have never seen the tool are the longer-term audience. No accounts, roles or multi-user features exist yet.

## Product Purpose

The user fills a search form (price in USD, km, year, transmission, brand, model, colors to include or exclude). The backend runs that search on every supported used-car site at once, extracts the matching listings with code, and saves them to a local database. The frontend streams progress live, site by site, and keeps every past search, with its filters and results, for later browsing.

The core job is comparing used cars from several marketplaces in one place, and being able to trust what each site returned: which sites answered, which failed and why. The project was also started to learn the Claude Agent SDK and full-stack agentic apps (see PLANNING.md for the original agent design, now superseded).

## Positioning

One form searches every supported marketplace in parallel, instead of repeating the same search site by site. Coverage is a fixed set of sites that have an adapter (today only Kavak), and each new site is added by writing an adapter. A site that fails is reported and does not block the others.

## Operating Context

- A search makes no LLM calls: cost and tokens are 0. The Claude agent from the first design is not on the search path.
- A run streams events over SSE: per-site status (running, done, failed), logs of the code pipeline, cars saved, extraction failures, and a final summary.
- At most 3 sites are read at the same time. Inside a site, pages are read one at a time.
- Each run is a snapshot: its filters summary, status (running, done, failed, timeout), duration, per-site outcome and cars are preserved. Cars saved before a failure are kept.
- Prices are normalized to USD, with the original price and currency kept when different.
- Brands and models come from one shared catalog (`apps/shared/catalog.json`), used by the form, the backend and the site adapters. It starts small and grows only after each entry is checked on each site.
- Pages are read through Scrapling (Python, run as a child process). If it is not installed, the search fails with a setup hint.

## Capabilities and Constraints

- Two surfaces: a search page (filter form, live site statuses and progress, results) and a history area (list of past searches, detail with results).
- Result fields: name, model, year, km, price in USD, original price and currency, transmission, color, characteristics, source site, link to the listing.
- No free text and no URL input: filters are structured. Criteria the form cannot express are out of scope for now.
- The UI language is Spanish.
- Stack: React, Vite and Tailwind frontend; Node, Express and SQLite backend with Prisma; Python and Scrapling for page extraction; shared TypeScript types.
- Product management (tasks, projects, labels) is tracked in Kaneo.
- Undecided: whether and when the product goes public, and what that would require (accounts, hosting, rate limits). Also undecided: the future role of the Claude agent, for example as a fallback for difficult sites (see `tickets/todo/004-agent-role-for-difficult-sites.md`).

## Evidence on Hand

- Real search data exists in the local database (for example a run of 21 Kavak Argentina listings).
- No testimonials, user research or benchmarks exist. Do not invent them.

## Product Principles

- Show the work honestly: per-site progress, failures and timeouts are visible, never hidden behind a spinner.
- Results must be easy to compare at a glance, since that is the output of the whole run.
- Be plain about coverage: only sites with an adapter are searched, and the interface says which ones answered.
- Keep every past search reachable, because each run is a record.
- Design for a stranger arriving later: the interface should explain itself without the author present.
