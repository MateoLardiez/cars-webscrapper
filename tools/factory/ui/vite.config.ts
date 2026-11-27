import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readRunningAgents } from "./server/runningAgents";

const RUNS_DIR = fileURLToPath(new URL("../runs", import.meta.url));

/** Serves GET /api/agents from the dev server itself, so the UI needs no separate backend. */
function runningAgentsApi(): Plugin {
  return {
    name: "running-agents-api",
    configureServer(server) {
      server.middlewares.use("/api/agents", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(readRunningAgents(RUNS_DIR)));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), runningAgentsApi()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5180,
    strictPort: true, // Kaneo and the cars app use 5173/5174; fail instead of moving
    open: "/agents",
  },
});
