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

※ 公開ページ https://www.npmjs.com/package/@i-s3/... からは
  Settings に入れません。404 になります。必ず下の経路で。

1. ログイン後、右上アイコン → 「Packages」
   または直接: https://www.npmjs.com/settings/i-s3/packages
   （組織 i-s3 のパッケージ一覧）

2. 一覧から @i-s3/rightos をクリック
   → 左またはタブの「Settings」
   → 「Trusted publishing」セクション
   → 「GitHub Actions」を選択

   入力値:
   - Repository owner: suomimasuda
   - Repository name: rightos-sdk
   - Workflow filename: sdk-publish.yml
   - Environment: （空欄）
   - Allowed actions: npm publish ✅

3. 同様に @i-s3/rightos-mcp
   - Workflow filename: mcp-registry-publish.yml

4. 同様に @i-s3/rightflow
   - Workflow filename: rightflow-publish.yml

5. 同様に @i-s3/rightflow-mcp
   - Workflow filename: rightflow-mcp-publish.yml

6. 動作確認:
   gh workflow run sdk-publish -R suomimasuda/rightos-sdk
   gh workflow run rightflow-publish -R suomimasuda/rightos-sdk
   gh workflow run rightflow-mcp-publish -R suomimasuda/rightos-sdk
   # ログに "falling back to NPM_TOKEN" が無ければ OIDC 成功
   # 成功後 GitHub Secret NPM_TOKEN は削除可

■ CLI 一括設定（npm CLI 11.5.1+ で npm trust が使える場合）

npm login   # ブラウザ認証（2FA 後「5分間 2FA スキップ」を ON 推奨）

npm trust github @i-s3/rightos \
  --repo suomimasuda/rightos-sdk \
  --file sdk-publish.yml \
  --allow-publish --yes

npm trust github @i-s3/rightos-mcp \
  --repo suomimasuda/rightos-sdk \
  --file mcp-registry-publish.yml \
  --allow-publish --yes

npm trust github @i-s3/rightflow \
  --repo suomimasuda/rightos-sdk \
  --file rightflow-publish.yml \
  --allow-publish --yes

npm trust github @i-s3/rightflow-mcp \
  --repo suomimasuda/rightos-sdk \
  --file rightflow-mcp-publish.yml \
  --allow-publish --yes

■ PyPI（1回・Web のみ、API なし）

1. https://pypi.org/manage/project/rightos-sdk/settings/publishing/
   （※ /publishing/ 末尾。Manage → Publishing タブと同じ）

2. 「Add a new pending publisher」→ GitHub
   - Owner: suomimasuda
   - Repository name: rightos-sdk
   - Workflow name: python-publish.yml
   - Environment: （空欄）

3. リリース:
   git tag python-v0.4.4 && git push origin python-v0.4.4

■ 自動監視（設定済み）

- publish-health: 毎週月曜 09:00 JST（npm/PyPI/Registry/本番）
- 失敗時: GitHub → suomimasuda/rightos-sdk → Watch → Custom → Actions ✅

EOF
