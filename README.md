# 競馬分析

JRAの重賞レースについて、**終わったレースの結果**と、AI予想サイト・専門ブログ・YouTube／note・芸能人企画などが**事前に公開していた◎○▲（本命・対抗・穴）と根拠**を並べて検証するアーカイブサイト。これから行われるレースの予想を出すサイトではない。

**公開サイト:** https://haruikntv.github.io/keiba-yosou-hikaku/

## これは何か

[全レース競馬予想](https://deep-yosou-shimbun-haruikintv.vercel.app/)が「自分たちの予想」を出すサイトなのに対し、こちらは**世の中にあった予想を集めて、結果と照らし合わせる**サイト。未来のレースの予想・開催予定は掲載しない（「予想サイト」ではなく「検証アーカイブ」という位置づけ）。

トップページはレースごとに1行の要約（グレード・レース名・日付・上位3頭・予想元数）だけを並べたリンク一覧で、クリックすると根拠まで含めた全文がそのレース専用の別ページに開く（同じページ内でアコーディオン展開はしない — 一覧はスクロールを増やさず短く保ち、詳細は行き先のページでじっくり読む設計）。トップページには加えて、予想元ごとの◎的中率／印内率（◎○▲のいずれかが3着以内）をレース横断で集計した成績ランキング表も載る。

## Repo layout

- `manifest.json` — 公開する順番を決める`races`配列（各レースのフォルダパスのみ）。データの実体は持たない。
- `apps/<date>-<race-slug>/data.json` — レースごとのデータ（レース情報・結果・総括・予想元ごとの◎○▲と根拠）。**これが唯一のデータソース**で、HTMLは持たない。各`sources[]`要素の`id`は、同じ予想元が複数レースにまたがって出てくるときに成績ランキングで名寄せするためのキー（`name`は記事タイトルの都合で表記が揺れることがあるが、`id`は固定する）。
- `assets/og-image.svg` — サイト共通のOGP/Twitter Card画像。
- `scripts/generate-index.js` — `manifest.json`と各`data.json`から、`site/index.html`（レース一覧＋成績ランキング）、`site/<race-slug>/index.html`（レースごとの詳細ページ、JSON-LD構造化データ・パンくず付き）、`site/sitemap.xml`（lastmod付き）、`site/robots.txt`（検索クローラー＋AI回答クローラーを許可）、`site/llms.txt`を丸ごと自動生成する。HTMLのテンプレートはこのファイル1つに集約されている。CIで毎回実行される。
- `.github/workflows/deploy-pages.yml` — `node scripts/generate-index.js`を実行して`site/`をGitHub Pagesにデプロイするだけ。

## 集計の仕組み

- **予想印の集計（レースごと）**: そのレースの◎○▲を「◎3点・○2点・▲穴1点」で採点し、馬ごとの合計点でランキング表示する（`tallyHorses()`）。◎だけでなく○▲まで含めた「本命から穴まで全部」の評価を1本の指標にするための重み付け。馬番（`num`）が特定できない印（複数頭をまとめて書いた「③⑧⑪」のような文字列）は集計から除外される。
- **予想元別 成績ランキング（トップページ）**: `sources[].id`が同じ予想元をレース横断で集計し（`computeSourceStats()`）、◎的中率（◎の馬が1着になった割合）と印内率（◎○▲のいずれかが3着以内に入った割合）を算出、◎的中率の高い順に並べる。レース数が少ないうちは参考程度の数字になる旨をページ本文にも明記している。

## 新しいレースの検証ページを追加する手順

1. 対象レースの結果と、各予想元（AI予想サイト・専門ブログ・note・YouTube・芸能人企画など）が公開していた◎○▲・根拠をWeb検索で調査する。
2. `apps/<YYYY-MM-DD>-<race-slug>/data.json` を既存ファイル（例: `apps/2026-08-30-niigata-kinen/data.json`）と同じ形式で作成する。予想元ごとの根拠は、確認できたものだけ引用・要約して`reason`に入れ、確認できないものは空文字のままにする（表示側が自動で「根拠・見解の詳細記事は確認できず」と正直に出す。存在しない理由を捏造しない）。過去のレースに既出の予想元（うましる、鉄矢の競馬予想など）は`id`を必ず既存のものと揃える。新規の予想元には新しい`id`を振る（英数字とハイフンのみ、例: `umanchu-asagoe`）。
3. `manifest.json`の`races`配列に新しいフォルダパスを追加する（並び順は`generate-index.js`が日付降順に並べ替えるので気にしなくてよい）。
4. コミット・pushすると、GitHub Actionsが`generate-index.js`を実行してサイト全体（一覧・成績ランキング・新しいレースの単独ページ）を再ビルド・GitHub Pagesに公開する。

## 広告の設置について

このリポジトリと[HARUIKNTVの他プロジェクト](https://github.com/HARUIKNTV/haruikntv.github.io)は同じGoogle AdSenseアカウント（`ca-pub-7523687500134096`、`haruikntv.github.io`ドメインで`ads.txt`により認証済み）を使う。全ページの`<head>`にAdSenseのローダースクリプトと、Auto ads（`enable_page_level_ads: true`）を有効化するスニペットを設置済み（`scripts/generate-index.js`の`ADSENSE_TAG`）。Auto adsは記事内・記事間・アンカー広告などをGoogle側が自動でページに挿入する方式で、手動の広告ユニット（`data-ad-slot`）を個別に用意する必要がない。

**残っている手動設定（AdSense管理画面で1回だけ）:** 「広告」→「サイト別」で`haruikntv.github.io`のAuto adsがONになっていることを確認する（未確認・未承認の場合は広告が表示されない）。特定の位置に固定の広告ユニットを追加したい場合は、AdSense管理画面で広告ユニットを作成して得られる`data-ad-slot`値を使い、`scripts/generate-index.js`のテンプレート内に`<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-7523687500134096" data-ad-slot="（取得したslot ID）" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>`を追加する。

## 免責事項

各ページは公開されている予想記事・動画・SNS投稿をもとにした比較・要約であり、当サイト自身が予想を作成・保証するものではない。的中率・回収率を保証するものでもない。有料予想サービスへの申込みは、事業者情報や口コミを確認したうえで自己責任で判断すること。

## Notes for whoever (or whatever) picks this up later

- 引用元の見解・根拠は、実際にWeb検索・記事で確認できた内容のみ書く。確認できない場合に「もっともらしい理由」を創作しないこと。
- 印（◎○▲穴）の定義は媒体ごとに異なる（「軸2頭」「本命2強」等の独自形式を含む）。無理に統一しようとせず、便宜上◎欄にまとめた場合はその旨をページ内に明記する。
- 1レースにつき1比較ページ。小さく、実際に読めるものを優先する。

## One-time manual setup (do this once, then it's fully automatic)

1. このリポジトリの**Settings → Pages**で、**Source**を**GitHub Actions**に設定する（APIやCLIではできず、手動クリックが一度だけ必要）。
2. それ以外は不要 — シークレットや外部アカウントは不要。
