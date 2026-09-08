const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

const SITE_NAME = "競馬予想比較";
const SITE_URL = "https://haruikntv.github.io/keiba-yosou-hikaku/";
const ADSENSE_TAG = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7523687500134096" crossorigin="anonymous"></script>';

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
function adSlot(sizeLabel, extraClass) {
  return `<div class="ad-slot ${extraClass || ""}">
    <div class="ad-slot-inner"><span class="ad-slot-label">広告スペース</span><span class="ad-slot-size">${sizeLabel}</span></div>
    <!-- AdSense/other ad network snippet goes here. See README.md "広告の設置について". -->
  </div>`;
}

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
    <div class="sec-head"><h2>予想印の集計（本命〜穴まで）</h2><span>◎3点・○2点・▲穴1点で採点</span></div>
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
    <div class="sec-head"><h2>予想元別 印・根拠一覧</h2><span>◎○▲穴と、公開されていた見解・根拠</span></div>
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
    ${adSlot("300 x 250", "ad-rect")}
    ${renderPredCards(data)}
  `;
}

function resultCompactLine(result) {
  const rankLabel = { 1: "1着", 2: "2着", 3: "3着" };
  return result.map((r) => `${rankLabel[r.rank] || r.rank + "着"} ${r.num ? r.num + " " : ""}${escapeHtml(r.name)}`).join("　／　");
}

function renderRaceLinkRow(data, folder) {
  const slug = path.basename(folder);
  return `<a class="race-row" href="./${slug}/">
    <span class="grade-badge ${data.grade.toLowerCase()}">${data.grade}</span>
    <span class="row-name">${escapeHtml(data.name)}<span class="row-venue">${escapeHtml(data.venueShort)}</span></span>
    <span class="row-date">${dateLabel(data.date)}</span>
    <span class="row-result">${resultCompactLine(data.result)}</span>
    <span class="row-count">${data.sourceCountNote}</span>
    <span class="row-arrow">詳細を見る →</span>
  </a>`;
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
    <div class="sec-head"><h2>予想元別 成績ランキング</h2><span>${races.length}レース分・◎的中率順</span></div>
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
const SHARED_CSS = `
  :root{
    --bg:#F1F3EA; --paper:#FBFAF3; --ink:#171D18; --muted:#5B6660;
    --rule:#CBD1C2; --rule-strong:#9AA593; --accent:#1F4D3A; --accent-soft:#E4EBE1;
    --gold:#A9791F; --gold-soft:#F1E6C9; --silver:#7A8480; --bronze:#9C6B3E;
    --miss:#8C8478; --miss-bg:#EDEAE0; --hit-bg:#F1E6C9; --hit-ink:#7A5B10;
    --place-bg:#DCE9E2; --place-ink:#1F4D3A;
    --badge-ai-bg:#D8ECEA; --badge-ai-ink:#1E6B62;
    --badge-blog-bg:#E7DCEC; --badge-blog-ink:#5C3A80;
    --badge-yt-bg:#F3DCDC; --badge-yt-ink:#8A2E2E;
    --badge-ent-bg:#EFE3D2; --badge-ent-ink:#6B4A1E;
    --badge-cmp-bg:#DCE3EC; --badge-cmp-ink:#2E4A6B;
    --g1-bg:#F3DCDC; --g1-ink:#8A2E2E; --g2-bg:#DCE3EC; --g2-ink:#2E4A6B; --g3-bg:#D8ECEA; --g3-ink:#1E6B62;
    --focus:#1F4D3A;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#12160F; --paper:#181D15; --ink:#E9EAE0; --muted:#9CA69A;
      --rule:#333B2E; --rule-strong:#48533F; --accent:#5FBA92; --accent-soft:#1E2A20;
      --gold:#E0B85A; --gold-soft:#332A12; --silver:#9AA5A0; --bronze:#C08A54;
      --miss:#7C8378; --miss-bg:#1E221B; --hit-bg:#332A12; --hit-ink:#E0B85A;
      --place-bg:#1C2B22; --place-ink:#7FD0A6;
      --badge-ai-bg:#132824; --badge-ai-ink:#6FCFC2;
      --badge-blog-bg:#241C2C; --badge-blog-ink:#C6A6E0;
      --badge-yt-bg:#2C1818; --badge-yt-ink:#E19A9A;
      --badge-ent-bg:#2B2416; --badge-ent-ink:#D8B57C;
      --badge-cmp-bg:#1C2530; --badge-cmp-ink:#8FB0DA;
      --g1-bg:#2C1818; --g1-ink:#E19A9A; --g2-bg:#1C2530; --g2-ink:#8FB0DA; --g3-bg:#132824; --g3-ink:#6FCFC2;
      --focus:#8FD6B4;
    }
  }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:"Noto Sans JP","Hiragino Sans",sans-serif; line-height:1.7; }
  a{ color:inherit; }
  .wrap{ max-width:960px; margin:0 auto; padding:0 20px 70px; }

  .ad-slot{
    display:flex; align-items:center; justify-content:center;
    background:repeating-linear-gradient(45deg, var(--accent-soft), var(--accent-soft) 10px, var(--paper) 10px, var(--paper) 20px);
    border:2px dashed var(--rule-strong); border-radius:8px; color:var(--muted);
    margin:18px auto; max-width:960px;
  }
  .ad-slot-inner{ text-align:center; }
  .ad-slot-label{ display:block; font-size:12px; letter-spacing:.1em; }
  .ad-slot-size{ display:block; font-size:10.5px; opacity:.75; }
  .ad-banner{ max-width:728px; height:90px; }
  .ad-rect{ max-width:300px; height:250px; }

  header.masthead{ max-width:960px; margin:0 auto; padding:20px 20px 0; }
  .kicker{
    font-family:"JetBrains Mono",monospace; font-size:11px; letter-spacing:.1em;
    color:var(--muted); text-transform:uppercase;
    border-bottom:1px solid var(--rule); padding-bottom:10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:4px;
  }
  .kicker a{ text-decoration:underline; }
  h1.title{
    font-family:"Noto Serif JP",serif; font-weight:900; font-size:clamp(26px,5vw,44px);
    text-align:center; margin:20px 0 4px; letter-spacing:.01em; text-wrap:balance;
  }
  p.subtitle{ text-align:center; color:var(--muted); font-size:14px; margin:0 0 20px; }
  .rule-3{
    height:5px; margin:0 0 20px;
    background:
      linear-gradient(var(--ink),var(--ink)) top/100% 1px no-repeat,
      linear-gradient(var(--ink),var(--ink)) bottom/100% 1px no-repeat;
  }

  /* race link list (index page) */
  .race-list{ display:flex; flex-direction:column; gap:9px; }
  a.race-row{
    background:var(--paper); border:1px solid var(--rule); border-radius:6px;
    padding:12px 16px; text-decoration:none; color:inherit;
    display:grid; grid-template-columns:auto 1.4fr auto 2fr auto auto; gap:10px 14px; align-items:center;
  }
  a.race-row:hover{ border-color:var(--accent); }
  a.race-row:focus-visible{ outline:2px solid var(--focus); outline-offset:2px; }
  .row-name{ font-weight:700; font-size:14.5px; }
  .row-venue{ font-weight:400; font-size:11.5px; color:var(--muted); margin-left:6px; }
  .row-date{ font-family:"JetBrains Mono",monospace; font-size:12px; color:var(--muted); white-space:nowrap; font-variant-numeric: tabular-nums; }
  .row-result{ font-size:12.5px; color:var(--ink); }
  .row-count{ font-family:"JetBrains Mono",monospace; font-size:11px; color:var(--muted); white-space:nowrap; }
  .row-arrow{ font-size:12px; font-weight:700; color:var(--accent); white-space:nowrap; }
  .grade-badge{ font-family:"JetBrains Mono",monospace; font-weight:700; font-size:12px; padding:3px 9px; border-radius:4px; white-space:nowrap; }
  .grade-badge.g1{ background:var(--g1-bg); color:var(--g1-ink); }
  .grade-badge.g2{ background:var(--g2-bg); color:var(--g2-ink); }
  .grade-badge.g3{ background:var(--g3-bg); color:var(--g3-ink); }

  /* source ranking table (index page) */
  section.ranking{ margin:34px 0; }
  .sec-note{ font-size:12px; color:var(--muted); margin:0 0 14px; line-height:1.6; }
  .table-scroll{ overflow-x:auto; border:1px solid var(--rule); border-radius:6px; }
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
  .pod-card{ background:var(--bg); border:1px solid var(--rule); border-radius:6px; padding:14px 12px; text-align:center; }
  .pod-card.first{ border-color:var(--gold); box-shadow:0 0 0 1px var(--gold) inset; }
  .pod-rank{ font-family:"JetBrains Mono",monospace; font-weight:700; font-size:12px; color:var(--muted); letter-spacing:.08em; text-transform:uppercase; }
  .pod-card.first .pod-rank{ color:var(--gold); }
  .pod-uma{ font-family:"Noto Serif JP",serif; font-weight:700; font-size:18px; margin:6px 0 2px; }
  .pod-meta{ font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums; }
  .callout{ background:var(--bg); border:1px solid var(--rule); border-left:5px solid var(--accent); padding:16px 18px; margin-bottom:26px; border-radius:2px; }
  .callout h3{ font-family:"Noto Serif JP",serif; font-size:15px; margin:0 0 8px; }
  .callout p{ margin:0 0 6px; font-size:13.5px; }
  .callout p:last-child{ margin-bottom:0; }
  .callout b{ color:var(--accent); }
  section.tally{ margin-bottom:22px; }
  .sec-head{ display:flex; align-items:baseline; gap:10px; justify-content:space-between; border-bottom:2px solid var(--ink); padding-bottom:6px; margin-bottom:14px; }
  .sec-head h2{ font-family:"Noto Serif JP",serif; font-size:17px; margin:0; }
  .sec-head span{ font-family:"JetBrains Mono",monospace; font-size:11px; color:var(--muted); }
  .bar-row{ display:grid; grid-template-columns:130px 1fr auto; gap:10px; align-items:center; margin-bottom:9px; }
  .bar-label{ font-size:12.5px; font-weight:500; text-align:right; }
  .bar-track{ background:var(--accent-soft); border-radius:3px; height:18px; overflow:hidden; }
  .bar-fill{ height:100%; background:var(--rule-strong); border-radius:3px 0 0 3px; }
  .bar-row.winner .bar-fill{ background:var(--gold); }
  .bar-row.winner .bar-label{ color:var(--gold); font-weight:700; }
  .bar-count{ display:flex; align-items:baseline; gap:8px; font-family:"JetBrains Mono",monospace; font-size:12.5px; font-weight:700; font-variant-numeric: tabular-nums; white-space:nowrap; }
  .bar-breakdown{ font-size:10.5px; font-weight:400; color:var(--muted); }
  .tally-note{ font-size:11.5px; color:var(--muted); margin-top:6px; }
  .pred-list{ display:flex; flex-direction:column; gap:12px; }
  .pred-card{ background:var(--bg); border:1px solid var(--rule); border-radius:6px; padding:14px 16px; }
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
  }
`;

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700;900&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">`;

// ---- index.html: a compact link list of every race (detail lives on each race's own page), plus a source ranking table. No upcoming schedule. ----
const description = `JRAの重賞レース結果と、AI予想・専門ブログ・YouTube/note・芸能人企画など複数の予想元が事前に出していた◎○▲・根拠を並べて検証するアーカイブ。現在${races.length}レース分を公開中。`;

const raceListHtml = races.map((r) => renderRaceLinkRow(r.data, r.folder)).join("\n");
const rankingHtml = renderRankingTable(races);

const indexHtml = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${ADSENSE_TAG}
<title>${SITE_NAME}｜レース結果と予想の検証アーカイブ</title>
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
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: SITE_NAME,
  description,
  url: SITE_URL,
  mainEntity: {
    "@type": "ItemList",
    itemListElement: races.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Article",
        name: `${r.data.name}${r.data.date.slice(0, 4)} 全予想比較`,
        description: (r.data.summary[0] || "").replace(/<[^>]+>/g, ""),
        url: SITE_URL + path.basename(r.folder) + "/",
      },
    })),
  },
}, null, 2)}
</script>
${FONT_LINK}
<style>${SHARED_CSS}</style>
</head>
<body>

${adSlot("728 x 90", "ad-banner")}

<header class="masthead">
  <div class="kicker">
    <span>KEIBA YOSOU HIKAKU</span>
    <span>公開中 ${races.length}レース</span>
  </div>
  <h1 class="title">${SITE_NAME}</h1>
  <p class="subtitle">これから出す予想ではなく、終わったレースの結果と、各予想サイトが事前に何を◎にしていたかを並べて検証するアーカイブです。レースをクリックすると根拠まで見られる詳細ページへ移動します。</p>
  <div class="rule-3"></div>

  <section>
    <div class="sec-head"><h2>レース一覧</h2><span>${races.length}レース公開中</span></div>
    <div class="race-list">
      ${raceListHtml}
    </div>
  </section>
</header>

${adSlot("728 x 90", "ad-banner")}

<div class="wrap">
  ${rankingHtml}
</div>

${adSlot("728 x 90", "ad-banner")}

<div class="wrap">
  <footer>
    <p>掲載データは各サイト・SNS・noteに公開されていた予想記事をもとに作成した検証用のまとめです。当サイト自身が予想・買い目を提供するものではありません。</p>
    <p><a href="https://github.com/HARUIKNTV/keiba-yosou-hikaku">GitHubリポジトリ</a> ｜ <a href="https://haruikntv.github.io/">HARUIKNTV トップ</a></p>
  </footer>
</div>
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
  const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${ADSENSE_TAG}
<title>${escapeHtml(data.name)}${data.date.slice(0, 4)} 全予想比較｜${SITE_NAME}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<link rel="canonical" href="${raceUrl}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${escapeHtml(data.name)}${data.date.slice(0, 4)} 全予想比較" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:url" content="${raceUrl}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeHtml(data.name)}${data.date.slice(0, 4)} 全予想比較" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
${FONT_LINK}
<style>${SHARED_CSS}</style>
</head>
<body>

${adSlot("728 x 90", "ad-banner")}

<header class="masthead">
  <div class="kicker">
    <span><a href="../">${SITE_NAME}</a> / KEIBA YOSOU HIKAKU</span>
    <span>${data.sourceCountNote}</span>
  </div>
  <h1 class="title">${escapeHtml(data.name)}${data.date.slice(0, 4)} 全予想比較</h1>
  <p class="subtitle">${data.sourceCountNote}が公開していた◎○▲と根拠を、実際の結果とあわせて検証</p>
  <div class="rule-3"></div>
  ${renderRaceBody(data)}
</header>

${adSlot("728 x 90", "ad-banner")}

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
const urls = [SITE_URL, ...races.map((r) => `${SITE_URL}${path.basename(r.folder)}/`)];
fs.writeFileSync(
  path.join(siteDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`
);

// ---- llms.txt ----
const llmsTxt = `# ${SITE_NAME}

> ${description}

## 公開済みの検証ページ
${races.map((r) => `- [${r.data.name}${r.data.date.slice(0, 4)} 全予想比較](${SITE_URL}${path.basename(r.folder)}/): 1着${r.data.result[0].name}。${r.data.sourceCountNote}の◎○▲と根拠を検証。 (グレード: ${r.data.grade}, 開催日: ${r.data.date})`).join("\n")}
`;
fs.writeFileSync(path.join(siteDir, "llms.txt"), llmsTxt);

// ---- static OG image asset ----
fs.copyFileSync(path.join(ROOT, "assets", "og-image.svg"), path.join(siteDir, "og-image.svg"));

console.log(`Generated index.html + ${races.length} race page(s), sitemap.xml, llms.txt.`);
