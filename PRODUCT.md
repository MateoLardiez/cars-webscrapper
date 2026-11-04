# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Today the author is the only user: a developer searching for a used car to buy, working mostly in a desktop browser. The author intends to open it to the public later, so strangers who have never seen the tool are the longer-term audience. No accounts, roles or multi-user features exist yet.

## Product Purpose

The user describes a car search in natural language, including a site URL and filters (for example price, mileage, transmission, colors to avoid). A Claude agent navigates that site, extracts matching listings, and saves them to a local database. The frontend streams the agent's progress live and keeps every past search, with its filters and results, for later browsing.

The core job, as confirmed by the author, is watching the agent work: seeing live progress and being able to trust what the agent did matters as much as the final list. The project was also started to learn the Claude Agent SDK and full-stack agentic apps (see PLANNING.md).

## Positioning

Search is driven by plain-language instructions and works on any site the user points it at, instead of a fixed set of supported marketplaces. Quality is best effort and varies per site.

## Operating Context

- A run streams events over SSE: agent thinking, tool calls, cars saved, extraction failures, and a final summary.
- A run has a soft cap in the prompt (about 5 pages of listings) and a hard backend timeout of 5 minutes.
- Each run is a snapshot: its query, source URL, status (running, done, failed, timeout), duration and cars are preserved.
- Prices are normalized to USD, with the original price and currency kept when different.

## Capabilities and Constraints

- Two surfaces: a search page (query, live status, results, agent activity) and a history area (list of past searches, detail with results).
- Result fields: name, model, year, km, price in USD, original price and currency, transmission, color, link to the listing.
- The UI language is Spanish.
- Stack: React, Vite and Tailwind frontend; Node, Express and SQLite backend; shared TypeScript types.
- Undecided: whether and when the product goes public, and what that would require (accounts, hosting, rate limits).

## Evidence on Hand

- Real search data exists in the local database (for example a run of 21 Kavak Argentina listings).
- No testimonials, user research or benchmarks exist. Do not invent them.

## Product Principles

- Show the agent's work honestly: progress, failures and timeouts are visible, never hidden behind a spinner.
- Results must be easy to compare at a glance, since that is the output of the whole run.
- Work with any site and any phrasing, and be plain about the fact that quality varies.
- Keep every past search reachable, because each run is a record.
- Design for a stranger arriving later: the interface should explain itself without the author present.
