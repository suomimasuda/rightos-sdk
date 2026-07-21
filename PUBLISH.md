# SDK publish rules (RightOS / RightFlow)

Goal: **npm registry versions always equal `suomimasuda/rightos-sdk` package.json**.
Weekly `publish-health` fails if they diverge **or** if OIDC Trusted Publishing breaks.

## Permanent auth policy (do not regress)

| Method | Status |
| --- | --- |
| **npm Trusted Publishing (OIDC)** via GitHub Actions | **Required for CI** |
| npm granular access tokens (`rightflow-publish-*` etc.) | **Forbidden for CI** — expire ≤90 days; do **not** renew when npm emails expiry |
| GitHub secret `NPM_TOKEN` | **Must stay deleted** — publish scripts fail if it is set |

If npm emails “granular access token(s) have expired”: **delete them in the npm UI and ignore**. Do not generate equivalents for CI.

Local emergency publish uses `npm login` (browser + 2FA), not a long-lived token.

## Preferred path (OIDC — no local 2FA)

1. Bump `version` in `products/rightos/sdk/<package>/package.json` (and lockfile if needed).
2. Sync to GitHub:
   ```bash
   cd products/rightos
   ./scripts/sync-rightos-sdk.sh --push rightflow rightflow-mcp
   # or: ./scripts/sync-rightos-sdk.sh --push all
   ```
3. Publish via Trusted Publishing:
   ```bash
   gh workflow run rightflow-publish -R suomimasuda/rightos-sdk
   gh workflow run rightflow-mcp-publish -R suomimasuda/rightos-sdk
   # tags also work: rightflow-v0.1.2 / rightflow-mcp-v0.1.3
   ```
4. Confirm alignment:
   ```bash
   ./scripts/check-sdk-version-sync.sh
   ```

Shared OIDC helper (CI): `scripts/oidc-npm-publish.sh` — refuses `NPM_TOKEN`, strips empty `_authToken`, dry-run or publish with provenance.

## Emergency local publish

```bash
cd products/rightos
./scripts/publish-rightflow-sdk.sh
```

This script **must** (and does) after `npm publish`:

1. `./scripts/sync-rightos-sdk.sh --push …`
2. `./scripts/check-sdk-version-sync.sh`
3. Dispatch `publish-health`

Do **not** run bare `npm publish` in a package directory.

## Auth preflight

```bash
./scripts/preflight.sh npm     # before local publish
./scripts/preflight.sh gcloud  # before Cloud Run deploy
```

## Packages

| npm | Repo path | Publish workflow |
| --- | --- | --- |
| `@i-s3/rightos` | `typescript/` | `sdk-publish.yml` |
| `@i-s3/rightos-mcp` | `mcp/` | `mcp-registry-publish.yml` |
| `@i-s3/rightflow` | `rightflow/` | `rightflow-publish.yml` |
| `@i-s3/rightflow-mcp` | `rightflow-mcp/` | `rightflow-mcp-publish.yml` |

Weekly monitor: `publish-health.yml` (version match + OIDC dry-run for all four packages).

See also: `scripts/setup-trusted-publishing.sh`
