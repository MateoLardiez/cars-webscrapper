import type { Response } from "express";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { carRepository } from "../../repositories/carRepository.js";
import { sendSseEvent } from "../../lib/sse.js";

export class AgentFailureError extends Error {}

export function buildMcpServer(searchId: number, res: Response) {
  const saveCar = tool(
    "save_car",
    "Save a matching car listing to the database.",
    {
      name: z.string(),
      model: z.string().optional(),
      year: z.number().optional(),
      km: z.number().optional(),
      price_original: z.number().optional(),
      currency_original: z.string().optional(),
      price_usd: z.number().optional(),
      transmission: z.string().optional(),
      color: z.string().optional(),
      characteristics: z.string().optional(),
      link: z.string(),
    },
    async (input) => {
      const car = await carRepository.create({
        searchId,
        name: input.name,
        model: input.model ?? null,
        year: input.year ?? null,
        km: input.km ?? null,
        priceOriginal: input.price_original ?? null,
        currencyOriginal: input.currency_original ?? null,
        priceUsd: input.price_usd ?? null,
        transmission: input.transmission ?? null,
        color: input.color ?? null,
        characteristics: input.characteristics ?? null,
        link: input.link,
      });
      sendSseEvent(res, { type: "car_saved", car: { ...car, searchId } });
      return { content: [{ type: "text" as const, text: "Saved." }] };
    }
  );

  const convertCurrency = tool(
    "convert_currency",
    "Convert an amount from one currency to another.",
    {
      amount: z.number(),
      from_currency: z.string(),
      to_currency: z.string(),
    },
    async ({ amount, from_currency, to_currency }) => {
      const from = from_currency.toUpperCase();
      const to = to_currency.toUpperCase();
      if (from === to) {
        return { content: [{ type: "text" as const, text: String(amount) }] };
      }
      const apiRes = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
      const data = await apiRes.json() as { rates: Record<string, number> };
      const rate = data.rates[to] ?? 1;
      const result = Math.round(amount * rate * 100) / 100;
      return { content: [{ type: "text" as const, text: String(result) }] };
    }
  );

  const reportFailure = tool(
    "report_failure",
    "Report that extraction failed and stop the run.",
    { reason: z.string() },
    async ({ reason }) => {
      throw new AgentFailureError(reason);
    }
  );

  return createSdkMcpServer({
    name: "cars-tools",
    version: "1.0.0",
    tools: [saveCar, convertCurrency, reportFailure],
  });
}
