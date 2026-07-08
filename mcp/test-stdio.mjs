// Smoke test: drive the MCP server over stdio with raw JSON-RPC.
// Verifies initialize, tools/list, and two public tool calls against production.
import { spawn } from "node:child_process";

const child = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
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
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

let failures = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "OK " : "NG "} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0.0.0" },
});
check("initialize", init.result?.serverInfo?.name === "rightos", init.result?.serverInfo?.name);
notify("notifications/initialized", {});

const tools = await rpc("tools/list", {});
const names = tools.result.tools.map((t) => t.name).sort();
check("tools/list returns 12 tools", names.length === 12, `got ${names.length}: ${names.join(",")}`);

const plans = await rpc("tools/call", { name: "list_plans", arguments: {} });
const plansData = JSON.parse(plans.result.content[0].text);
check("list_plans returns 5 plans", plansData.length === 5, `got ${plansData.length}`);

const policy = await rpc("tools/call", {
  name: "get_location_policy",
  arguments: { locationId: "loc_ev" },
});
const policyData = JSON.parse(policy.result.content[0].text);
check("loc_ev non-transferable", policyData.policy?.transferable === false);

const bad = await rpc("tools/call", {
  name: "get_token",
  arguments: { tokenId: "tok_nonexistent" },
});
check("missing token -> isError 404", bad.result.isError === true && bad.result.content[0].text.includes("404"), bad.result.content[0].text);

const noKey = await rpc("tools/call", { name: "list_locations", arguments: {} });
check(
  "operator tool without key -> isError 401",
  noKey.result.isError === true && noKey.result.content[0].text.includes("missing_api_key"),
  noKey.result.content[0].text
);

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
child.kill();
process.exit(failures === 0 ? 0 : 1);
