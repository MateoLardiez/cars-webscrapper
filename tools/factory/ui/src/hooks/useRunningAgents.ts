import { useEffect, useState } from "react";
import { parseRunningAgent, type RunningAgent } from "@/lib/runningAgent";

const POLL_MS = 3000;

interface RunningAgentsState {
  agents: RunningAgent[];
  error: string | null;
  loading: boolean;
}

/** Polls /api/agents every 3 seconds. Keeps the last good list if a poll fails. */
export function useRunningAgents(): RunningAgentsState {
  const [state, setState] = useState<RunningAgentsState>({ agents: [], error: null, loading: true });

  useEffect(() => {
    const controller = new AbortController();

    async function poll(): Promise<void> {
      try {
        const response = await fetch("/api/agents", { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body: unknown = await response.json();
        const agents = Array.isArray(body)
          ? body.flatMap((raw: unknown) => parseRunningAgent(raw) ?? [])
          : [];
        setState({ agents, error: null, loading: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setState((previous) => ({ ...previous, error: message, loading: false }));
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  return state;
}
