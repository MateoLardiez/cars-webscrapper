import { z } from "zod";

const RatesSchema = z.object({ rates: z.record(z.string(), z.number()) });

export type ToUsd = (amount: number, currency: string) => Promise<number>;
// USD for one unit of `currency`
export type UsdRate = (currency: string) => Promise<number>;

export interface UsdConverter {
  toUsd: ToUsd;
  usdRate: UsdRate;
}

// One converter per search: each currency's rate is fetched once and reused.
export function createUsdConverter(fetchFn: typeof fetch = fetch): UsdConverter {
  const rates = new Map<string, Promise<number>>();

  const fetchRate = async (currency: string): Promise<number> => {
    const res = await fetchFn(`https://api.exchangerate-api.com/v4/latest/${currency}`);
    if (!res.ok) throw new Error(`Exchange rate request failed: HTTP ${res.status}`);
    const rate = RatesSchema.parse(await res.json()).rates["USD"];
    if (rate === undefined) throw new Error(`No USD rate for ${currency}`);
    return rate;
  };

  const usdRate: UsdRate = async (currency) => {
    const code = currency.toUpperCase();
    if (code === "USD") return 1;
    let rate = rates.get(code);
    if (rate === undefined) {
      rate = fetchRate(code);
      rates.set(code, rate);
      // Do not cache a failure: the next listing can retry
      rate.catch(() => rates.delete(code));
    }
    return rate;
  };

  const toUsd: ToUsd = async (amount, currency) =>
    Math.round(amount * (await usdRate(currency)) * 100) / 100;

  return { toUsd, usdRate };
}
