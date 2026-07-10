#!/usr/bin/env bash
# One-time setup guide for passwordless CI publishing (OIDC).
# Run: ./scripts/setup-trusted-publishing.sh
set -euo pipefail

cat <<'EOF'
=== RightOS SDK — Trusted Publishing セットアップ（期限切れなし） ===

Granular Access Token は最長 90 日で失効します。
代わりに npm / PyPI の「Trusted Publishing」を使うと、
GitHub Actions が短命 OIDC 認証で publish し、トークン更新は不要です。

■ npm（各パッケージで1回）

1. https://www.npmjs.com/package/@i-s3/rightos
   → Package settings → Trusted Publisher → GitHub Actions
   - GitHub organization or user: suomimasuda
   - Repository: rightos-sdk
   - Workflow filename: sdk-publish.yml
   - Environment name: （空欄）

2. 同様に https://www.npmjs.com/package/@i-s3/rightos-mcp
   - Workflow filename: mcp-registry-publish.yml

3. 動作確認:
   gh workflow run sdk-publish -R suomimasuda/rightos-sdk
   # OIDC 成功後、GitHub Secret の NPM_TOKEN は削除可能

■ PyPI（1回）

1. https://pypi.org/manage/project/rightos-sdk/publishing/
   → Add a new pending publisher → GitHub
   - PyPI project: rightos-sdk
   - Owner: suomimasuda
   - Repository: rightos-sdk
   - Workflow: python-publish.yml
   - Environment: （空欄）

2. リリース:
   git tag python-v0.4.4 && git push origin python-v0.4.4

■ 自動監視（設定済み）

- publish-health ワークフロー: 毎週月曜 09:00 JST
  - npm 版と repo 版のズレ検知
  - NPM_TOKEN 有効性（移行期間のみ）
  - MCP Registry / 本番 status API
  - 失敗時 GitHub がメール通知（Watch → Custom → Actions）

■ GitHub 通知を有効にする

https://github.com/suomimasuda/rightos-sdk
→ Watch → Custom → ✅ Actions

EOF
