import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Scrapling lives inside the repo (see tools/scrapling/setup.sh)
export const SCRAPLING_DIR = fileURLToPath(new URL("../../../../tools/scrapling/", import.meta.url));

const BIN_DIR = process.platform === "win32" ? ".venv/Scripts" : ".venv/bin";
const EXE = process.platform === "win32" ? ".exe" : "";

export const SCRAPLING_MCP_BIN = join(SCRAPLING_DIR, BIN_DIR, `scrapling-mcp${EXE}`);
export const SCRAPLING_PYTHON = join(SCRAPLING_DIR, BIN_DIR, `python${EXE}`);
export const CARS_CLI_SCRIPT = join(SCRAPLING_DIR, "cars_cli.py");
export const SCRAPLING_ENV = { PLAYWRIGHT_BROWSERS_PATH: join(SCRAPLING_DIR, ".browsers") };
export const SETUP_HINT = "Scrapling is not installed. Run: npm run setup:scrapling";
