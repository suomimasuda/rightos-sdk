// Live smoke test for the TypeScript SDK against production.
// Read-heavy: issues exactly one demo token, verifies it, marks it used.
import { RightOS, RightOSError } from "./dist/index.js";

const demo = new RightOS({ apiKey: "rk_demo_00000000000000000000" });
const pub = new RightOS();

let failures = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "OK " : "NG "} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

// public
const plans = await pub.listPlans();
check("listPlans returns 5 plans", plans.length === 5, `got ${plans.length}`);

const policy = await pub.getLocationPolicy("loc_ev");
check(
  "loc_ev policy is non-transferable",
  policy.policy.transferable === false
);

const defs = await pub.listPolicies();
check(
  "listPolicies returns 7 presets and >= 10 country overlays",
  Object.keys(defs.presets).length === 7 &&
    Object.keys(defs.countryOverlays).length >= 10,
  `presets=${Object.keys(defs.presets).length} overlays=${Object.keys(defs.countryOverlays).length}`
);

// auth error surfaces as RightOSError
let authErr = null;
try {
  await new RightOS({ apiKey: "rk_live_invalid" }).listLocations();
} catch (e) {
  authErr = e;
}
check(
  "invalid key throws RightOSError(401)",
  authErr instanceof RightOSError && authErr.status === 401,
  authErr?.code
);

// operator flow on demo org
const locations = await demo.listLocations();
check("demo listLocations > 0", locations.length > 0, `got ${locations.length}`);

const issued = await demo.issueToken({
  locationId: locations[0].id,
  title: "SDK live test (ts)",
});
check("issueToken returns walletUrl", issued.walletUrl.includes(issued.token.id));

const verified = await pub.verifyToken(issued.token.id, issued.verificationCode);
check("verifyToken -> success", verified.result === "success", verified.result);

const used = await demo.useToken(issued.token.id);
check("useToken -> used", used.status === "used", used.status);

const again = await pub.verifyToken(issued.token.id, issued.verificationCode);
check("re-verify -> already_used", again.result === "already_used", again.result);

// webhooks (v0.4.0): demo org can list but not register
const hooks = await demo.listWebhooks();
check("demo listWebhooks returns array", Array.isArray(hooks));
let whErr = null;
try {
  await demo.createWebhook({ url: "https://example.com/hook" });
} catch (e) {
  whErr = e;
}
check(
  "demo createWebhook throws 403 demo_org",
  whErr instanceof RightOSError && whErr.status === 403 && whErr.code === "demo_org",
  whErr?.code
);

// webhook signature helper (offline)
{
  const { createHmac } = await import("node:crypto");
  const secret = "whsec_selftest";
  const body = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  check(
    "verifyWebhookSignature accepts valid signature",
    await RightOS.verifyWebhookSignature(secret, `t=${t},v1=${v1}`, body)
  );
  check(
    "verifyWebhookSignature rejects tampered body",
    !(await RightOS.verifyWebhookSignature(secret, `t=${t},v1=${v1}`, body + "x"))
  );
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
