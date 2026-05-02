import type { Response } from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { SYSTEM_PROMPT } from "./prompt.js";
import { buildMcpServer, AgentFailureError } from "./tools.js";
import { sendSseEvent } from "../../lib/sse.js";

export async function runAgent(
  searchId: number,
  userQuery: string,
  res: Response
) {
  const carsServer = buildMcpServer(searchId, res);

  for await (const message of query({
    prompt: userQuery,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      permissionMode: "bypassPermissions",
      maxTurns: 50,
      pathToClaudeCodeExecutable: "/home/mateo/.local/bin/claude",
      mcpServers: {
        playwright: { command: "npx", args: ["@playwright/mcp@latest", "--headless"] },
        cars: carsServer,
      },
    },
  })) {
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
