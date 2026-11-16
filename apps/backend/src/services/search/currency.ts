import { z } from "zod";

const RatesSchema = z.object({ rates: z.record(z.string(), z.number()) });

export type ToUsd = (amount: number, currency: string) => Promise<number>;

// One converter per search: each currency's rate is fetched once and reused.
export function createUsdConverter(fetchFn: typeof fetch = fetch): ToUsd {
  const rates = new Map<string, Promise<number>>();

  const rateFor = async (currency: string): Promise<number> => {
    const res = await fetchFn(`https://api.exchangerate-api.com/v4/latest/${currency}`);
    if (!res.ok) throw new Error(`Exchange rate request failed: HTTP ${res.status}`);
    const rate = RatesSchema.parse(await res.json()).rates["USD"];
    if (rate === undefined) throw new Error(`No USD rate for ${currency}`);
    return rate;
  };

  return async (amount, currency) => {
    const code = currency.toUpperCase();
    if (code === "USD") return amount;
    let rate = rates.get(code);
    if (rate === undefined) {
      rate = rateFor(code);
      rates.set(code, rate);
      // Do not cache a failure: the next listing can retry
      rate.catch(() => rates.delete(code));
    }
    return Math.round(amount * (await rate) * 100) / 100;
  };
}
