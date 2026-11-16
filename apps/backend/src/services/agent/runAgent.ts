import { existsSync } from "node:fs";
import type { Response } from "express";
import type { UsageSummary } from "@cars-webscrapper/shared";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { SCRAPLING_PROMPT } from "./prompt.js";
import { buildMcpServer, AgentFailureError } from "./tools.js";
import { sendSseEvent } from "../../lib/sse.js";
import { SCRAPLING_ENV, SCRAPLING_MCP_BIN, SETUP_HINT } from "../../lib/scrapling.js";

// Generic agent with the Scrapling browser tools. Used for sites without a
// code extractor, or when the request has criteria the code pipeline cannot apply.
export async function runAgent(
  searchId: number,
  userQuery: string,
  res: Response,
  onUsage: (usage: UsageSummary) => void
) {
  if (!existsSync(SCRAPLING_MCP_BIN)) throw new Error(SETUP_HINT);

  let failureReason: string | null = null;
  try {
    for await (const message of query({
      prompt: userQuery,
      options: {
        model: "claude-haiku-5-5",
        systemPrompt: SCRAPLING_PROMPT,
        permissionMode: "bypassPermissions",
        maxTurns: 25,
        // No built-in tools (Bash, Read, ...): fewer tokens per turn and no shell access
        tools: [],
        mcpServers: {
          scrapling: { command: SCRAPLING_MCP_BIN, env: SCRAPLING_ENV },
          cars: buildMcpServer(searchId, res),
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
            if (block.name === "mcp__cars__report_failure") {
              const input = block.input as { reason?: string };
              failureReason = input.reason ?? "Extraction failed";
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
    failureReason = err.message;
  }
  if (failureReason !== null) throw new AgentFailureError(failureReason);
}

export { AgentFailureError };
