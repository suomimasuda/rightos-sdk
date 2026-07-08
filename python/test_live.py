"""Live smoke test for the Python SDK against production.

Read-heavy: issues exactly one demo token, verifies it, marks it used.
"""
import sys

from rightos import RightOS, RightOSError

demo = RightOS(api_key="rk_demo_00000000000000000000")
pub = RightOS()
failures = 0


def check(name, ok, extra=""):
    global failures
    print(f"{'OK ' if ok else 'NG '} {name}{' - ' + str(extra) if extra else ''}")
    if not ok:
        failures += 1


plans = pub.list_plans()
check("list_plans returns 5 plans", len(plans) == 5, len(plans))

policy = pub.get_location_policy("loc_ev")
check("loc_ev policy is non-transferable", policy["policy"]["transferable"] is False)

try:
    RightOS(api_key="rk_live_invalid").list_locations()
    check("invalid key raises RightOSError(401)", False)
except RightOSError as e:
    check("invalid key raises RightOSError(401)", e.status == 401, e.code)

locations = demo.list_locations()
check("demo list_locations > 0", len(locations) > 0, len(locations))

issued = demo.issue_token(location_id=locations[0]["id"], title="SDK live test (py)")
check("issue_token returns walletUrl", issued["token"]["id"] in issued["walletUrl"])

verified = pub.verify_token(issued["token"]["id"], issued["verificationCode"])
check("verify_token -> success", verified["result"] == "success", verified["result"])

used = demo.use_token(issued["token"]["id"])
check("use_token -> used", used["status"] == "used", used["status"])

again = pub.verify_token(issued["token"]["id"], issued["verificationCode"])
check("re-verify -> already_used", again["result"] == "already_used", again["result"])

print("ALL PASS" if failures == 0 else f"{failures} FAILURES")
sys.exit(0 if failures == 0 else 1)
