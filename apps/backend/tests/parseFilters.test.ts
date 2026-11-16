import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { FILTER_MODEL, parseFilters, usageSummary } from "../src/services/search/parseFilters.js";
import type { SearchFilters } from "../src/services/search/filters.js";

const QUERY =
  "Busca autos en https://www.kavak.com/ar por debajo de $10.000 USD, menos de 100.000 km, manual, sin amarillo o verde";

const FILTERS: SearchFilters = {
  minPriceUsd: null,
  maxPriceUsd: 10000,
  minKm: null,
  maxKm: 100000,
  minYear: null,
  maxYear: null,
  transmission: "manual",
  includeColors: [],
  excludeColors: ["amarillo", "verde"],
  unsupportedCriteria: null,
};

const USAGE = {
  input_tokens: 600,
  output_tokens: 200,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

// A real SDK client whose HTTP layer returns a canned API response
function clientReturning(body: object) {
  const requests: Record<string, unknown>[] = [];
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json(body);
    },
  });
  return { client, requests };
}

function message(text: string, stopReason = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: FILTER_MODEL,
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: USAGE,
  };
}

describe("parseFilters", () => {
  it("returns the filters and the usage of the call", async () => {
    const { client, requests } = clientReturning(message(JSON.stringify(FILTERS)));

    const result = await parseFilters(QUERY, client);

    expect(result.filters).toEqual(FILTERS);
    expect(result.usage.inputTokens).toBe(600);
    expect(requests[0]).toMatchObject({
      model: FILTER_MODEL,
      messages: [{ role: "user", content: QUERY }],
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
  });

  it("fails when the model refuses", async () => {
    const { client } = clientReturning(message("", "refusal"));
    await expect(parseFilters(QUERY, client)).rejects.toThrow("declined");
  });

  it("fails when the output does not match the schema", async () => {
    const { client } = clientReturning(message(JSON.stringify({ maxKm: "a lot" })));
    await expect(parseFilters(QUERY, client)).rejects.toThrow();
  });
});

describe("usageSummary", () => {
  it("prices tokens with the Haiku 5.5 rates", () => {
    const usage = usageSummary({
      ...USAGE,
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    } as Anthropic.Usage);
    // 0.10 input + 0.50 output + 0.01 cache read + 0.125 cache write
    expect(usage.costUsd).toBeCloseTo(0.735);
  });
});
