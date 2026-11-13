import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import type { UsageSummary } from "@cars-webscrapper/shared";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { EXTRACTOR_PROMPT, SCRAPLING_PROMPT } from "./prompt.js";
import { buildMcpServer, AgentFailureError } from "./tools.js";
import { sendSseEvent } from "../../lib/sse.js";

// Scrapling MCP server lives inside the repo (see tools/scrapling/setup.sh)
const SCRAPLING_DIR = fileURLToPath(
  new URL("../../../../../tools/scrapling/", import.meta.url)
);
const SCRAPLING_BIN = join(
  SCRAPLING_DIR,
  process.platform === "win32" ? ".venv/Scripts/scrapling-mcp.exe" : ".venv/bin/scrapling-mcp"
);
const CARS_PYTHON = join(
  SCRAPLING_DIR,
  process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python"
);
const CARS_MCP_SCRIPT = join(SCRAPLING_DIR, "cars_mcp.py");
const MCP_ENV = { PLAYWRIGHT_BROWSERS_PATH: join(SCRAPLING_DIR, ".browsers") };

// Sites with a code extractor: hostname -> path prefix.
// Keep in sync with tools/scrapling/cars_extractors/registry.py
const EXTRACTOR_SITES: Record<string, string> = { "www.kavak.com": "/ar" };

function hasExtractor(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const prefix = EXTRACTOR_SITES[hostname.toLowerCase()];
    return prefix !== undefined && (pathname === prefix || pathname.startsWith(`${prefix}/`));
  } catch {
    return false;
  }
}

type Mode = "extractor" | "scrapling";

interface PassResult {
  failureReason: string | null;
  carsSaved: number;
}

// One agent run. "extractor" mode loads only the code extractor (small context);
// "scrapling" mode loads the generic Scrapling tools (large context).
async function runPass(
  mode: Mode,
  searchId: number,
  userQuery: string,
  res: Response,
  onUsage: (usage: UsageSummary) => void
): Promise<PassResult> {
  const carsServer = buildMcpServer(searchId, res);
  const result: PassResult = { failureReason: null, carsSaved: 0 };

  try {
    for await (const message of query({
      prompt: userQuery,
      options: {
        model: "claude-haiku-5-5",
        systemPrompt: mode === "extractor" ? EXTRACTOR_PROMPT : SCRAPLING_PROMPT,
        permissionMode: "bypassPermissions",
        maxTurns: 25,
        // No built-in tools (Bash, Read, ...): fewer tokens per turn and no shell access
        tools: [],
        mcpServers: {
          ...(mode === "extractor"
            ? { "cars-extractor": { command: CARS_PYTHON, args: [CARS_MCP_SCRIPT], env: MCP_ENV } }
            : { scrapling: { command: SCRAPLING_BIN, env: MCP_ENV } }),
          cars: carsServer,
        },
      },
    })) {
      if (message.type === "result") {
        onUsage({
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens,
          cacheCreationTokens: message.usage.cache_creation_input_tokens,
          costUsd: message.total_cost_usd,
        });
      }
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text) {
            sendSseEvent(res, { type: "agent_thinking", text: block.text });
          }
          if (block.type === "tool_use") {
            if (block.name === "mcp__cars__save_car") result.carsSaved += 1;
            if (block.name === "mcp__cars__report_failure") {
              const input = block.input as { reason?: string };
              result.failureReason = input.reason ?? "Extraction failed";
            }
            sendSseEvent(res, {
              type: "tool_call",
              name: block.name,
              summary: JSON.stringify(block.input).slice(0, 120),
            });
          }
        }
      }
    }
  } catch (err) {
    // report_failure throws AgentFailureError inside the tool
    if (!(err instanceof AgentFailureError)) throw err;
    result.failureReason = err.message;
  }
  return result;
}

export async function runAgent(
  searchId: number,
  userQuery: string,
  sourceUrl: string,
  res: Response,
  onUsage: (usage: UsageSummary) => void
) {
  if (!existsSync(SCRAPLING_BIN)) {
    throw new Error("Scrapling is not installed. Run: npm run setup:scrapling");
  }

  // Both passes can report usage: report the sum of all of them
  const total: UsageSummary = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
  };
  const addUsage = (usage: UsageSummary) => {
    total.inputTokens += usage.inputTokens;
    total.outputTokens += usage.outputTokens;
    total.cacheReadTokens += usage.cacheReadTokens;
    total.cacheCreationTokens += usage.cacheCreationTokens;
    total.costUsd += usage.costUsd;
    onUsage({ ...total });
  };

  if (!hasExtractor(sourceUrl)) {
    const pass = await runPass("scrapling", searchId, userQuery, res, addUsage);
    if (pass.failureReason !== null) throw new AgentFailureError(pass.failureReason);
    return;
  }

  const first = await runPass("extractor", searchId, userQuery, res, addUsage);
  if (first.failureReason === null) return;

  // Fall back to the generic tools only if nothing was saved yet, to avoid duplicates
  if (first.carsSaved > 0) throw new AgentFailureError(first.failureReason);
  sendSseEvent(res, {
    type: "agent_thinking",
    text: `Extractor failed (${first.failureReason}). Falling back to the generic tools.`,
  });
  const second = await runPass("scrapling", searchId, userQuery, res, addUsage);
  if (second.failureReason !== null) throw new AgentFailureError(second.failureReason);
}

export { AgentFailureError };
