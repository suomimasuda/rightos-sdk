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

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
