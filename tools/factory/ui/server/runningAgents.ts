import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRunningAgent, type RunningAgent } from "../src/lib/runningAgent";

/** True if a process with this pid exists. EPERM means it exists but belongs to another user. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 only checks, it does not kill
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Reads the dispatcher's runs folder (one JSON file per running agent).
 * Skips unreadable or invalid files, and files left behind by a killed dispatcher (dead pid).
 */
export function readRunningAgents(
  runsDir: string,
  isAlive: (pid: number) => boolean = isProcessAlive,
): RunningAgent[] {
  let files: string[];
  try {
    files = readdirSync(runsDir).filter((file) => file.endsWith(".json"));
  } catch {
    return []; // the folder does not exist until the dispatcher launches its first agent
  }
  const agents: RunningAgent[] = [];
  for (const file of files) {
    try {
      const agent = parseRunningAgent(JSON.parse(readFileSync(join(runsDir, file), "utf8")));
      if (agent && isAlive(agent.pid)) agents.push(agent);
    } catch {
      // half-written or removed between readdir and read: ignore it, the next poll sees it
    }
  }
  return agents.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
