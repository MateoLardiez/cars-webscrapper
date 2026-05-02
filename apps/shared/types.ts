export interface Car {
  id: number;
  searchId: number;
  name: string;
  model: string | null;
  year: number | null;
  km: number | null;
  priceOriginal: number | null;
  currencyOriginal: string | null;
  priceUsd: number | null;
  transmission: string | null;
  color: string | null;
  characteristics: string | null;
  link: string;
  savedAt: string;
}

export interface Search {
  id: number;
  createdAt: string;
  query: string;
  sourceUrl: string;
  status: "running" | "done" | "failed" | "timeout";
  failureReason: string | null;
  durationMs: number | null;
  carsFound: number;
}

export type SseEvent =
  | { type: "agent_thinking"; text: string }
  | { type: "tool_call"; name: string; summary: string }
  | { type: "car_saved"; car: Car }
  | { type: "extraction_failed"; reason: string }
  | { type: "done"; carsFound: number; durationMs: number };
