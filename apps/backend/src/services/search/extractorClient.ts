import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { CARS_CLI_SCRIPT, SCRAPLING_DIR, SCRAPLING_ENV, SCRAPLING_PYTHON } from "../../lib/scrapling.js";

const execFileAsync = promisify(execFile);

const CardSchema = z.object({
  name: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  link: z.string(),
  year: z.number().nullable(),
  km: z.number().nullable(),
  transmission: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
});

const ListingSchema = z.object({
  name: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().nullable(),
  km: z.number().nullable(),
  price_original: z.number().nullable(),
  currency_original: z.string().nullable(),
  transmission: z.string().nullable(),
  color: z.string().nullable(),
  characteristics: z.string().nullable(),
  link: z.string(),
});

const UnsupportedSchema = z.object({ supported: z.literal(false), error: z.string() });
const ErrorSchema = z.object({ supported: z.literal(true), error: z.string() });

const ListResultSchema = z.union([
  UnsupportedSchema,
  ErrorSchema,
  z.object({
    supported: z.literal(true),
    url_used: z.string(),
    listings: z.array(CardSchema),
    next_page_url: z.string().nullable(),
  }),
]);

const DetailsResultSchema = z.union([
  UnsupportedSchema,
  ErrorSchema,
  z.object({
    supported: z.literal(true),
    results: z.array(
      z.union([
        z.object({ url: z.string(), listing: ListingSchema }),
        z.object({ url: z.string(), error: z.string() }),
      ])
    ),
  }),
]);

const SiteInfoSchema = z.union([
  UnsupportedSchema,
  z.object({ supported: z.literal(true), currency: z.string().nullable() }),
]);

const SiteEntrySchema = z.object({
  id: z.string(),
  start_url: z.string(),
  currency: z.string().nullable(),
});

const SiteListSchema = z.object({ sites: z.array(SiteEntrySchema) });

export type SiteEntry = z.infer<typeof SiteEntrySchema>;
export type SiteList = z.infer<typeof SiteListSchema>;
export type ListingCard = z.infer<typeof CardSchema>;
export type ListingDetails = z.infer<typeof ListingSchema>;
export type ListResult = z.infer<typeof ListResultSchema>;
export type DetailsResult = z.infer<typeof DetailsResultSchema>;
export type SiteInfo = z.infer<typeof SiteInfoSchema>;

// Filters the site can apply in its own results URL. Prices in the site's card currency.
// They only narrow the pages to read: the pipeline still checks every listing.
export interface SiteFilters {
  min_km: number | null;
  max_km: number | null;
  min_price: number | null;
  max_price: number | null;
  transmission: "manual" | "automatic" | null;
  // Canonical names from the catalog. The adapter translates them to the site's own
  brand: string | null;
  model: string | null;
}

export interface Extractor {
  /** The sites with an adapter and the URL each search starts from */
  sites(): Promise<SiteList>;
  site(url: string): Promise<SiteInfo>;
  list(url: string, filters?: SiteFilters): Promise<ListResult>;
  details(urls: string[]): Promise<DetailsResult>;
}

// Runs `python cars_cli.py <args>` and returns its stdout
export type RunCli = (args: string[]) => Promise<string>;

const runCarsCli: RunCli = async (args) => {
  const { stdout } = await execFileAsync(SCRAPLING_PYTHON, [CARS_CLI_SCRIPT, ...args], {
    cwd: SCRAPLING_DIR,
    env: { ...process.env, ...SCRAPLING_ENV },
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
};

export function createExtractor(runCli: RunCli = runCarsCli): Extractor {
  return {
    async sites() {
      return SiteListSchema.parse(JSON.parse(await runCli(["sites"])));
    },
    async site(url) {
      return SiteInfoSchema.parse(JSON.parse(await runCli(["site", url])));
    },
    async list(url, filters) {
      const args = filters ? ["list", url, JSON.stringify(filters)] : ["list", url];
      return ListResultSchema.parse(JSON.parse(await runCli(args)));
    },
    async details(urls) {
      return DetailsResultSchema.parse(JSON.parse(await runCli(["details", ...urls])));
    },
  };
}
