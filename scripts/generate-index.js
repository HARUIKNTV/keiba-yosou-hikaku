const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "..", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const history = manifest.history || [];
const upcoming = manifest.upcoming || [];

const SITE_NAME = "競馬予想比較";
const SITE_URL = "https://haruikntv.github.io/keiba-yosou-hikaku/";

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function dateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${y}年${m}月${d}日(${days[dow]})`;
}

// ---- ad slot markup (empty placeholders — wire up a real network later, see README) ----
function adSlot(sizeLabel, extraClass) {
  return `
      <div class="ad-slot ${extraClass || ""}">
        <div class="ad-slot-inner">
          <span class="ad-slot-label">広告スペース</span>
          <span class="ad-slot-size">${sizeLabel}</span>
        </div>
        <!-- AdSense/other ad network snippet goes here. See README.md "広告の設置について". -->
      </div>`;
}

const sortedHistory = history.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
const sortedUpcoming = upcoming.slice().sort((a, b) => (a.date < b.date ? -1 : 1));

const description = history.length
  ? `JRAの重賞レースについて、AI予想・専門紙・YouTube・note・芸能人企画まで複数の予想元の◎○▲と根拠を横断比較するサイト。現在${history.length}レース分を公開中。`
  : "JRAの重賞レースについて、複数の予想サイト・予想家の◎○▲と根拠を横断比較していくサイトです。";

const doneRowsHtml = sortedHistory.length
  ? sortedHistory
      .map((r) => {
        const folderName = path.basename(r.folder || "");
        return `<a class="race-row" href="./${folderName}/">
        <span class="grade-badge ${(r.grade || "").toLowerCase()}">${escapeHtml(r.grade)}</span>
        <span class="race-name">${escapeHtml(r.name)}<span class="venue">${escapeHtml(r.venue)}</span></span>
        <span class="race-date">${dateLabel(r.date)}</span>
        <span class="status-pill done">比較ページを見る →</span>
      </a>`;
      })
      .join("\n")
  : `<p class="empty-note">まだ公開されている比較ページはありません。近日公開予定です。</p>`;

const upcomingRowsHtml = sortedUpcoming
  .map(
    (r) => `<div class="race-row soon">
        <span class="grade-badge ${(r.grade || "").toLowerCase()}">${escapeHtml(r.grade)}</span>
        <span class="race-name">${escapeHtml(r.name)}<span class="venue">${escapeHtml(r.venue)}</span></span>
        <span class="race-date">${dateLabel(r.date)}</span>
        <span class="status-pill soon">開催後に追加予定</span>
      </div>`
  )
  .join("\n");

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7523687500134096" crossorigin="anonymous"></script>
<title>${SITE_NAME}｜予想比較レースカレンダー</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${SITE_URL}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${SITE_NAME}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${SITE_URL}" />
<meta property="og:image" content="${SITE_URL}og-image.svg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${SITE_NAME}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${SITE_URL}og-image.svg" />
<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: SITE_NAME,
    description,
    url: SITE_URL,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: sortedHistory.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Article",
          name: `${r.name}${r.year || ""} 全予想比較`,
          description: r.description || "",
          url: SITE_URL + path.basename(r.folder || "") + "/",
        },
      })),
    },
  },
  null,
  2
)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700;900&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#F1F3EA; --paper:#FBFAF3; --ink:#171D18; --muted:#5B6660;
    --rule:#CBD1C2; --rule-strong:#9AA593; --accent:#1F4D3A; --accent-soft:#E4EBE1;
    --gold:#A9791F;
    --done-bg:#DCE9E2; --done-ink:#1F4D3A;
    --soon-bg:#EFE3D2; --soon-ink:#6B4A1E;
    --g1-bg:#F3DCDC; --g1-ink:#8A2E2E;
    --g2-bg:#DCE3EC; --g2-ink:#2E4A6B;
    --g3-bg:#D8ECEA; --g3-ink:#1E6B62;
    --focus:#1F4D3A;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#12160F; --paper:#181D15; --ink:#E9EAE0; --muted:#9CA69A;
      --rule:#333B2E; --rule-strong:#48533F; --accent:#5FBA92; --accent-soft:#1E2A20;
      --gold:#E0B85A;
      --done-bg:#1C2B22; --done-ink:#7FD0A6;
      --soon-bg:#2B2416; --soon-ink:#D8B57C;
      --g1-bg:#2C1818; --g1-ink:#E19A9A;
      --g2-bg:#1C2530; --g2-ink:#8FB0DA;
      --g3-bg:#132824; --g3-ink:#6FCFC2;
      --focus:#8FD6B4;
    }
  }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:"Noto Sans JP","Hiragino Sans",sans-serif; line-height:1.7; }
  a{ color:inherit; }
  .wrap{ max-width:900px; margin:0 auto; padding:0 20px 70px; }

  .ad-slot{
    display:flex; align-items:center; justify-content:center;
    background:repeating-linear-gradient(45deg, var(--accent-soft), var(--accent-soft) 10px, var(--paper) 10px, var(--paper) 20px);
    border:2px dashed var(--rule-strong); border-radius:8px; color:var(--muted);
    margin:18px auto; max-width:900px;
  }
  .ad-slot-inner{ text-align:center; }
  .ad-slot-label{ display:block; font-size:12px; letter-spacing:.1em; }
  .ad-slot-size{ display:block; font-size:10.5px; opacity:.75; }
  .ad-banner{ max-width:728px; height:90px; }

  header.masthead{ max-width:900px; margin:0 auto; padding:20px 20px 0; }
  .kicker{
    font-family:"JetBrains Mono",monospace; font-size:11px; letter-spacing:.1em;
    color:var(--muted); text-transform:uppercase;
    border-bottom:1px solid var(--rule); padding-bottom:10px; display:flex; justify-content:space-between;
  }
  h1.title{
    font-family:"Noto Serif JP",serif; font-weight:900; font-size:clamp(28px,5vw,46px);
    text-align:center; margin:20px 0 4px; text-wrap:balance;
  }
  p.subtitle{ text-align:center; color:var(--muted); font-size:14.5px; margin:0 0 22px; }
  .rule-3{
    height:5px; margin:0 0 30px;
    background:
      linear-gradient(var(--ink),var(--ink)) top/100% 1px no-repeat,
      linear-gradient(var(--ink),var(--ink)) bottom/100% 1px no-repeat;
  }
  section{ margin-bottom:38px; }
  .sec-head{
    display:flex; align-items:baseline; gap:10px; justify-content:space-between;
    border-bottom:2px solid var(--ink); padding-bottom:6px; margin-bottom:16px;
  }
  .sec-head h2{ font-family:"Noto Serif JP",serif; font-size:19px; margin:0; }
  .sec-head span{ font-family:"JetBrains Mono",monospace; font-size:11.5px; color:var(--muted); }
  .sec-note{ font-size:12.5px; color:var(--muted); margin:-8px 0 14px; }
  .race-list{ display:flex; flex-direction:column; gap:10px; }
  .empty-note{ font-size:13px; color:var(--muted); }

  a.race-row, .race-row.soon{
    display:grid; grid-template-columns:auto 1fr auto auto; gap:12px 14px; align-items:center;
    background:var(--paper); border:1px solid var(--rule); border-radius:6px;
    padding:13px 16px; text-decoration:none; color:inherit;
  }
  a.race-row:hover{ border-color:var(--accent); }
  .race-row.soon{ border-style:dashed; border-color:var(--rule-strong); opacity:.85; }

  .grade-badge{
    font-family:"JetBrains Mono",monospace; font-weight:700; font-size:12px;
    padding:3px 9px; border-radius:4px; white-space:nowrap;
  }
  .grade-badge.g1{ background:var(--g1-bg); color:var(--g1-ink); }
  .grade-badge.g2{ background:var(--g2-bg); color:var(--g2-ink); }
  .grade-badge.g3{ background:var(--g3-bg); color:var(--g3-ink); }

  .race-name{ font-weight:700; font-size:14.5px; }
  .race-name .venue{ font-weight:400; font-size:12px; color:var(--muted); margin-left:6px; }
  .race-date{ font-family:"JetBrains Mono",monospace; font-size:12.5px; color:var(--muted); white-space:nowrap; font-variant-numeric: tabular-nums; }
  .status-pill{ font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px; white-space:nowrap; }
  .status-pill.done{ background:var(--done-bg); color:var(--done-ink); }
  .status-pill.soon{ background:var(--soon-bg); color:var(--soon-ink); }

  footer{ max-width:900px; margin:46px auto 0; padding:20px 20px 0; border-top:1px solid var(--rule); color:var(--muted); font-size:12px; }
  footer p{ margin:0 0 8px; }
  footer a{ color:var(--accent); }

  @media (max-width:560px){
    a.race-row, .race-row.soon{
      grid-template-columns:1fr auto; grid-template-areas:"grade date" "name name" "status status";
    }
    .grade-badge{ grid-area:grade; justify-self:start; }
    .race-date{ grid-area:date; justify-self:end; }
    .race-name{ grid-area:name; }
    .status-pill{ grid-area:status; justify-self:start; margin-top:2px; }
  }
</style>
</head>
<body>

${adSlot("728 x 90", "ad-banner")}

<header class="masthead">
  <div class="kicker">
    <span>KEIBA YOSOU HIKAKU</span>
    <span>公開中 ${history.length}レース</span>
  </div>
  <h1 class="title">${SITE_NAME}</h1>
  <p class="subtitle">レース名をクリックすると、そのレースの全予想元比較ページへ移動します</p>
  <div class="rule-3"></div>

  <section>
    <div class="sec-head"><h2>公開済みの比較ページ</h2><span>${history.length}件</span></div>
    <div class="race-list">${doneRowsHtml}</div>
  </section>

  <section>
    <div class="sec-head"><h2>今後開催予定のレース</h2><span>JRA G1・G2・G3（主要な重賞）</span></div>
    <p class="sec-note">開催後、順次このカレンダーから各レースの比較ページを追加していきます。日付は公開情報をもとにしていますが、変更される場合はJRA公式サイトでご確認ください。</p>
    <div class="race-list">${upcomingRowsHtml}</div>
  </section>
</header>

${adSlot("728 x 90", "ad-banner")}

<div class="wrap">
  <footer>
    <p>「公開済みの比較ページ」は実際に予想比較を作成したレースのみ掲載しています。「今後開催予定」は開催前のレースで、比較ページはまだ存在しません。</p>
    <p><a href="https://github.com/HARUIKNTV/keiba-yosou-hikaku">GitHubリポジトリ</a> ｜ <a href="https://haruikntv.github.io/">HARUIKNTV トップ</a></p>
  </footer>
</div>
</body>
</html>
`;

const siteDir = path.join(__dirname, "..", "site");
fs.mkdirSync(siteDir, { recursive: true });
fs.writeFileSync(path.join(siteDir, "index.html"), html);

// ---- sitemap.xml ----
const urls = [SITE_URL, ...sortedHistory.map((r) => SITE_URL + path.basename(r.folder || "") + "/")];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(siteDir, "sitemap.xml"), sitemap);

// ---- llms.txt ----
const llmsTxt = `# ${SITE_NAME}

> ${description}

## 公開済みの比較ページ
${sortedHistory.length
  ? sortedHistory
      .map((r) => `- [${r.name} 全予想比較](${SITE_URL}${path.basename(r.folder || "")}/): ${r.description || ""} (グレード: ${r.grade}, 開催日: ${r.date})`)
      .join("\n")
  : "- (まだ公開されている比較ページはありません。)"}

## 今後開催予定のレース
${sortedUpcoming.map((r) => `- ${r.name} (${r.grade}, ${r.venue}, ${r.date})`).join("\n")}
`;
fs.writeFileSync(path.join(siteDir, "llms.txt"), llmsTxt);

// ---- static OG image asset ----
fs.copyFileSync(path.join(__dirname, "..", "assets", "og-image.svg"), path.join(siteDir, "og-image.svg"));

console.log(`Generated index.html, sitemap.xml, llms.txt with ${history.length} published race(s), ${upcoming.length} upcoming.`);
