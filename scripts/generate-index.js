const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

const SITE_NAME = "競馬分析";
const SITE_URL = "https://haruikntv.github.io/keiba-yosou-hikaku/";
const ADSENSE_CLIENT = "ca-pub-7523687500134096";
const ADSENSE_TAG = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<script>(adsbygoogle = window.adsbygoogle || []).push({google_ad_client: "${ADSENSE_CLIENT}", enable_page_level_ads: true});</script>`;
const BUILD_DATE = new Date().toISOString().slice(0, 10);

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function dateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${y}年${m}月${d}日(${days[dow]})`;
}

// ---- load every race's data.json ----
const races = manifest.races.map((folder) => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, folder, "data.json"), "utf8"));
  return { folder, data };
});
races.sort((a, b) => (a.data.date < b.data.date ? 1 : -1)); // newest first

// ---- shared render helpers (used for both the index accordion and each standalone page) ----
function fmtHorse(h) {
  return h.num ? `<span class="mark">${h.num}</span> ${escapeHtml(h.name)}` : escapeHtml(h.name);
}
function fmtInline(arr) {
  return !arr || !arr.length ? '<span class="dash">—</span>' : arr.map(fmtHorse).join("　");
}

// Match a mark entry ({num, name}) to a result entry. Uses umaban when known;
// otherwise falls back to matching the horse name (needed for horses whose
// umaban wasn't confirmed in a given source's article).
function matchResult(entry, result) {
  if (!entry) return null;
  const name = entry.name.replace(/（.*?）/, "").trim();
  return result.find((r) => (entry.num ? r.num === entry.num : r.name === name)) || null;
}

function resultPillFor(honmei, result) {
  if (!honmei.length) return '<span class="result-pill miss">対象外</span>';
  const match = matchResult(honmei[0], result);
  if (!match) return '<span class="result-pill miss">着外</span>';
  if (match.rank === 1) return '<span class="result-pill win">1着 ● 的中</span>';
  if (match.rank === 2) return '<span class="result-pill place">2着</span>';
  if (match.rank === 3) return '<span class="result-pill place">3着</span>';
  return '<span class="result-pill miss">着外</span>';
}

function renderPodium(result) {
  const rankLabel = { 1: "1着", 2: "2着", 3: "3着" };
  return `<div class="podium">
    ${result.map((r) => `
      <div class="pod-card${r.rank === 1 ? " first" : ""}">
        <div class="pod-rank">${rankLabel[r.rank] || r.rank + "着"}</div>
        <div class="pod-uma">${r.num ? r.num + " " : ""}${escapeHtml(r.name)}</div>
        <div class="pod-meta">${escapeHtml(r.meta || "")}</div>
      </div>`).join("")}
  </div>`;
}

function renderCallout(summary) {
  return `<div class="callout">
    <h3>結果の総括</h3>
    ${summary.map((p) => `<p>${p}</p>`).join("")}
  </div>`;
}

// Weights used to turn ◎○▲ mentions into one comparable score per horse.
const MARK_POINTS = { honmei: 3, taikou: 2, ana: 1 };

// Aggregate every mark (◎ honmei, ○ taikou, ▲ ana) from every source of a
// race into one per-horse score, so "who got picked, from favorite to
// longshot" is visible in a single ranking rather than only counting ◎.
function tallyHorses(sources) {
  const stats = {};
  ["honmei", "taikou", "ana"].forEach((field) => {
    sources.forEach((s) => {
      (s[field] || []).forEach((h) => {
        if (!h.num) return; // combined multi-horse text entries without a clean umaban are skipped
        if (!stats[h.num]) stats[h.num] = { num: h.num, name: h.name.replace(/（.*?）/, "").trim(), honmei: 0, taikou: 0, ana: 0 };
        stats[h.num][field]++;
      });
    });
  });
  return Object.values(stats)
    .map((h) => ({ ...h, score: h.honmei * MARK_POINTS.honmei + h.taikou * MARK_POINTS.taikou + h.ana * MARK_POINTS.ana }))
    .sort((a, b) => b.score - a.score);
}

function renderTally(data) {
  const horses = tallyHorses(data.sources);
  const winnerNum = data.result[0].num;
  const maxScore = Math.max(...horses.map((h) => h.score));
  const rows = horses
    .map((h) => `<div class="bar-row${h.num === winnerNum ? " winner" : ""}">
        <div class="bar-label">${h.num} ${escapeHtml(h.name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((h.score / maxScore) * 100)}%"></div></div>
        <div class="bar-count">${h.score}<span class="bar-breakdown">◎${h.honmei} ○${h.taikou} ▲${h.ana}</span></div>
      </div>`)
    .join("");
  return `<section class="tally">
    <div class="sec-head"><div class="sec-title"><span class="sec-icon">📊</span><h2>予想印の集計（本命〜穴まで）</h2></div><span>◎3点・○2点・▲穴1点で採点</span></div>
    <div>${rows}</div>
    <p class="tally-note">${escapeHtml(data.tallyNote || "")}</p>
  </section>`;
}

function renderPredCards(data) {
  const cards = data.sources.map((s) => {
    const reasonHtml = s.reason
      ? `<p class="pred-reason">${s.reason}</p>`
      : `<p class="pred-reason empty">根拠・見解の詳細記事は確認できず、印のみが公開されていました。</p>`;
    return `<div class="pred-card">
      <div class="pred-head">
        <div><a class="src-name" href="${s.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a><span class="badge ${s.badge}">${escapeHtml(s.label)}</span></div>
        ${resultPillFor(s.honmei, data.result)}
      </div>
      <div class="pred-marks">
        <span class="mk"><span class="sym">◎</span>${fmtInline(s.honmei)}</span>
        <span class="mk"><span class="sym">○</span>${fmtInline(s.taikou)}</span>
        <span class="mk"><span class="sym">▲穴</span>${fmtInline(s.ana)}</span>
      </div>
      ${reasonHtml}
    </div>`;
  }).join("");
  return `<section class="table-sec">
    <div class="sec-head"><div class="sec-title"><span class="sec-icon">📝</span><h2>予想元別 印・根拠一覧</h2></div><span>◎○▲穴と、公開されていた見解・根拠</span></div>
    <div class="pred-list">${cards}</div>
  </section>`;
}

function renderRaceBody(data) {
  return `
    <div class="race-facts">
      <span class="fact">${data.grade} / ${escapeHtml(data.name)}</span>
      <span class="fact">${dateLabel(data.date)}</span>
      <span class="fact">${escapeHtml(data.venue)}</span>
      ${(data.extraFacts || []).map((f) => `<span class="fact">${escapeHtml(f)}</span>`).join("")}
    </div>
    ${renderPodium(data.result)}
    ${renderCallout(data.summary)}
    ${renderTally(data)}
    ${renderPredCards(data)}
  `;
}

function resultCompactLine(result) {
  const rankLabel = { 1: "1着", 2: "2着", 3: "3着" };
  return result.map((r) => `${rankLabel[r.rank] || r.rank + "着"} ${r.num ? r.num + " " : ""}${escapeHtml(r.name)}`).join("　／　");
}

function renderRaceLinkRow(data, folder) {
  const slug = path.basename(folder);
  const searchKey = escapeHtml(`${data.name}${data.venueShort}${data.grade}`.toLowerCase());
  return `<a class="race-row grade-${data.grade.toLowerCase()}" href="./${slug}/" data-grade="${data.grade}" data-search="${searchKey}">
    <span class="grade-badge ${data.grade.toLowerCase()}">${data.grade}</span>
    <span class="row-name">${escapeHtml(data.name)}<span class="row-venue">${escapeHtml(data.venueShort)}</span></span>
    <span class="row-date">${dateLabel(data.date)}</span>
    <span class="row-result">${resultCompactLine(data.result)}</span>
    <span class="row-count">${data.sourceCountNote}</span>
    <span class="row-arrow">詳細を見る →</span>
  </a>`;
}

// ---- headline numbers for the stats strip ("how much data does this site actually have") ----
function computeSiteStats(races) {
  let markTotal = 0;
  let sourceAppearances = 0;
  races.forEach(({ data }) => {
    sourceAppearances += data.sources.length;
    data.sources.forEach((s) => {
      markTotal += s.honmei.length + s.taikou.length + s.ana.length;
    });
  });
  const uniqueSources = new Set();
  races.forEach(({ data }) => data.sources.forEach((s) => uniqueSources.add(s.id || s.name)));
  return {
    raceCount: races.length,
    uniqueSourceCount: uniqueSources.size,
    sourceAppearances,
    markTotal,
  };
}

function renderStatsStrip(races) {
  const s = computeSiteStats(races);
  const tiles = [
    ["収録レース数", s.raceCount, "件"],
    ["検証した予想元", s.uniqueSourceCount, "種類"],
    ["予想元 × レース", s.sourceAppearances, "件"],
    ["集計した◎○▲", s.markTotal, "個"],
  ];
  return `<div class="stats-strip">
    ${tiles.map(([label, value, unit]) => `<div class="stat-tile"><span class="stat-value">${value.toLocaleString("ja-JP")}<span class="stat-unit">${unit}</span></span><span class="stat-label">${label}</span></div>`).join("")}
  </div>`;
}

// ---- source performance ranking: aggregate every source's ◎ pick across every race it appeared in ----
function computeSourceStats(races) {
  const bySource = {};
  races.forEach(({ data }) => {
    data.sources.forEach((s) => {
      const id = s.id || s.name; // sources without a stable id (shouldn't happen) fall back to name
      if (!bySource[id]) bySource[id] = { id, name: s.name, badge: s.badge, races: 0, wins: 0, places: 0 };
      const entry = bySource[id];
      entry.name = s.name; // keep the most recent display name
      entry.races += 1;
      const honmeiMatch = matchResult(s.honmei[0], data.result);
      if (honmeiMatch && honmeiMatch.rank === 1) entry.wins += 1;
      // "placed" = any of ◎○▲ landed in the top 3 (the "honmei to longshot" view)
      const allMarks = [...s.honmei, ...s.taikou, ...s.ana];
      const anyPlaced = allMarks.some((m) => {
        const match = matchResult(m, data.result);
        return match && match.rank <= 3;
      });
      if (anyPlaced) entry.places += 1;
    });
  });
  return Object.values(bySource)
    .map((s) => ({
      ...s,
      winRate: s.races ? s.wins / s.races : 0,
      placeRate: s.races ? s.places / s.races : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.placeRate - a.placeRate || b.races - a.races || a.name.localeCompare(b.name, "ja"));
}

function renderRankingTable(races) {
  const stats = computeSourceStats(races);
  const rows = stats
    .map((s, i) => `<tr>
      <td class="rk-pos">${i + 1}</td>
      <td class="rk-name">${escapeHtml(s.name)}<span class="badge ${s.badge}">${s.races}戦</span></td>
      <td class="rk-rate">${s.wins}/${s.races}<span class="rk-pct">${Math.round(s.winRate * 100)}%</span></td>
      <td class="rk-rate">${s.places}/${s.races}<span class="rk-pct">${Math.round(s.placeRate * 100)}%</span></td>
    </tr>`)
    .join("");
  return `<section class="ranking">
    <div class="sec-head"><div class="sec-title"><span class="sec-icon">🏆</span><h2>予想元別 成績ランキング</h2></div><span>${races.length}レース分・◎的中率順</span></div>
    <p class="sec-note">◎的中率＝その予想元が◎にした馬が1着になった割合。印内率＝◎○▲のいずれかが3着以内に入った割合（本命〜穴まで含めた成績）。同じ媒体・企画内の予想家は別の予想元として集計しています。まだ${races.length}レース分しかないため、参加数（戦数）が少ない予想元の数字は参考程度にご覧ください。</p>
    <div class="table-scroll">
      <table class="rank-table">
        <thead><tr><th>順位</th><th>予想元</th><th>◎的中率(1着)</th><th>印内率(3着以内)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

// ---- shared CSS (identical for index and standalone race pages) ----
// Visual language: light-gray canvas + white rounded, shadowed cards, bold
// gothic headlines, colorful circular category icons — modeled after
// data-portal sites (search bar + colored category cards + card grids)
// rather than the earlier flat "newspaper" look, per user feedback.
const SHARED_CSS = `
  :root{
    --bg:#F0F0EC; --paper:#FFFFFF; --ink:#171717; --muted:#6E6E6B;
    --rule:#E2E2DE; --rule-strong:#C9C9C3; --accent:#171717; --accent-soft:#ECECE9; --on-accent:#FFFFFF;
    --gold:#B8860B; --gold-soft:#FBF0D9; --silver:#7A8480; --bronze:#9C6B3E;
    --miss:#8C8478; --miss-bg:#EEEEE8; --hit-bg:#FBF0D9; --hit-ink:#8A6206;
    --place-bg:#E6EBF2; --place-ink:#33475B;
    --badge-ai-bg:#E3E4F7; --badge-ai-ink:#4438A8;
    --badge-blog-bg:#EEE3F6; --badge-blog-ink:#7141A8;
    --badge-yt-bg:#FBE1DC; --badge-yt-ink:#C23B1E;
    --badge-ent-bg:#FDEBD2; --badge-ent-ink:#B0700B;
    --badge-cmp-bg:#DFE9FA; --badge-cmp-ink:#2159B0;
    --g1-bg:#FBE1DC; --g1-ink:#C23B1E; --g2-bg:#DFE9FA; --g2-ink:#2159B0; --g3-bg:#F5E3EE; --g3-ink:#8A3A6B; --l-bg:#EAEAE5; --l-ink:#5C5C56;
    --cat-g1:#D14B32; --cat-g1-soft:#FBE4DE; --cat-g2:#2E6FB0; --cat-g2-soft:#E1EBF7; --cat-g3:#9C4C7A; --cat-g3-soft:#F5E3EE; --cat-l:#6B6B63; --cat-all:#171717; --cat-all-soft:#ECECE9;
    --shadow:0 1px 2px rgba(23,23,23,.07), 0 3px 10px rgba(23,23,23,.06);
    --shadow-sm:0 1px 3px rgba(23,23,23,.09);
    --focus:#171717;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#121212; --paper:#1E1E1C; --ink:#F1F1EE; --muted:#A0A09B;
      --rule:#333330; --rule-strong:#48483F; --accent:#F3F3F0; --accent-soft:#282824; --on-accent:#14140F;
      --gold:#E5C05C; --gold-soft:#332A12; --silver:#9AA5A0; --bronze:#C08A54;
      --miss:#7C8378; --miss-bg:#1E221B; --hit-bg:#332A12; --hit-ink:#E5C05C;
      --place-bg:#1B2430; --place-ink:#8FB4E0;
      --badge-ai-bg:#221F3A; --badge-ai-ink:#B8A8F0;
      --badge-blog-bg:#251C33; --badge-blog-ink:#C9A6E8;
      --badge-yt-bg:#301C17; --badge-yt-ink:#EA8F71;
      --badge-ent-bg:#2E2410; --badge-ent-ink:#E5B85C;
      --badge-cmp-bg:#161F30; --badge-cmp-ink:#8FB4EE;
      --g1-bg:#301C17; --g1-ink:#EA8F71; --g2-bg:#161F30; --g2-ink:#8FB4EE; --g3-bg:#301C29; --g3-ink:#E0A0C4;
      --cat-g1:#E37456; --cat-g1-soft:#2E1B15; --cat-g2:#6FA8E8; --cat-g2-soft:#131E2C; --cat-g3:#C06498; --cat-g3-soft:#301C29; --cat-all:#F3F3F0; --cat-all-soft:#282824;
      --shadow:0 1px 2px rgba(0,0,0,.35), 0 3px 12px rgba(0,0,0,.3);
      --shadow-sm:0 1px 3px rgba(0,0,0,.35);
      --focus:#F3F3F0;
    }
  }
  :root[data-theme="dark"]{
    --bg:#121212; --paper:#1E1E1C; --ink:#F1F1EE; --muted:#A0A09B;
    --rule:#333330; --rule-strong:#48483F; --accent:#F3F3F0; --accent-soft:#282824; --on-accent:#14140F;
    --gold:#E5C05C; --gold-soft:#332A12; --silver:#9AA5A0; --bronze:#C08A54;
    --miss:#7C8378; --miss-bg:#1E221B; --hit-bg:#332A12; --hit-ink:#E5C05C;
    --place-bg:#1B2430; --place-ink:#8FB4E0;
    --badge-ai-bg:#221F3A; --badge-ai-ink:#B8A8F0;
    --badge-blog-bg:#251C33; --badge-blog-ink:#C9A6E8;
    --badge-yt-bg:#301C17; --badge-yt-ink:#EA8F71;
    --badge-ent-bg:#2E2410; --badge-ent-ink:#E5B85C;
    --badge-cmp-bg:#161F30; --badge-cmp-ink:#8FB4EE;
    --g1-bg:#301C17; --g1-ink:#EA8F71; --g2-bg:#161F30; --g2-ink:#8FB4EE; --g3-bg:#301C29; --g3-ink:#E0A0C4; --l-bg:#2A2A26; --l-ink:#B8B8B0;
    --cat-g1:#E37456; --cat-g1-soft:#2E1B15; --cat-g2:#6FA8E8; --cat-g2-soft:#131E2C; --cat-g3:#C06498; --cat-g3-soft:#301C29; --cat-l:#9A9A90; --cat-all:#F3F3F0; --cat-all-soft:#282824;
    --shadow:0 1px 2px rgba(0,0,0,.35), 0 3px 12px rgba(0,0,0,.3);
    --shadow-sm:0 1px 3px rgba(0,0,0,.35);
    --focus:#F3F3F0;
  }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:"Noto Sans JP","Hiragino Sans",sans-serif; line-height:1.7; }
  a{ color:inherit; }
  .wrap{ max-width:960px; margin:0 auto; padding:0 20px 70px; }

  header.masthead{ max-width:960px; margin:0 auto; padding:20px 20px 0; }
  .breadcrumb{ font-size:11.5px; color:var(--muted); margin-bottom:6px; }
  .breadcrumb a{ color:var(--muted); text-decoration:underline; }
  .breadcrumb [aria-current]{ color:var(--ink); font-weight:600; }
  .kicker{
    font-family:"JetBrains Mono",monospace; font-size:11px; letter-spacing:.1em;
    color:var(--muted); text-transform:uppercase;
    border-bottom:1px solid var(--rule); padding-bottom:10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:4px;
  }
  .kicker a{ text-decoration:underline; }
  h1.title{
    font-family:"Zen Kaku Gothic New",sans-serif; font-weight:900; font-size:clamp(26px,5vw,44px);
    text-align:center; margin:20px 0 4px; letter-spacing:.01em; text-wrap:balance;
  }
  p.subtitle{ text-align:center; color:var(--muted); font-size:14px; margin:0 0 20px; }
  .rule-3{
    height:5px; margin:0 0 20px;
    background:
      linear-gradient(var(--ink),var(--ink)) top/100% 1px no-repeat,
      linear-gradient(var(--ink),var(--ink)) bottom/100% 1px no-repeat;
  }

  /* stats strip: individual white cards, like the reference site's data tiles */
  .stats-strip{
    display:grid; grid-template-columns:repeat(4,1fr); gap:8px;
    margin-bottom:20px;
  }
  .stat-tile{
    background:var(--paper); border:1px solid var(--rule); border-radius:12px; box-shadow:var(--shadow-sm);
    padding:12px 6px; text-align:center;
    display:flex; flex-direction:column; gap:3px;
  }
  .stat-value{
    font-family:"JetBrains Mono",monospace; font-weight:700; font-size:clamp(16px,4.2vw,24px);
    color:var(--accent); font-variant-numeric: tabular-nums;
  }
  .stat-unit{ font-size:10px; font-weight:400; color:var(--muted); margin-left:1px; }
  .stat-label{ font-size:10.5px; color:var(--muted); letter-spacing:.01em; }

  /* category nav cards: すべて/G1/G2/G3 as colorful icon cards (à la p-town.dmm.com's 店舗情報/機種情報/エンタメ tabs) */
  .cat-nav{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px; }
  .cat-card{
    display:flex; flex-direction:column; align-items:center; gap:6px;
    background:var(--cat-soft,var(--accent-soft)); border:1.5px solid transparent; border-radius:14px;
    padding:12px 6px 10px; cursor:pointer; font-family:"Noto Sans JP",sans-serif;
  }
  .cat-card .cat-icon{
    width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    background:var(--cat-color,var(--accent)); color:#fff; font-family:"JetBrains Mono",monospace; font-weight:700; font-size:13px;
  }
  .cat-card .cat-label{ display:flex; flex-direction:column; align-items:center; gap:1px; font-weight:700; font-size:13px; color:var(--ink); }
  .cat-card .cat-sub{ font-weight:400; font-size:10px; color:var(--muted); }
  .cat-card[aria-pressed="true"]{ border-color:var(--cat-color,var(--accent)); box-shadow:var(--shadow-sm); }
  .cat-card.cat-all{ --cat-soft:var(--cat-all-soft); --cat-color:var(--cat-all); }
  .cat-card.cat-all .cat-icon{ color:var(--on-accent); }
  .cat-card.cat-g1{ --cat-soft:var(--cat-g1-soft); --cat-color:var(--cat-g1); }
  .cat-card.cat-g2{ --cat-soft:var(--cat-g2-soft); --cat-color:var(--cat-g2); }
  .cat-card.cat-g3{ --cat-soft:var(--cat-g3-soft); --cat-color:var(--cat-g3); }

  /* search toolbar */
  .toolbar{ margin-bottom:14px; }
  .search-wrap{
    position:relative; display:flex; align-items:center;
    background:var(--paper); border:1px solid var(--rule-strong); border-radius:999px; box-shadow:var(--shadow-sm);
    padding:4px 4px 4px 16px; margin-bottom:10px;
  }
  .search-wrap .search-icon{ color:var(--muted); font-size:14px; margin-right:8px; flex-shrink:0; }
  .search-box{
    flex:1; border:none; background:transparent; font:14px "Noto Sans JP",sans-serif;
    padding:8px 0; color:var(--ink); min-width:0;
  }
  .search-box:focus{ outline:none; }
  .search-wrap:focus-within{ border-color:var(--focus); box-shadow:0 0 0 2px var(--accent-soft); }
  .search-go{
    flex-shrink:0; font:700 12.5px "Noto Sans JP",sans-serif; color:var(--on-accent); background:var(--accent);
    border:none; border-radius:999px; padding:9px 18px; cursor:pointer;
  }
  .tag-row{ display:flex; gap:7px; flex-wrap:wrap; align-items:center; }
  .tag-row .tag-label{ font-size:11.5px; color:var(--muted); margin-right:2px; }
  .quick-tag{
    font:12px "Noto Sans JP",sans-serif; padding:5px 12px; border-radius:999px;
    border:1px solid var(--rule); background:var(--bg); color:var(--muted); cursor:pointer;
  }
  .quick-tag:hover{ border-color:var(--accent); color:var(--accent); }
  .no-results{ display:none; text-align:center; color:var(--muted); padding:30px 0; font-size:13px; }

  /* race link list (index page) */
  .race-list{ display:flex; flex-direction:column; gap:9px; }
  a.race-row{
    background:var(--paper); border:1px solid var(--rule); border-left:4px solid var(--rule-strong); border-radius:14px; box-shadow:var(--shadow-sm);
    padding:13px 16px; text-decoration:none; color:inherit;
    display:grid; grid-template-columns:auto 1.4fr auto 2fr auto auto; gap:10px 14px; align-items:center;
  }
  a.race-row.grade-g1{ border-left-color:var(--cat-g1); }
  a.race-row.grade-g2{ border-left-color:var(--cat-g2); }
  a.race-row.grade-g3{ border-left-color:var(--cat-g3); }
  a.race-row.grade-l{ border-left-color:var(--cat-l); }
  a.race-row:hover{ box-shadow:var(--shadow); transform:translateY(-1px); }
  a.race-row:focus-visible{ outline:2px solid var(--focus); outline-offset:2px; }
  .row-name{ font-weight:700; font-size:14.5px; }
  .row-venue{ font-weight:400; font-size:11.5px; color:var(--muted); margin-left:6px; }
  .row-date{ font-family:"JetBrains Mono",monospace; font-size:12px; color:var(--muted); white-space:nowrap; font-variant-numeric: tabular-nums; }
  .row-result{ font-size:12.5px; color:var(--ink); }
  .row-count{ font-family:"JetBrains Mono",monospace; font-size:11px; color:var(--muted); white-space:nowrap; }
  .row-arrow{ font-size:12px; font-weight:700; color:var(--accent); white-space:nowrap; }
  .grade-badge{ font-family:"JetBrains Mono",monospace; font-weight:700; font-size:12px; padding:3px 10px; border-radius:999px; white-space:nowrap; }
  .grade-badge.g1{ background:var(--g1-bg); color:var(--g1-ink); }
  .grade-badge.g2{ background:var(--g2-bg); color:var(--g2-ink); }
  .grade-badge.g3{ background:var(--g3-bg); color:var(--g3-ink); }
  .grade-badge.l{ background:var(--l-bg); color:var(--l-ink); }

  /* source ranking table (index page) */
  section.ranking{ margin:34px 0; }
  .sec-note{ font-size:12px; color:var(--muted); margin:0 0 14px; line-height:1.6; }
  .table-scroll{ overflow-x:auto; border:1px solid var(--rule); border-radius:12px; box-shadow:var(--shadow-sm); }
  table.rank-table{ border-collapse:collapse; width:100%; min-width:520px; background:var(--paper); }
  table.rank-table thead th{
    font-size:11px; font-weight:700; text-align:left; color:var(--muted); text-transform:uppercase; letter-spacing:.04em;
    padding:9px 12px; border-bottom:2px solid var(--ink); white-space:nowrap;
  }
  table.rank-table tbody td{ padding:9px 12px; border-bottom:1px solid var(--rule); font-size:13px; vertical-align:middle; }
  table.rank-table tbody tr:last-child td{ border-bottom:none; }
  table.rank-table tbody tr:hover{ background:var(--bg); }
  .rk-pos{ font-family:"JetBrains Mono",monospace; color:var(--muted); font-variant-numeric: tabular-nums; width:1%; }
  .rk-name{ font-weight:700; white-space:nowrap; }
  .rk-rate{ font-family:"JetBrains Mono",monospace; font-variant-numeric: tabular-nums; white-space:nowrap; }
  .rk-pct{ display:inline-block; margin-left:8px; font-weight:700; color:var(--accent); }

  /* race facts / podium / callout / tally / pred cards */
  .race-facts{ display:flex; flex-wrap:wrap; gap:8px 10px; margin:16px 0; }
  .fact{ font-family:"JetBrains Mono",monospace; font-size:12px; color:var(--accent); background:var(--accent-soft); border:1px solid var(--rule); padding:5px 12px; border-radius:3px; }
  .podium{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:22px; }
  .pod-card{ background:var(--paper); border:1px solid var(--rule); border-radius:14px; box-shadow:var(--shadow-sm); padding:14px 10px; text-align:center; }
  .pod-card.first{ border-color:var(--gold); box-shadow:0 0 0 1.5px var(--gold) inset, var(--shadow-sm); }
  .pod-rank{ font-family:"JetBrains Mono",monospace; font-weight:700; font-size:12px; color:var(--muted); letter-spacing:.08em; text-transform:uppercase; }
  .pod-card.first .pod-rank{ color:var(--gold); }
  .pod-uma{ font-family:"Zen Kaku Gothic New",sans-serif; font-weight:700; font-size:17px; margin:6px 0 2px; }
  .pod-meta{ font-size:11.5px; color:var(--muted); font-variant-numeric: tabular-nums; }
  .callout{ background:var(--accent-soft); border:1px solid var(--rule); border-left:5px solid var(--accent); padding:16px 18px; margin-bottom:26px; border-radius:14px; }
  .callout h3{ font-family:"Zen Kaku Gothic New",sans-serif; font-size:15px; margin:0 0 8px; }
  .callout p{ margin:0 0 6px; font-size:13.5px; }
  .callout p:last-child{ margin-bottom:0; }
  .callout b{ color:var(--accent); }
  section.tally{ margin-bottom:22px; }
  .sec-head{ display:flex; align-items:center; gap:10px; justify-content:space-between; padding-bottom:10px; margin-bottom:14px; }
  .sec-head .sec-title{ display:flex; align-items:center; gap:9px; }
  .sec-icon{
    width:28px; height:28px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    background:var(--accent); color:var(--on-accent); font-size:14px;
  }
  .sec-head h2{ font-family:"Zen Kaku Gothic New",sans-serif; font-size:17px; margin:0; }
  .sec-head span{ font-family:"JetBrains Mono",monospace; font-size:11px; color:var(--muted); white-space:nowrap; }
  .bar-row{ display:grid; grid-template-columns:130px 1fr auto; gap:10px; align-items:center; margin-bottom:9px; }
  .bar-label{ font-size:12.5px; font-weight:500; text-align:right; }
  .bar-track{ background:var(--accent-soft); border-radius:999px; height:16px; overflow:hidden; }
  .bar-fill{ height:100%; background:var(--rule-strong); border-radius:999px; }
  .bar-row.winner .bar-fill{ background:var(--gold); }
  .bar-row.winner .bar-label{ color:var(--gold); font-weight:700; }
  .bar-count{ display:flex; align-items:baseline; gap:8px; font-family:"JetBrains Mono",monospace; font-size:12.5px; font-weight:700; font-variant-numeric: tabular-nums; white-space:nowrap; }
  .bar-breakdown{ font-size:10.5px; font-weight:400; color:var(--muted); }
  .tally-note{ font-size:11.5px; color:var(--muted); margin-top:6px; }
  .pred-list{ display:flex; flex-direction:column; gap:12px; }
  .pred-card{ background:var(--paper); border:1px solid var(--rule); border-radius:14px; box-shadow:var(--shadow-sm); padding:14px 16px; }
  .pred-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:10px 16px; flex-wrap:wrap; margin-bottom:9px; }
  .src-name{ font-weight:700; display:inline-block; font-size:14px; }
  .src-name:hover{ color:var(--accent); }
  .badge{ display:inline-block; font-size:10.5px; font-weight:600; margin-left:8px; padding:2px 8px; border-radius:999px; white-space:nowrap; vertical-align:middle; }
  .badge.ai{ background:var(--badge-ai-bg); color:var(--badge-ai-ink); }
  .badge.blog{ background:var(--badge-blog-bg); color:var(--badge-blog-ink); }
  .badge.yt{ background:var(--badge-yt-bg); color:var(--badge-yt-ink); }
  .badge.ent{ background:var(--badge-ent-bg); color:var(--badge-ent-ink); }
  .badge.cmp{ background:var(--badge-cmp-bg); color:var(--badge-cmp-ink); }
  .mark{ font-family:"JetBrains Mono",monospace; font-variant-numeric: tabular-nums; }
  .result-pill{ font-family:"JetBrains Mono",monospace; font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; white-space:nowrap; display:inline-block; flex-shrink:0; }
  .result-pill.win{ background:var(--hit-bg); color:var(--hit-ink); }
  .result-pill.place{ background:var(--place-bg); color:var(--place-ink); }
  .result-pill.miss{ background:var(--miss-bg); color:var(--miss); }
  .pred-marks{ display:flex; flex-wrap:wrap; row-gap:5px; column-gap:16px; font-size:12.5px; margin-bottom:9px; }
  .pred-marks .mk{ display:flex; align-items:baseline; gap:5px; }
  .pred-marks .mk .sym{ font-weight:700; color:var(--accent); min-width:1.1em; }
  .pred-marks .mk .dash{ color:var(--rule-strong); }
  .pred-reason{ font-size:12.5px; color:var(--ink); line-height:1.7; margin:0; padding-top:9px; border-top:1px dashed var(--rule); }
  .pred-reason.empty{ color:var(--muted); font-style:italic; }

  footer{ max-width:960px; margin:40px auto 0; padding:20px 20px 0; border-top:1px solid var(--rule); color:var(--muted); font-size:12px; }
  footer p{ margin:0 0 8px; }
  footer a{ color:var(--accent); }

  @media (max-width:640px){
    a.race-row{
      grid-template-columns:1fr auto;
      grid-template-areas:"grade date" "name name" "result result" "count arrow";
      row-gap:5px;
    }
    .grade-badge{ grid-area:grade; justify-self:start; }
    .row-date{ grid-area:date; justify-self:end; }
    .row-name{ grid-area:name; }
    .row-result{ grid-area:result; }
    .row-count{ grid-area:count; justify-self:start; }
    .row-arrow{ grid-area:arrow; justify-self:end; }
    .podium{ grid-template-columns:1fr; }
    .bar-row{ grid-template-columns:96px 1fr auto; }
    table.rank-table{ min-width:460px; }
    .stats-strip{ grid-template-columns:repeat(2,1fr); }
    .wrap{ padding:0 14px 60px; }
    header.masthead{ padding:16px 14px 0; }
    .cat-nav{ gap:6px; }
    .cat-card{ padding:9px 2px 7px; border-radius:12px; }
    .cat-card .cat-icon{ width:28px; height:28px; font-size:11px; }
    .cat-card .cat-label{ font-size:11.5px; }
    .cat-card .cat-sub{ font-size:9px; }
    .search-wrap{ flex-wrap:nowrap; }
    .search-go{ padding:8px 12px; font-size:11.5px; }
  }
`;

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700;900&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">`;

// ---- index.html: a compact link list of every race (detail lives on each race's own page), plus a source ranking table. No upcoming schedule. ----
const description = `JRAの重賞レース結果と、AI予想・専門ブログ・YouTube/note・芸能人企画など複数の予想元が事前に出していた◎○▲・根拠を並べて検証するアーカイブ。現在${races.length}レース分を公開中。`;

const raceListHtml = races.map((r) => renderRaceLinkRow(r.data, r.folder)).join("\n");
const rankingHtml = renderRankingTable(races);
const gradeCounts = { G1: 0, G2: 0, G3: 0 };
races.forEach((r) => { gradeCounts[r.data.grade] = (gradeCounts[r.data.grade] || 0) + 1; });
const popularTagsHtml = races
  .slice(0, 6)
  .map((r) => `<button type="button" class="quick-tag" data-query="${escapeHtml(r.data.name)}">${escapeHtml(r.data.name)}</button>`)
  .join("");

const indexHtml = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${ADSENSE_TAG}
<title>${SITE_NAME}｜レース結果と予想データの検証サイト</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${SITE_URL}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="ja_JP" />
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
${JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description,
    inLanguage: "ja",
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}og-image.svg` } },
  },
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: SITE_NAME,
    description,
    url: SITE_URL,
    inLanguage: "ja",
    dateModified: BUILD_DATE,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: races.length,
      itemListElement: races.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Article",
          name: `${r.data.name}${r.data.date.slice(0, 4)} 全予想比較`,
          description: (r.data.summary[0] || "").replace(/<[^>]+>/g, ""),
          datePublished: r.data.date,
          url: SITE_URL + path.basename(r.folder) + "/",
        },
      })),
    },
  },
])}
</script>
${FONT_LINK}
<style>${SHARED_CSS}</style>
</head>
<body>

<header class="masthead">
  <div class="kicker">
    <span>KEIBA BUNSEKI</span>
    <span>公開中 ${races.length}レース</span>
  </div>
  <h1 class="title">${SITE_NAME}</h1>
  <p class="subtitle">これから出す予想ではなく、終わったレースの結果と、各予想サイトが事前に何を◎にしていたかを集めて検証するデータサイトです。レースをクリックすると根拠まで見られる詳細ページへ移動します。</p>

  ${renderStatsStrip(races)}

  <div class="cat-nav" id="grade-chips">
    <button type="button" class="cat-card cat-all" data-grade="all" aria-pressed="true">
      <span class="cat-icon">全</span><span class="cat-label">すべて<span class="cat-sub">${races.length}件</span></span>
    </button>
    <button type="button" class="cat-card cat-g1" data-grade="G1" aria-pressed="false">
      <span class="cat-icon">G1</span><span class="cat-label">G1<span class="cat-sub">${gradeCounts.G1}件</span></span>
    </button>
    <button type="button" class="cat-card cat-g2" data-grade="G2" aria-pressed="false">
      <span class="cat-icon">G2</span><span class="cat-label">G2<span class="cat-sub">${gradeCounts.G2}件</span></span>
    </button>
    <button type="button" class="cat-card cat-g3" data-grade="G3" aria-pressed="false">
      <span class="cat-icon">G3</span><span class="cat-label">G3<span class="cat-sub">${gradeCounts.G3}件</span></span>
    </button>
  </div>

  <div class="rule-3"></div>

  <section>
    <div class="sec-head"><div class="sec-title"><span class="sec-icon">🏇</span><h2>レース一覧</h2></div><span id="race-count-label">${races.length}レース公開中</span></div>
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="search" class="search-box" id="race-search" placeholder="レース名・競馬場で検索（例：新潟記念、阪神）">
        <button type="button" class="search-go" id="search-go">検索</button>
      </div>
      <div class="tag-row">
        <span class="tag-label">よく見られているレース</span>
        ${popularTagsHtml}
      </div>
    </div>
    <div class="race-list" id="race-list">
      ${raceListHtml}
    </div>
    <p class="no-results" id="no-results">条件に一致するレースが見つかりませんでした。</p>
  </section>
</header>

<div class="wrap">
  ${rankingHtml}
</div>

<div class="wrap">
  <footer>
    <p>掲載データは各サイト・SNS・noteに公開されていた予想記事をもとに作成した検証用のまとめです。当サイト自身が予想・買い目を提供するものではありません。</p>
    <p><a href="https://github.com/HARUIKNTV/keiba-yosou-hikaku">GitHubリポジトリ</a> ｜ <a href="https://haruikntv.github.io/">HARUIKNTV トップ</a></p>
  </footer>
</div>
<script>
(function(){
  var search = document.getElementById('race-search');
  var searchGo = document.getElementById('search-go');
  var catCards = document.querySelectorAll('#grade-chips .cat-card');
  var quickTags = document.querySelectorAll('.quick-tag');
  var rows = Array.prototype.slice.call(document.querySelectorAll('#race-list .race-row'));
  var noResults = document.getElementById('no-results');
  var countLabel = document.getElementById('race-count-label');
  var activeGrade = 'all';

  function applyFilter(){
    var q = search.value.trim().toLowerCase();
    var visible = 0;
    rows.forEach(function(row){
      var gradeOk = activeGrade === 'all' || row.dataset.grade === activeGrade;
      var textOk = !q || row.dataset.search.indexOf(q) !== -1;
      var show = gradeOk && textOk;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    noResults.style.display = visible === 0 ? 'block' : 'none';
    countLabel.textContent = visible + 'レース表示中';
  }

  search.addEventListener('input', applyFilter);
  searchGo.addEventListener('click', applyFilter);
  catCards.forEach(function(btn){
    btn.addEventListener('click', function(){
      catCards.forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
      btn.setAttribute('aria-pressed', 'true');
      activeGrade = btn.dataset.grade;
      applyFilter();
    });
  });
  quickTags.forEach(function(tag){
    tag.addEventListener('click', function(){
      search.value = tag.dataset.query;
      applyFilter();
      search.focus();
    });
  });
})();
</script>
</body>
</html>
`;

const siteDir = path.join(ROOT, "site");
fs.mkdirSync(siteDir, { recursive: true });
fs.writeFileSync(path.join(siteDir, "index.html"), indexHtml);

// ---- one standalone page per race (deep link / share target) ----
races.forEach((r) => {
  const data = r.data;
  const slug = path.basename(r.folder);
  const raceUrl = `${SITE_URL}${slug}/`;
  const desc = (data.summary[0] || "").replace(/<[^>]+>/g, "");
  const pageTitle = `${data.name}${data.date.slice(0, 4)} 全予想比較`;
  const ogImageUrl = `${SITE_URL}og-image.svg`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: pageTitle, item: raceUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: pageTitle,
      description: desc,
      url: raceUrl,
      mainEntityOfPage: { "@type": "WebPage", "@id": raceUrl },
      image: [ogImageUrl],
      datePublished: data.date,
      dateModified: BUILD_DATE,
      inLanguage: "ja",
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL, logo: { "@type": "ImageObject", url: ogImageUrl } },
      about: {
        "@type": "SportsEvent",
        name: data.name,
        startDate: data.date,
        location: { "@type": "Place", name: data.venue },
        sport: "Horse racing",
      },
    },
  ];
  const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="index, follow, max-image-preview:large" />
${ADSENSE_TAG}
<title>${escapeHtml(pageTitle)}｜${SITE_NAME}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<link rel="canonical" href="${raceUrl}" />
<meta property="og:type" content="article" />
<meta property="og:locale" content="ja_JP" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${escapeHtml(pageTitle)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:url" content="${raceUrl}" />
<meta property="og:image" content="${ogImageUrl}" />
<meta property="article:published_time" content="${data.date}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${ogImageUrl}" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
${FONT_LINK}
<style>${SHARED_CSS}</style>
</head>
<body>

<header class="masthead">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="../">${SITE_NAME}</a><span aria-hidden="true"> › </span><span aria-current="page">${escapeHtml(data.name)}</span></nav>
  <div class="kicker">
    <span><a href="../">${SITE_NAME}</a> / KEIBA BUNSEKI</span>
    <span>${data.sourceCountNote}</span>
  </div>
  <h1 class="title">${escapeHtml(pageTitle)}</h1>
  <p class="subtitle">${data.sourceCountNote}が公開していた◎○▲と根拠を、実際の結果とあわせて検証</p>
  <div class="rule-3"></div>
  ${renderRaceBody(data)}
</header>

<div class="wrap">
  <footer>
    <p>集計は${data.date.slice(0, 4)}年${Number(data.date.slice(5, 7))}月時点で各サイト・SNS・noteに公開されていた予想記事をもとに作成しています。◎○▲の定義は媒体により異なり、独自形式（軸2頭・本命2強など）は便宜上◎欄にまとめています。</p>
    <p>各予想元の詳細・買い目・見解の全文は、実際のリンク先記事でご確認ください。有料予想を伴う場合は特に、事業者情報や口コミを確認したうえでご判断ください。</p>
    <p><a href="../">← レース一覧に戻る</a> ｜ <a href="https://github.com/HARUIKNTV/keiba-yosou-hikaku">GitHubリポジトリ</a></p>
  </footer>
</div>
</body>
</html>
`;
  const outDir = path.join(siteDir, slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), page);
});

// ---- sitemap.xml ----
const sitemapEntries = [
  { loc: SITE_URL, lastmod: BUILD_DATE, priority: "1.0" },
  ...races.map((r) => ({ loc: `${SITE_URL}${path.basename(r.folder)}/`, lastmod: r.data.date, priority: "0.8" })),
];
fs.writeFileSync(
  path.join(siteDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries
    .map((e) => `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod><priority>${e.priority}</priority></url>`)
    .join("\n")}\n</urlset>\n`
);

// ---- robots.txt ----
// Explicitly allow the mainstream search crawlers plus the AI-answer crawlers
// (SGE/AI Overviews, ChatGPT, Perplexity, Claude, Common Crawl) so the site
// is eligible to be cited in AI-generated answers as well as classic search.
const robotsTxt = `User-agent: *
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: CCBot
Allow: /

Sitemap: ${SITE_URL}sitemap.xml
`;
fs.writeFileSync(path.join(siteDir, "robots.txt"), robotsTxt);

// ---- llms.txt ----
const llmsTxt = `# ${SITE_NAME}

> ${description}

## 公開済みの検証ページ
${races.map((r) => `- [${r.data.name}${r.data.date.slice(0, 4)} 全予想比較](${SITE_URL}${path.basename(r.folder)}/): 1着${r.data.result[0].name}。${r.data.sourceCountNote}の◎○▲と根拠を検証。 (グレード: ${r.data.grade}, 開催日: ${r.data.date})`).join("\n")}
`;
fs.writeFileSync(path.join(siteDir, "llms.txt"), llmsTxt);

// ---- static OG image asset ----
fs.copyFileSync(path.join(ROOT, "assets", "og-image.svg"), path.join(siteDir, "og-image.svg"));

console.log(`Generated index.html + ${races.length} race page(s), sitemap.xml, robots.txt, llms.txt.`);
