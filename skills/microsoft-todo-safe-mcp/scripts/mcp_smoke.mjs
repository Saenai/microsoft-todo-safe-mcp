import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = dirname(scriptDir);
const serverDir = join(skillDir, "server");
const serverEntry = join(serverDir, "dist", "todo-index.js");

if (!existsSync(serverEntry)) {
  console.error(`Built MCP server entry not found: ${serverEntry}`);
  console.error("Initialize this installed skill copy first:");
  console.error(`powershell -ExecutionPolicy Bypass -File "${join(skillDir, "scripts", "install.ps1")}"`);
  process.exit(1);
}

const child = spawn("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  `Set-Location -LiteralPath '${serverDir}'; & 'C:\\Program Files\\nodejs\\node.exe' '${serverEntry}'`,
], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
let id = 1;
const pending = new Map();

function send(method, params = {}) {
  const requestId = id++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Timeout waiting for ${method}`));
    }, 5000);
    pending.set(requestId, { resolve, reject, timer });
  });
}

function parse() {
  while (stdout.includes("\n")) {
    const index = stdout.indexOf("\n");
    const line = stdout.slice(0, index).replace(/\r$/, "");
    stdout = stdout.slice(index + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
  }
}

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
  parse();
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

const hardTimeout = setTimeout(() => {
  child.kill("SIGKILL");
  console.error("MCP smoke test timed out");
  process.exit(2);
}, 12000);

try {
  const initialized = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mstodo-skill-smoke", version: "0.1.0" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const tools = await send("tools/list");
  const names = (tools.tools ?? []).map((tool) => tool.name).sort();
  console.log(JSON.stringify({
    server: initialized.serverInfo,
    toolCount: names.length,
    tools: names,
    stderrStarted: stderr.includes("Server started and listening"),
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(stderr.split(/\r?\n/).slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  child.kill("SIGKILL");
}
