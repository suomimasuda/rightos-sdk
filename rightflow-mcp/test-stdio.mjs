// Smoke: initialize + tools/list (+ optional explain_rightflow).
import { spawn } from "node:child_process";

const child = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env },
});

const pending = new Map();
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 20000);
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
    );
  });
}
function notify(method, params) {
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"
  );
}

let failures = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "OK " : "NG "} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

const EXPECTED = [
  "accept_proposal",
  "apply_transition",
  "create_proposal",
  "create_task",
  "explain_rightflow",
  "get_actor",
  "get_task",
  "list_actors",
  "list_proposals",
  "list_tasks",
  "reject_proposal",
  "upsert_actor",
].sort();

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0.0.0" },
});
check(
  "initialize",
  init.result?.serverInfo?.name === "rightflow",
  init.result?.serverInfo?.name
);
notify("notifications/initialized", {});

const tools = await rpc("tools/list", {});
const names = tools.result.tools.map((t) => t.name).sort();
check(
  "tools/list",
  names.length === EXPECTED.length &&
    names.every((name, i) => name === EXPECTED[i]),
  `got ${names.length}: ${names.join(",")}`
);

const explained = await rpc("tools/call", {
  name: "explain_rightflow",
  arguments: {},
});
const text = explained.result?.content?.[0]?.text ?? "";
check(
  "explain_rightflow",
  text.includes("What should happen next") &&
    text.includes("does_not") &&
    text.includes("bid"),
  text.slice(0, 120)
);

child.kill();
process.exit(failures ? 1 : 0);
