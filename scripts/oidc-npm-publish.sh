#!/usr/bin/env bash
# OIDC-only npm publish helper for GitHub Actions (Trusted Publishing).
# Never uses NPM_TOKEN / granular access tokens (those expire every ≤90 days).
#
# Usage (from package directory):
#   ../../scripts/oidc-npm-publish.sh dry-run
#   ../../scripts/oidc-npm-publish.sh publish
set -euo pipefail

MODE="${1:?usage: oidc-npm-publish.sh dry-run|publish}"

if [[ -n "${NPM_TOKEN:-}" ]]; then
  echo "::error::NPM_TOKEN is set. Remove GitHub secret NPM_TOKEN and use npm Trusted Publishing (OIDC) only. Granular tokens expire and must not be renewed for CI."
  exit 1
fi

# Prefer a known-good npm for Trusted Publishing (OIDC).
if command -v npm >/dev/null 2>&1; then
  npm install -g npm@11.6.2 >/dev/null 2>&1 || true
fi
echo "npm $(npm --version)"

if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]]; then
  echo "::error::ACTIONS_ID_TOKEN_REQUEST_URL missing — workflow needs permissions.id-token: write"
  exit 1
fi
echo "ACTIONS_ID_TOKEN_REQUEST_URL=set"

# setup-node may write _authToken=${NODE_AUTH_TOKEN}; empty token blocks OIDC.
# Keep registry, strip only auth lines (npm/documentation#1960).
if [[ -n "${NPM_CONFIG_USERCONFIG:-}" && -f "$NPM_CONFIG_USERCONFIG" ]]; then
  sed -i '/_authToken/d' "$NPM_CONFIG_USERCONFIG" || true
  sed -i '/always-auth/d' "$NPM_CONFIG_USERCONFIG" || true
fi
unset NODE_AUTH_TOKEN || true
npm config set registry https://registry.npmjs.org/

case "$MODE" in
  dry-run)
    set +e
    out=$(npm publish --dry-run --access public 2>&1)
    code=$?
    set -e
    echo "$out"
    if [[ "$code" -eq 0 ]]; then
      echo "OIDC dry-run OK — Trusted Publisher is configured"
      exit 0
    fi
    if echo "$out" | grep -q "cannot publish over the previously published versions"; then
      echo "OIDC OK — auth verified (version already on npm registry)"
      exit 0
    fi
    if echo "$out" | grep -qiE 'ENEEDAUTH|401 Unauthorized|403 Forbidden|404 Not Found - PUT'; then
      echo "::error::OIDC/auth failed — configure Trusted Publisher on npm (not a granular token). See sdk/PUBLISH.md / scripts/setup-trusted-publishing.sh"
      exit 1
    fi
    exit "$code"
    ;;
  publish)
    npm publish --access public --provenance
    echo "Published via OIDC Trusted Publishing"
    ;;
  *)
    echo "usage: oidc-npm-publish.sh dry-run|publish" >&2
    exit 2
    ;;
esac
