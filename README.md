# 競馬予想比較

JRAの重賞レースについて、AI予想サイト・専門ブログ・YouTube／note・芸能人企画まで、複数の予想元の◎○▲（本命・対抗・穴）と、公開されていた根拠・見解を横断比較するサイト。

**公開サイト:** https://haruikntv.github.io/keiba-yosou-hikaku/

## これは何か

[全レース競馬予想](https://deep-yosou-shimbun-haruikintv.vercel.app/)が「自分たちの予想」を出すサイトなのに対し、こちらは**世の中にある予想を集めて並べる**サイト。1レースにつき、複数の予想元がそれぞれ何を◎にして、なぜそう判断したのか、結果どうだったかを1ページにまとめる。

## Repo layout

- `manifest.json` — `history`（比較ページを作成済みのレース: name, grade, venue, date, folder, description）と `upcoming`（今後開催予定のレース: name, grade, venue, date。比較ページはまだ無い）。
- `apps/<date>-<race-slug>/` — レースごとの比較ページ（プレーンなHTML/CSS/JS、ビルド不要）。予想元ごとの◎○▲・根拠・的中結果と、◎の集計チャートを掲載。
- `assets/og-image.svg` — サイト共通のOGP/Twitter Card画像。
- `scripts/generate-index.js` — `site/index.html`（レースカレンダー：公開済みの比較ページ一覧＋今後の開催予定）、`site/sitemap.xml`、`site/llms.txt`を`manifest.json`から自動生成。CIで毎回実行される。
- `.github/workflows/deploy-pages.yml` — `apps/*/index.html`をそのままコピーしてGitHub Pagesにデプロイ。

## 新しいレースの比較ページを追加する手順

1. 対象レースの結果と、各予想元（AI予想サイト・専門ブログ・note・YouTube・芸能人企画など）が公開していた◎○▲・根拠をWeb検索で調査する。
2. `apps/<YYYY-MM-DD>-<race-slug>/index.html` を既存ページ（例: `apps/2026-08-30-niigata-kinen/`）をベースに作成する。予想元ごとの根拠は、確認できたものだけ引用・要約して掲載し、確認できないものは「根拠・見解の詳細記事は確認できず」と正直に書く（存在しない理由を捏造しない）。
3. `manifest.json`の`history`に新しいエントリを追加し、`upcoming`から該当レースを削除する。
4. コミット・pushすると、GitHub Actionsが自動でサイトを再ビルド・GitHub Pagesに公開する。

## 広告の設置について

一覧ページ（`generate-index.js`が生成、ヘッダー直下とフッター上の728×90）と、各比較ページ（ヘッダー直下728×90、集計チャートと印一覧の間300×250、フッター上728×90）の両方に空の広告枠（`.ad-slot`）を用意している。

このリポジトリと[HARUIKNTVの他プロジェクト](https://github.com/HARUIKNTV/haruikntv.github.io)は同じGoogle AdSenseアカウント（`ca-pub-7523687500134096`、`haruikntv.github.io`ドメインで`ads.txt`により認証済み）を使う想定で、各ページの`<head>`にはすでにAdSenseのスクリプトタグを設置済み。実際の広告ユニットを表示するには、`.ad-slot`のプレースホルダーを本物の`<ins class="adsbygoogle">`タグに置き換える（`scripts/generate-index.js`の`adSlot()`関数、および各比較ページの同等コメント箇所）。

## 免責事項

各ページは公開されている予想記事・動画・SNS投稿をもとにした比較・要約であり、当サイト自身が予想を作成・保証するものではない。的中率・回収率を保証するものでもない。有料予想サービスへの申込みは、事業者情報や口コミを確認したうえで自己責任で判断すること。

## Notes for whoever (or whatever) picks this up later

- 引用元の見解・根拠は、実際にWeb検索・記事で確認できた内容のみ書く。確認できない場合に「もっともらしい理由」を創作しないこと。
- 印（◎○▲穴）の定義は媒体ごとに異なる（「軸2頭」「本命2強」等の独自形式を含む）。無理に統一しようとせず、便宜上◎欄にまとめた場合はその旨をページ内に明記する。
- 1レースにつき1比較ページ。小さく、実際に読めるものを優先する。

## One-time manual setup (do this once, then it's fully automatic)

1. このリポジトリの**Settings → Pages**で、**Source**を**GitHub Actions**に設定する（APIやCLIではできず、手動クリックが一度だけ必要）。
2. それ以外は不要 — シークレットや外部アカウントは不要。
