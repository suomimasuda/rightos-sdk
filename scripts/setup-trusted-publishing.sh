#!/usr/bin/env bash
# One-time setup guide for passwordless CI publishing (OIDC).
# Run: ./scripts/setup-trusted-publishing.sh
set -euo pipefail

cat <<'EOF'
=== RightOS SDK — Trusted Publishing（期限切れなし・恒久） ===

■ 方針（これが恒久対策）

- CI は npm Trusted Publishing（OIDC）のみ。
- Granular Access Token は CI に使わない・期限切れメールが来ても再発行しない。
- GitHub Secret NPM_TOKEN は置かない（置くと oidc-npm-publish.sh が失敗する）。
- 期限切れ通知は「削除して終わり」。同等トークンの生成は禁止。

Granular Access Token は最長 90 日で失効します。
Trusted Publishing なら GitHub Actions が短命 OIDC で publish し、トークン更新は不要です。

■ npm（各パッケージで1回・Trusted Publisher）

※ 公開ページ https://www.npmjs.com/package/@i-s3/... からは
  Settings に入れません。404 になります。必ず下の経路で。

1. ログイン後、右上アイコン → 「Packages」
   または直接: https://www.npmjs.com/settings/i-s3/packages
   （組織 i-s3 のパッケージ一覧）

2. 一覧から @i-s3/rightos をクリック
   → 「Settings」→「Trusted publishing」→「GitHub Actions」

   入力値:
   - Repository owner: suomimasuda
   - Repository name: rightos-sdk
   - Workflow filename: sdk-publish.yml
   - Environment: （空欄）
   - Allowed actions: npm publish ✅

3. 同様に @i-s3/rightos-mcp → mcp-registry-publish.yml
4. 同様に @i-s3/rightflow → rightflow-publish.yml
5. 同様に @i-s3/rightflow-mcp → rightflow-mcp-publish.yml

6. 動作確認（実 publish せず OIDC 疎通）:
   gh workflow run sdk-publish -R suomimasuda/rightos-sdk
   gh workflow run rightflow-publish -R suomimasuda/rightos-sdk
   gh workflow run rightflow-mcp-publish -R suomimasuda/rightos-sdk
   gh workflow run mcp-registry-publish -R suomimasuda/rightos-sdk
   gh workflow run publish-health -R suomimasuda/rightos-sdk
   # 週次 publish-health も全パッケージの OIDC dry-run を実行

7. npm の Tokens 画面で古い granular token があれば削除:
   https://www.npmjs.com/settings/suomimasuda/tokens

■ PyPI（1回・Web のみ）

1. https://pypi.org/manage/project/rightos-sdk/settings/publishing/
2. GitHub publisher: suomimasuda / rightos-sdk / python-publish.yml

■ 監視

- publish-health: 毎週月曜 09:00 JST（バージョン一致 + OIDC probe + Registry + 本番）
- 失敗時: GitHub → suomimasuda/rightos-sdk → Watch → Custom → Actions ✅

詳細: PUBLISH.md / DR-2026-07-21-npm-oidc-only.md

EOF
