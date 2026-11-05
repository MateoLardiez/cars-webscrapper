import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import type { UsageSummary } from "@cars-webscrapper/shared";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { SYSTEM_PROMPT } from "./prompt.js";
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

export async function runAgent(
  searchId: number,
  userQuery: string,
  res: Response,
  onUsage: (usage: UsageSummary) => void
) {
  if (!existsSync(SCRAPLING_BIN)) {
    throw new Error("Scrapling is not installed. Run: npm run setup:scrapling");
  }
  const carsServer = buildMcpServer(searchId, res);

  for await (const message of query({
    prompt: userQuery,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      permissionMode: "bypassPermissions",
      maxTurns: 50,
      mcpServers: {
        scrapling: {
          command: SCRAPLING_BIN,
          env: { PLAYWRIGHT_BROWSERS_PATH: join(SCRAPLING_DIR, ".browsers") },
        },
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
          sendSseEvent(res, {
            type: "tool_call",
            name: block.name,
            summary: JSON.stringify(block.input).slice(0, 120),
          });
        }
      }
    }
  }
}

export { AgentFailureError };
