// 页面交互逻辑
const $ = (sel) => document.querySelector(sel);
const pct = (p, digits = 1) => (p * 100).toFixed(digits) + '%';
const teamLabel = (t) => `${t.flag} ${t.zh}`;

// ---------- Tab 切换 ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $('#tab-' + tab).classList.add('active');
    // 首次打开时惰性渲染较重的页
    if (tab === 'standings' && !$('#standingsResult').innerHTML.trim()) renderStandings();
    if (tab === 'backtest' && !$('#backtestResult').innerHTML.trim()) renderBacktest();
    if (tab === 'knockout' && !$('#koResult').innerHTML.trim()) renderKnockout();
  });
});

// ---------- 集成权重 ----------
function readWeights() {
  return {
    elo: parseInt($('#wElo').value, 10),
    fifa: parseInt($('#wFifa').value, 10),
    market: parseInt($('#wMarket').value, 10),
  };
}
for (const [id, valId] of [['wElo', 'wEloVal'], ['wFifa', 'wFifaVal'], ['wMarket', 'wMarketVal']]) {
  $('#' + id).addEventListener('input', () => {
    $('#' + valId).textContent = $('#' + id).value;
    renderMatch();
  });
}

// ---------- 初始化下拉框 ----------
function initSelectors() {
  const sorted = Object.values(TEAMS).sort((a, b) =>
    a.group === b.group ? b.elo - a.elo : a.group.localeCompare(b.group));
  for (const id of ['teamA', 'teamB']) {
    const sel = $('#' + id);
    let currentGroup = '';
    let og = null;
    for (const t of sorted) {
      if (t.group !== currentGroup) {
        currentGroup = t.group;
        og = document.createElement('optgroup');
        og.label = `${t.group} 组`;
        sel.appendChild(og);
      }
      const opt = document.createElement('option');
      opt.value = t.code;
      opt.textContent = `${t.flag} ${t.zh} (${t.en})`;
      og.appendChild(opt);
    }
  }
  $('#teamA').value = 'USA';
  $('#teamB').value = 'MEX';

  const gSel = $('#groupSelect');
  for (const g of GROUP_NAMES) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = `${g} 组：` + GROUPS[g].map((c) => TEAMS[c].zh).join(' / ');
    gSel.appendChild(opt);
  }
}

// ---------- 对阵预测 ----------
function renderMatch() {
  const A = TEAMS[$('#teamA').value];
  const B = TEAMS[$('#teamB').value];
  const knockout = document.querySelector('input[name="stage"]:checked').value === 'knockout';
  const useHome = $('#homeAdv').checked;
  const dc = $('#dcToggle').checked;
  const weights = readWeights();

  if (A.code === B.code) {
    $('#matchResult').innerHTML = '<div class="card"><p>请选择两支不同的球队 😅</p></div>';
    return;
  }

  // 四个模型分别预测
  const ai = aiApplyOn();
  const form = $('#formToggle').checked;
  const results = {};
  for (const m of ['elo', 'fifa', 'market', 'ensemble']) {
    results[m] = predictMatch(A, B, { model: m, knockout, useHome, dc, weights, ai, form });
  }
  const r = results.ensemble; // 主展示用集成结果
  const { probs, top, best } = r;

  let advanceHtml = '';
  if (knockout) {
    advanceHtml = `<div class="advance-note">含加时与点球的晋级概率（集成）：${teamLabel(A)} ${pct(r.advanceA)} ｜ ${teamLabel(B)} ${pct(r.advanceB)}</div>`;
  }

  // 模型对比表
  const cmpRows = ['elo', 'fifa', 'market', 'ensemble'].map((m) => {
    const x = results[m];
    return `
      <tr class="${m === 'ensemble' ? 'qualified' : ''}">
        <td class="team-cell">${MODEL_INFO[m].name}${m === 'ensemble' ? ' ⭐' : ''}</td>
        <td class="pct"><strong>${x.best.a} : ${x.best.b}</strong></td>
        <td class="pct">${x.lamA.toFixed(2)} : ${x.lamB.toFixed(2)}</td>
        <td class="pct">${pct(x.probs.win)}</td>
        <td class="pct">${pct(x.probs.draw)}</td>
        <td class="pct">${pct(x.probs.loss)}</td>
        ${knockout ? `<td class="pct">${pct(x.advanceA)}</td>` : ''}
      </tr>`;
  }).join('');

  const chips = top.map((s, i) =>
    `<div class="score-chip${i === 0 ? ' best' : ''}">
       <div class="s">${s.a} : ${s.b}</div>
       <div class="p">${pct(s.p)}</div>
     </div>`).join('');

  // 热力图（显示到 5 球，足够覆盖绝大多数概率）
  const SHOW = 5;
  let heat = '<table class="heatmap"><tr><th></th>';
  for (let b = 0; b <= SHOW; b++) heat += `<th>${B.flag}${b}</th>`;
  heat += '</tr>';
  const maxP = r.matrix.flat().reduce((m, v) => Math.max(m, v), 0);
  for (let a = 0; a <= SHOW; a++) {
    heat += `<tr><th>${A.flag}${a}</th>`;
    for (let b = 0; b <= SHOW; b++) {
      const p = r.matrix[a][b];
      const alpha = (p / maxP) * 0.85;
      heat += `<td style="background: rgba(56,189,248,${alpha.toFixed(3)})">${(p * 100).toFixed(1)}</td>`;
    }
    heat += '</tr>';
  }
  heat += '</table>';

  $('#matchResult').innerHTML = `
    <div class="card score-banner">
      <div class="teams-line">
        <div class="team"><span class="flag">${A.flag}</span>${A.zh}<span class="en">${A.en}</span></div>
        <div class="big-score">${best.a} : ${best.b}</div>
        <div class="team"><span class="flag">${B.flag}</span>${B.zh}<span class="en">${B.en}</span></div>
      </div>
      <div class="score-note">集成模型最可能比分（概率 ${pct(best.p)}）· 预期进球 ${r.lamA.toFixed(2)} : ${r.lamB.toFixed(2)}</div>
      ${advanceHtml}
    </div>
    <div class="card">
      <div class="section-title">四个模型对比（⭐ 集成 = 三模型按当前权重 Elo:${weights.elo} / FIFA:${weights.fifa} / 赔率:${weights.market} 加权）</div>
      <table class="standings">
        <tr><th style="text-align:left">模型</th><th>最可能比分</th><th>预期进球</th><th>${A.zh}胜</th><th>平</th><th>${B.zh}胜</th>${knockout ? '<th>晋级率</th>' : ''}</tr>
        ${cmpRows}
      </table>
    </div>
    <div class="card">
      <div class="section-title">90 分钟胜平负概率（集成）</div>
      <div class="prob-bar">
        <div class="prob-win" style="flex:${probs.win}">${A.zh}胜 ${pct(probs.win)}</div>
        <div class="prob-draw" style="flex:${probs.draw}">平 ${pct(probs.draw)}</div>
        <div class="prob-loss" style="flex:${probs.loss}">${B.zh}胜 ${pct(probs.loss)}</div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">最可能的 6 个比分（集成）</div>
      <div class="score-list">${chips}</div>
    </div>
    <div class="card">
      <div class="section-title">比分概率热力图（%，行 = ${A.zh}进球，列 = ${B.zh}进球）</div>
      ${heat}
    </div>`;
}

// ---------- 小组赛模拟 ----------
function renderGroup() {
  const g = $('#groupSelect').value;
  const codes = GROUPS[g];
  const cfg = { model: $('#groupModel').value, useHome: true, weights: readWeights(), ai: aiApplyOn(), cache: new Map() };
  const RUNS = 5000;

  // 单场最可能比分（已录入真实赛果的场次显示实际比分）
  const fixtures = [];
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const A = TEAMS[codes[i]], B = TEAMS[codes[j]];
      const real = getActualResult(A.code, B.code);
      if (real) {
        fixtures.push(`
          <div class="fixture played">
            <span>${teamLabel(A)}</span>
            <span class="fs">${real[0]} : ${real[1]} <em>已赛</em></span>
            <span>${teamLabel(B)}</span>
          </div>`);
      } else {
        const r = predictMatch(A, B, cfg);
        fixtures.push(`
          <div class="fixture">
            <span>${teamLabel(A)}</span>
            <span class="fs">${r.best.a} : ${r.best.b}</span>
            <span>${teamLabel(B)}</span>
          </div>`);
      }
    }
  }

  // 蒙特卡洛：出线概率与平均积分
  const agg = {};
  for (const c of codes) agg[c] = { pts: 0, first: 0, second: 0 };
  for (let i = 0; i < RUNS; i++) {
    const table = simulateGroup(codes, cfg);
    table.forEach((row, idx) => {
      agg[row.code].pts += row.pts;
      if (idx === 0) agg[row.code].first++;
      if (idx === 1) agg[row.code].second++;
    });
  }
  const rows = codes
    .map((c) => ({
      team: TEAMS[c],
      avgPts: agg[c].pts / RUNS,
      pFirst: agg[c].first / RUNS,
      pSecond: agg[c].second / RUNS,
      pTop2: (agg[c].first + agg[c].second) / RUNS,
    }))
    .sort((a, b) => b.pTop2 - a.pTop2)
    .map((r, idx) => `
      <tr class="${idx < 2 ? 'qualified' : ''}">
        <td>${idx + 1}</td>
        <td class="team-cell">${teamLabel(r.team)}</td>
        <td class="pct">${r.avgPts.toFixed(2)}</td>
        <td class="pct">${pct(r.pFirst)}</td>
        <td class="pct">${pct(r.pSecond)}</td>
        <td class="bar-cell">
          <div class="mini-bar"><div style="width:${(r.pTop2 * 100).toFixed(1)}%"></div></div>
        </td>
        <td class="pct">${pct(r.pTop2)}</td>
      </tr>`).join('');

  $('#groupResult').innerHTML = `
    <div class="card">
      <div class="section-title">${g} 组单场最可能比分（${MODEL_INFO[cfg.model].name}）</div>
      <div class="fixtures">${fixtures.join('')}</div>
    </div>
    <div class="card">
      <div class="section-title">${g} 组出线形势（${MODEL_INFO[cfg.model].name} · 模拟 ${RUNS.toLocaleString()} 次，前二直接出线，小组第三仍有机会以最佳第三晋级）</div>
      <table class="standings">
        <tr><th>#</th><th style="text-align:left">球队</th><th>平均积分</th><th>第一</th><th>第二</th><th colspan="2">前二出线率</th></tr>
        ${rows}
      </table>
    </div>`;
}

// ---------- 全程模拟 ----------
function renderTournament() {
  const runs = parseInt($('#mcRuns').value, 10);
  const cfg = { model: $('#mcModel').value, useHome: true, weights: readWeights(), ai: aiApplyOn() };
  const btn = $('#mcBtn');
  btn.disabled = true;
  $('#mcStatus').textContent = '模拟中……';
  $('#mcResult').innerHTML = '';

  // 让浏览器先渲染状态再开始计算
  setTimeout(() => {
    const t0 = performance.now();
    const stats = monteCarlo(runs, cfg);
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

    const rows = Object.entries(stats)
      .map(([c, s]) => ({ team: TEAMS[c], s }))
      .sort((a, b) => b.s[6] - a.s[6] || b.s[5] - a.s[5] || b.s[4] - a.s[4])
      .map((r, idx) => `
        <tr class="${idx < 4 ? 'qualified' : ''}">
          <td>${idx + 1}</td>
          <td class="team-cell">${teamLabel(r.team)}</td>
          <td class="pct">${pct(r.s[1], 0)}</td>
          <td class="pct">${pct(r.s[2], 0)}</td>
          <td class="pct">${pct(r.s[3], 0)}</td>
          <td class="pct">${pct(r.s[4], 1)}</td>
          <td class="pct">${pct(r.s[5], 1)}</td>
          <td class="bar-cell">
            <div class="mini-bar"><div style="width:${Math.min(100, r.s[6] * 100 / 0.3).toFixed(1)}%"></div></div>
          </td>
          <td class="pct"><strong>${pct(r.s[6], 1)}</strong> <span class="dim">±${(1.96 * Math.sqrt(r.s[6] * (1 - r.s[6]) / runs) * 100).toFixed(1)}</span></td>
        </tr>`).join('');

    $('#mcResult').innerHTML = `
      <div class="card">
        <div class="section-title">48 队全程概率（${MODEL_INFO[cfg.model].name} · ${runs.toLocaleString()} 次完整模拟，耗时 ${elapsed}s，按夺冠概率排序）· 夺冠列含 95% 蒙特卡洛置信区间（±）</div>
        <table class="standings">
          <tr><th>#</th><th style="text-align:left">球队</th><th>小组出线</th><th>进16强</th><th>进8强</th><th>进4强</th><th>进决赛</th><th colspan="2">夺冠 (95%CI)</th></tr>
          ${rows}
        </table>
      </div>`;
    $('#mcStatus').textContent = '';
    btn.disabled = false;
  }, 50);
}

// ---------- 数据源一览 ----------
const eloMark = (s) => s === 'src'
  ? '<span class="src-ok" title="实测（Elo 源快照）">✓</span>'
  : s === 'src~' ? '<span class="src-mid" title="单一来源近似">≈</span>'
    : '<span class="src-est" title="推算：组均值 + FIFA 比例分配">~</span>';
const fifaMark = (s) => s === 'exact'
  ? '<span class="src-ok" title="官方公布积分">✓</span>'
  : '<span class="src-est" title="仅知排名，按相邻名次插值">~</span>';

function renderDataTable() {
  const rows = Object.values(TEAMS)
    .map((t) => {
      // 三源等权折算的综合 Elo 当量（含赛果动态修正，仅用于排序参考）
      const mElo = (() => {
        const pMax = Math.max(...Object.values(TEAMS).map((x) => 100 / (x.odds + 100)));
        const p = 100 / (t.odds + 100);
        return 2190 + 121 * Math.log(p / pMax);
      })();
      const fifaEq = 1500 + (t.fifa - 1500) * (1000 / 850);
      const adj = ADJ[t.code] || 0;
      const composite = (t.elo + fifaEq + mElo) / 3 + adj;
      return { t, adj, composite };
    })
    .sort((a, b) => b.composite - a.composite)
    .map(({ t, adj, composite }, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td class="team-cell">${teamLabel(t)} <span class="dim">${t.group}组${t.host ? ' · 东道主' : ''}</span></td>
        <td class="pct">${t.elo} ${eloMark(t.srcElo)}</td>
        <td class="pct">${Number.isInteger(t.fifa) ? t.fifa : t.fifa.toFixed(1)} ${fifaMark(t.srcFifa)}</td>
        <td class="pct">+${t.odds.toLocaleString()}</td>
        <td class="pct">${pct(100 / (t.odds + 100) / 100, 2)}</td>
        <td class="pct">${adj === 0 ? '—' : (adj > 0 ? '<span class="up">+' : '<span class="down">') + adj.toFixed(0) + '</span>'}</td>
        <td class="pct"><strong>${composite.toFixed(0)}</strong></td>
      </tr>`).join('');

  $('#dataTable').innerHTML = `
    <table class="standings">
      <tr><th>#</th><th style="text-align:left">球队</th><th>Elo 分</th><th>FIFA 积分</th><th>夺冠赔率</th><th>隐含夺冠率</th><th>赛果修正</th><th>综合实力</th></tr>
      ${rows}
    </table>`;

  // 数据来源与日期
  const block = (m) => `<div class="src-block"><strong>${m.label}</strong>（${m.asOf}）：${m.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>`).join(' · ')}</div>`;
  const srcCount = Object.values(TEAMS).filter((t) => t.srcElo === 'src' || t.srcElo === 'src~').length;
  const exactCount = Object.values(TEAMS).filter((t) => t.srcFifa === 'exact').length;
  const legend = Object.entries(RATINGS_META.legend).map(([k, v]) => `<span class="dim">${k} = ${v}</span>`).join('　');
  $('#dataSources').innerHTML = `
    <div class="card">
      <div class="section-title">数据来源与日期</div>
      ${block(RATINGS_META.elo)}
      ${block(RATINGS_META.fifa)}
      ${block(RATINGS_META.odds)}
      <p class="hint">实测占比：Elo ${srcCount}/48 实测，其余 ${48 - srcCount} 队为推算；FIFA ${exactCount}/48 为官方公布积分，其余 ${48 - exactCount} 队按排名插值。</p>
      <div class="src-legend">${legend}</div>
      <p class="hint">所有数值都在 <code>js/data.js</code>，可手动修改，刷新即生效。</p>
    </div>`;
}

// ---------- 实际赛果录入 ----------
function groupFixtures(g) {
  const codes = GROUPS[g];
  const list = [];
  for (let i = 0; i < codes.length; i++)
    for (let j = i + 1; j < codes.length; j++) list.push([codes[i], codes[j]]);
  return list;
}

function refreshFixtureSelect() {
  const g = $('#resGroup').value;
  const sel = $('#resFixture');
  sel.innerHTML = '';
  for (const [a, b] of groupFixtures(g)) {
    const opt = document.createElement('option');
    opt.value = a + '|' + b;
    const real = getActualResult(a, b);
    opt.textContent = `${TEAMS[a].zh} vs ${TEAMS[b].zh}` + (real ? `（已录 ${real[0]}:${real[1]}）` : '');
    sel.appendChild(opt);
  }
}

function renderResultsTab() {
  refreshFixtureSelect();

  if (RESULTS.length === 0) {
    $('#resList').innerHTML = '<p class="hint">尚未录入任何赛果。</p>';
    $('#adjList').innerHTML = '<p class="hint">录入赛果后这里会显示各队实力修正。</p>';
    return;
  }
  $('#resList').innerHTML = RESULTS.map((r, i) => `
    <div class="fixture played">
      <span>${teamLabel(TEAMS[r.a])}</span>
      <span class="fs">${r.ga} : ${r.gb}</span>
      <span>${teamLabel(TEAMS[r.b])}</span>
      <button class="del" data-i="${i}">✕</button>
    </div>`).join('') +
    '<div style="margin-top:10px"><button id="resClear" class="del-all">清空全部赛果</button></div>';

  $('#resList').querySelectorAll('.del').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeResult(parseInt(btn.dataset.i, 10));
      refreshAll();
    });
  });
  const clearBtn = $('#resClear');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    clearResults();
    refreshAll();
  });

  const adjRows = Object.entries(ADJ)
    .filter(([, v]) => Math.abs(v) >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `
      <tr>
        <td class="team-cell">${teamLabel(TEAMS[c])}</td>
        <td class="pct">${v > 0 ? '<span class="up">+' + v.toFixed(1) : '<span class="down">' + v.toFixed(1)}</span></td>
      </tr>`).join('');
  $('#adjList').innerHTML = adjRows
    ? `<table class="standings"><tr><th style="text-align:left">球队</th><th>Elo 当量修正</th></tr>${adjRows}</table>`
    : '<p class="hint">当前赛果与模型预期基本一致，没有产生明显修正。</p>';
}

function initResultsTab() {
  const gSel = $('#resGroup');
  for (const g of GROUP_NAMES) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g + ' 组';
    gSel.appendChild(opt);
  }
  gSel.addEventListener('change', refreshFixtureSelect);
  $('#resAdd').addEventListener('click', () => {
    const [a, b] = $('#resFixture').value.split('|');
    const ga = parseInt($('#resGa').value, 10);
    const gb = parseInt($('#resGb').value, 10);
    if (Number.isNaN(ga) || Number.isNaN(gb) || ga < 0 || gb < 0 || ga > 20 || gb > 20) return;
    addResult(a, b, ga, gb);
    refreshAll();
  });
}

// ---------- 投注推荐 ----------
function initBettingTab() {
  const dSel = $('#betDate');
  const today = '2026-06-14';
  for (const d of SCHEDULE_DATES) {
    const opt = document.createElement('option');
    opt.value = d;
    const n = fixturesOnDate(d).length;
    opt.textContent = `${dateLabel(d)}（${n} 场）`;
    dSel.appendChild(opt);
  }
  dSel.value = SCHEDULE_DATES.includes(today) ? today : SCHEDULE_DATES[0];

  const mSel = $('#betModel');
  for (const [k, v] of Object.entries(BET_MODELS)) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = v.label;
    mSel.appendChild(opt);
  }
  $('#betBtn').addEventListener('click', renderBetting);
}

function evTag(ev) {
  if (ev > 0.03) return `<span class="up">价值 +${(ev * 100).toFixed(1)}%</span>`;
  if (ev >= -0.02) return `<span class="dim">中性 ${(ev * 100).toFixed(1)}%</span>`;
  return `<span class="down">无价值 ${(ev * 100).toFixed(1)}%</span>`;
}

// 真实赔率覆盖（本地持久化），key = 'a|b' -> {home,draw,away}
const ODDS_KEY = 'wc2026_oddsovr';
const oddsOverrides = {};
(function loadOddsOverrides() {
  try { const raw = localStorage.getItem(ODDS_KEY); if (raw) Object.assign(oddsOverrides, JSON.parse(raw)); } catch (e) { /* ignore */ }
})();
function saveOddsOverrides() {
  try { localStorage.setItem(ODDS_KEY, JSON.stringify(oddsOverrides)); } catch (e) { /* ignore */ }
}

// 单条投注腿的展示
function legHtml(sel, kind, bankroll, matchLabel, date) {
  const frac = kind === 'safe' ? safeStakeFrac(sel.p, sel.odds) : aggrStakeFrac(sel.p, sel.odds);
  const amount = Math.round(bankroll * frac);
  const stake = frac > 0
    ? `建议投 ${(frac * 100).toFixed(1)}% 本金（约 ${amount}）`
    : '<span class="dim">无正期望，建议跳过</span>';
  const log = `<button class="mini-btn led-log" data-date="${date}" data-match="${matchLabel}" data-pick="${sel.market} ${sel.pick}" data-odds="${sel.odds.toFixed(2)}" data-stake="${amount > 0 ? amount : ''}">记台账</button>`;
  return `
    <div class="bet-pick ${kind}">
      <div class="bet-pick-main">
        <span class="bet-market">${sel.market}${sel.real ? ' · 真实赔率' : ''}</span>
        <span class="bet-sel">${sel.pick}</span>
      </div>
      <div class="bet-meta">
        赔率 <strong>${sel.odds.toFixed(2)}</strong> ·
        命中 ${pct(sel.p)} ·
        ${evTag(sel.ev)} ·
        ${stake} ${log}
      </div>
    </div>`;
}

function parlayHtml(parlay, kind, bankroll, title, date) {
  if (!parlay) {
    return `<div class="card"><div class="section-title">${title}</div><p class="hint">今日可选场次不足以组成该串票（或无合适腿）。</p></div>`;
  }
  const legs = parlay.legs.map((l) => `
    <div class="parlay-leg">
      <span>${TEAMS[l.codeA].flag}${TEAMS[l.codeA].zh} vs ${TEAMS[l.codeB].zh}${TEAMS[l.codeB].flag}</span>
      <span class="parlay-pick">${l.pick}</span>
      <span class="parlay-odds">${l.odds.toFixed(2)}</span>
    </div>`).join('');
  const frac = kind === 'safe' ? safeStakeFrac(parlay.p, parlay.odds) : aggrStakeFrac(parlay.p, parlay.odds);
  const amount = Math.round(bankroll * frac);
  const payout = Math.round(amount * parlay.odds);
  const stakeLine = frac > 0
    ? `建议投 ${(frac * 100).toFixed(1)}% 本金（约 ${amount}），命中可得约 ${payout}`
    : '理论无正期望，仅供娱乐小额尝试';
  const pickDesc = parlay.legs.map((l) => `${TEAMS[l.codeA].zh}/${TEAMS[l.codeB].zh}:${l.pick}`).join(' + ');
  const log = `<button class="mini-btn led-log" data-date="${date}" data-match="${title} ${parlay.legs.length}串" data-pick="${pickDesc}" data-odds="${parlay.odds.toFixed(2)}" data-stake="${amount > 0 ? amount : ''}">记台账</button>`;
  return `
    <div class="card parlay-card ${kind}">
      <div class="section-title">${title}（${parlay.legs.length} 串 ${parlay.legs.length}）</div>
      <div class="parlay-legs">${legs}</div>
      <div class="parlay-summary">
        总赔率 <strong>${parlay.odds.toFixed(2)}</strong> ·
        全中概率 ${pct(parlay.p)} ·
        ${evTag(parlay.ev)} ${log}
      </div>
      <div class="parlay-stake">${stakeLine}</div>
    </div>`;
}

function renderBetting() {
  const date = $('#betDate').value;
  const modelKey = $('#betModel').value;
  const bankroll = Math.max(0, parseInt($('#betBankroll').value, 10) || 0);
  const rec = recommendForDate(date, { ...BET_MODELS[modelKey].cfg, ai: aiApplyOn() }, { oddsMap: oddsOverrides });

  const matchCards = rec.matches.map((row) => {
    const f = row.fixture;
    const A = TEAMS[f.a], B = TEAMS[f.b];
    const head = `<div class="bet-head">
      <span class="bet-teams">${A.flag} ${A.zh} <span class="dim">vs</span> ${B.zh} ${B.flag}</span>
      <span class="dim">${f.group}组 · 第${f.md}轮</span>
    </div>`;
    if (row.played) {
      return `<div class="card bet-match played-match">
        ${head}
        <div class="bet-meta">已结束 · 实际比分 <strong>${row.actual[0]} : ${row.actual[1]}</strong>（不参与推荐）</div>
      </div>`;
    }
    const label = `${A.zh} vs ${B.zh}`;
    const safe = row.safe ? legHtml(row.safe, 'safe', bankroll, label, date) : '<p class="hint">无合适稳胆</p>';
    const aggr = row.aggr ? legHtml(row.aggr, 'aggr', bankroll, label, date) : '<p class="hint">无合适冲胆</p>';
    const ovr = oddsOverrides[f.a + '|' + f.b];
    const pair = f.a + '|' + f.b;
    const oddsRow = `<div class="real-odds" data-pair="${pair}">
      <span>真实赔率：</span>
      ${A.zh}<input class="ro-h" type="number" step="0.01" min="1" placeholder="主" value="${ovr ? ovr.home : ''}">
      平<input class="ro-d" type="number" step="0.01" min="1" placeholder="平" value="${ovr ? ovr.draw : ''}">
      ${B.zh}<input class="ro-a" type="number" step="0.01" min="1" placeholder="客" value="${ovr ? ovr.away : ''}">
      <button class="mini-btn odds-apply" data-pair="${pair}">用真实赔率重算</button>
      ${ovr ? `<button class="mini-btn odds-clear" data-pair="${pair}">清除</button>` : ''}
    </div>`;
    return `<div class="card bet-match">
      ${head}
      <div class="bet-cols">
        <div class="bet-col"><div class="bet-col-title safe-t">🛡 稳</div>${safe}</div>
        <div class="bet-col"><div class="bet-col-title aggr-t">🚀 冲</div>${aggr}</div>
      </div>
      ${oddsRow}
    </div>`;
  }).join('');

  const playedCount = rec.matches.filter((m) => m.played).length;
  const liveCount = rec.matches.length - playedCount;
  const summary = `<div class="card"><div class="section-title">${dateLabel(date)} · 共 ${rec.matches.length} 场（${playedCount} 场已赛，${liveCount} 场可推荐）· 估值模型：${BET_MODELS[modelKey].label}</div></div>`;

  $('#betResult').innerHTML =
    summary +
    matchCards +
    parlayHtml(rec.safeParlay, 'safe', bankroll, '🛡 当日稳串', date) +
    parlayHtml(rec.aggrParlay, 'aggr', bankroll, '🚀 当日冲串', date);
}

// 投注页的点击委托（记台账 / 真实赔率重算）
function initBettingDelegation() {
  $('#betResult').addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList.contains('led-log')) {
      addBet({ date: t.dataset.date, match: t.dataset.match, pick: t.dataset.pick,
        odds: parseFloat(t.dataset.odds) || 0, stake: parseFloat(t.dataset.stake) || 0, status: 'pending' });
      renderLedger();
      t.textContent = '✓ 已记';
      t.disabled = true;
      return;
    }
    if (t.classList.contains('odds-apply')) {
      const card = t.closest('.bet-match');
      const h = parseFloat(card.querySelector('.ro-h').value);
      const d = parseFloat(card.querySelector('.ro-d').value);
      const a = parseFloat(card.querySelector('.ro-a').value);
      if (h > 1 && d > 1 && a > 1) {
        oddsOverrides[t.dataset.pair] = { home: h, draw: d, away: a };
        saveOddsOverrides();
        renderBetting();
      }
      return;
    }
    if (t.classList.contains('odds-clear')) {
      delete oddsOverrides[t.dataset.pair];
      saveOddsOverrides();
      renderBetting();
    }
  });
}

// ---------- 实时积分榜 ----------
function renderStandings() {
  const cfg = { model: 'ensemble', useHome: true, weights: { elo: 1, fifa: 1, market: 1 }, ai: aiApplyOn(), cache: new Map() };
  const RUNS = 3000;
  const cards = GROUP_NAMES.map((g) => {
    const table = groupStandings(g);
    const agg = {};
    for (const c of GROUPS[g]) agg[c] = 0;
    for (let i = 0; i < RUNS; i++) {
      const t = simulateGroup(GROUPS[g], cfg);
      if (t[0]) agg[t[0].code]++;
      if (t[1]) agg[t[1].code]++;
    }
    const rows = table.map((r, idx) => {
      const adv = agg[r.code] / RUNS;
      const rem = remainingOpponents(r.code).map((x) => TEAMS[x].flag).join(' ') || '—';
      return `<tr class="${idx === 0 ? 'q1' : idx === 1 ? 'q2' : ''}">
        <td>${idx + 1}</td>
        <td class="team-cell">${teamLabel(TEAMS[r.code])}</td>
        <td>${r.P}</td><td>${r.W}</td><td>${r.D}</td><td>${r.L}</td>
        <td>${r.GF}:${r.GA}</td><td>${r.GD >= 0 ? '+' : ''}${r.GD}</td>
        <td><strong>${r.Pts}</strong></td>
        <td class="pct">${pct(adv, 0)}</td><td>${rem}</td>
      </tr>`;
    }).join('');
    return `<div class="card standings-group"><h3>${g} 组</h3>
      <table class="mini-standings">
        <tr><th>#</th><th style="text-align:left">球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>进:失</th><th>净</th><th>分</th><th>前二率</th><th>余赛</th></tr>
        ${rows}
      </table></div>`;
  }).join('');
  $('#standingsResult').innerHTML = cards;
}

// ---------- 回测校准 ----------
function initBacktestTab() {
  const s = $('#btModel');
  for (const [k, v] of Object.entries(BET_MODELS)) {
    const o = document.createElement('option');
    o.value = k; o.textContent = v.label;
    s.appendChild(o);
  }
  s.value = 'ensemble';
  $('#btBtn').addEventListener('click', renderBacktest);
}

function renderBacktest() {
  const key = $('#btModel').value;
  const bt = runBacktest(BET_MODELS[key].cfg);
  if (!bt) {
    $('#backtestResult').innerHTML = '<div class="card"><p class="hint">尚无已结束比赛，无法回测。请先到「实际赛果」录入比分。</p></div>';
    return;
  }
  const m = bt.model, mk = bt.market, bl = bt.baseline;
  // 每行高亮最优（lower=true 表示越低越好）
  const row = (name, get, lower, fmt) => {
    const vals = [get(m), get(mk), get(bl)];
    const best = lower ? Math.min(...vals) : Math.max(...vals);
    const cell = (v) => `<td class="pct ${v === best ? 'bt-best' : ''}">${fmt(v)}</td>`;
    return `<tr><td class="team-cell">${name}</td>${cell(vals[0])}${cell(vals[1])}${cell(vals[2])}</tr>`;
  };
  const p0 = (v) => (v * 100).toFixed(0) + '%';
  const f3 = (v) => v.toFixed(3);
  const f2 = (v) => v.toFixed(2);
  const table = `<div class="card">
    <div class="section-title">回测对比 · 样本 ${m.n} 场（${m.n < 15 ? '样本偏少，结论仅供参考' : '样本可参考'}）</div>
    <table class="standings">
      <tr><th style="text-align:left">指标</th><th>${BET_MODELS[key].short || BET_MODELS[key].label}</th><th>市场</th><th>均匀基准</th></tr>
      ${row('胜平负命中率 ↑', (x) => x.acc1x2, false, p0)}
      ${row('Brier 分数 ↓', (x) => x.brier, true, f3)}
      ${row('对数损失 ↓', (x) => x.logloss, true, f3)}
      ${row('最可能比分命中 ↑', (x) => x.exact, false, p0)}
      ${row('总进球 MAE ↓', (x) => x.goalMAE, true, f2)}
    </table>
    <p class="hint">↑ 越高越好，↓ 越低越好；绿色为三者中最优。模型在 Brier / 对数损失上低于「市场」即代表赛前预测比盘口更准。</p>
  </div>`;
  const calib = m.calib.map((b, i) => b.cnt
    ? `<div class="calib-row">
        <span class="calib-label">${i * 10}–${i * 10 + 10}%</span>
        <span class="calib-track">
          <span class="calib-obs" style="width:${(b.obsFreq * 100).toFixed(0)}%"></span>
          <span class="calib-pred" style="left:${Math.min(99, b.predMean * 100).toFixed(0)}%"></span>
        </span>
        <span class="calib-cnt">实际${(b.obsFreq * 100).toFixed(0)}% n=${b.cnt}</span>
      </div>` : '').join('');
  const calibCard = `<div class="card">
    <div class="section-title">校准曲线（${BET_MODELS[key].short || ''}）：黄线 = 模型预测概率，色条 = 实际命中频率，两者越接近越准</div>
    ${calib || '<p class="hint">暂无足够样本。</p>'}
  </div>`;
  $('#backtestResult').innerHTML = table + calibCard;
}

// ---------- 投注台账 ----------
function initLedgerTab() {
  $('#ledAdd').addEventListener('click', () => {
    const odds = parseFloat($('#ledOdds').value);
    const stake = parseFloat($('#ledStake').value);
    if (!(odds >= 1) || !(stake >= 0)) return;
    addBet({ date: '', match: $('#ledMatch').value.trim(), pick: $('#ledPick').value.trim(), odds, stake, status: 'pending' });
    $('#ledMatch').value = ''; $('#ledPick').value = '';
    renderLedger();
  });
  $('#ledgerResult').addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset.id && t.dataset.st) { setBetStatus(t.dataset.id, t.dataset.st); renderLedger(); }
    else if (t.classList.contains('led-del')) { removeBet(t.dataset.id); renderLedger(); }
    else if (t.id === 'ledClear') { if (confirm('确认清空全部台账记录？')) { clearLedger(); renderLedger(); } }
  });
}

function renderLedger() {
  const s = ledgerStats();
  const stats = `<div class="card"><div class="led-stats">
    <div class="led-stat"><div class="v">${s.count}</div><div class="k">记录数</div></div>
    <div class="led-stat"><div class="v">${s.staked.toFixed(0)}</div><div class="k">已结算投入</div></div>
    <div class="led-stat"><div class="v ${s.profit >= 0 ? 'up' : 'down'}">${s.profit >= 0 ? '+' : ''}${s.profit.toFixed(0)}</div><div class="k">盈亏</div></div>
    <div class="led-stat"><div class="v ${s.roi >= 0 ? 'up' : 'down'}">${(s.roi * 100).toFixed(1)}%</div><div class="k">ROI</div></div>
    <div class="led-stat"><div class="v">${(s.hitRate * 100).toFixed(0)}%</div><div class="k">命中率（${s.settled} 结算）</div></div>
    <div class="led-stat"><div class="v">${s.pending.toFixed(0)}</div><div class="k">待开本金</div></div>
  </div></div>`;
  if (!LEDGER.length) {
    $('#ledgerResult').innerHTML = stats + '<div class="card"><p class="hint">还没有记录。在上方手动记一笔，或在「投注推荐」页点各推荐旁的「记台账」。</p></div>';
    return;
  }
  const rows = [...LEDGER].reverse().map((b) => `<tr>
    <td class="team-cell">${b.match || '—'}<div class="dim">${b.pick || ''}</div></td>
    <td>${(+b.odds).toFixed(2)}</td>
    <td>${(+b.stake).toFixed(0)}</td>
    <td>
      <span class="badge ${b.status === 'win' ? 'win' : ''}" data-id="${b.id}" data-st="win">赢</span>
      <span class="badge ${b.status === 'lose' ? 'lose' : ''}" data-id="${b.id}" data-st="lose">输</span>
      <span class="badge ${b.status === 'pending' ? 'pending' : ''}" data-id="${b.id}" data-st="pending">待</span>
    </td>
    <td><button class="mini-btn led-del" data-id="${b.id}">删</button></td>
  </tr>`).join('');
  $('#ledgerResult').innerHTML = stats + `<div class="card">
    <table class="standings">
      <tr><th style="text-align:left">投注</th><th>赔率</th><th>本金</th><th>结果</th><th></th></tr>
      ${rows}
    </table>
    <div style="margin-top:10px"><button id="ledClear" class="del-all">清空台账</button></div>
  </div>`;
}

// ---------- AI 分析 ----------
function initAITab() {
  const pSel = $('#aiProvider');
  for (const [k, v] of Object.entries(AI_PROVIDERS)) {
    const o = document.createElement('option');
    o.value = k; o.textContent = v.label;
    pSel.appendChild(o);
  }
  pSel.value = AI_CFG.provider;
  $('#aiModel').value = AI_CFG.model || '';
  $('#aiModel').placeholder = '留空用默认：' + AI_PROVIDERS[AI_CFG.provider].defaultModel;
  $('#aiKey').value = AI_CFG.apiKey || '';
  $('#aiTavily').value = AI_CFG.tavilyKey || '';
  $('#aiCustomUrl').value = AI_CFG.customSearchUrl || '';
  $('#aiWebSource').value = AI_CFG.webSource || 'off';
  $('#aiApply').checked = aiApplyOn();
  updateAICfgState();

  const dSel = $('#aiDate');
  for (const d of SCHEDULE_DATES) {
    const o = document.createElement('option');
    o.value = d;
    o.textContent = `${dateLabel(d)}（${fixturesOnDate(d).length} 场）`;
    dSel.appendChild(o);
  }
  dSel.value = SCHEDULE_DATES.includes('2026-06-14') ? '2026-06-14' : SCHEDULE_DATES[0];

  pSel.addEventListener('change', () => {
    AI_CFG.provider = pSel.value;
    saveAICfg();
    $('#aiModel').placeholder = '留空用默认：' + AI_PROVIDERS[pSel.value].defaultModel;
    updateAICfgState();
  });
  dSel.addEventListener('change', () => { refreshManFixtures(); renderAI(); });
  $('#aiSave').addEventListener('click', () => {
    AI_CFG.provider = pSel.value;
    AI_CFG.model = $('#aiModel').value.trim();
    AI_CFG.apiKey = $('#aiKey').value.trim();
    AI_CFG.tavilyKey = $('#aiTavily').value.trim();
    AI_CFG.customSearchUrl = $('#aiCustomUrl').value.trim();
    saveAICfg();
    updateAICfgState();
  });
  $('#aiWebSource').addEventListener('change', () => { AI_CFG.webSource = $('#aiWebSource').value; saveAICfg(); updateAICfgState(); });
  $('#aiCustomUrl').addEventListener('change', () => { AI_CFG.customSearchUrl = $('#aiCustomUrl').value.trim(); saveAICfg(); updateAICfgState(); });
  $('#aiApply').addEventListener('change', () => { setAIApply($('#aiApply').checked); refreshAll(); renderAI(); });
  $('#aiAnalyzeDay').addEventListener('click', analyzeDay);
  $('#aiClear').addEventListener('click', () => {
    if (confirm('确认清空全部 AI 分析？')) { clearAssessments(); renderAI(); refreshAll(); }
  });
  $('#aiManAdd').addEventListener('click', addManualAssessment);
  refreshManFixtures();
}

function aiWebStatus() {
  const src = AI_CFG.webSource || 'off';
  const isOR = (AI_PROVIDERS[AI_CFG.provider] || {}).builtinWeb;
  if (src === 'off') return '';
  if (src === 'wiki') return ' · <span class="up">检索：维基(自制免Key)</span>';
  if (src === 'custom') return AI_CFG.customSearchUrl
    ? ' · <span class="up">检索：自定义端点</span>' : ' · <span class="down">自定义检索缺 URL</span>';
  if (src === 'tavily') return AI_CFG.tavilyKey
    ? ' · <span class="up">检索：Tavily</span>' : ' · <span class="down">Tavily 缺 Key</span>';
  if (src === 'openrouter') return isOR
    ? ' · <span class="up">检索：OpenRouter 自带</span>' : ' · <span class="down">该来源仅在选 OpenRouter 时可用</span>';
  return '';
}
function updateAICfgState() {
  const ok = !!AI_CFG.apiKey;
  $('#aiCfgState').innerHTML = (ok
    ? `<span class="up">已配置 ${AI_PROVIDERS[AI_CFG.provider].label}</span>`
    : '<span class="down">未配置 Key（可用下方手动录入）</span>') + aiWebStatus();
}

function refreshManFixtures() {
  const sel = $('#aiManFixture');
  if (!sel) return;
  sel.innerHTML = '';
  for (const f of fixturesOnDate($('#aiDate').value)) {
    const o = document.createElement('option');
    o.value = f.a + '|' + f.b;
    o.textContent = `${TEAMS[f.a].zh} vs ${TEAMS[f.b].zh}`;
    sel.appendChild(o);
  }
}

async function analyzeDay() {
  const date = $('#aiDate').value;
  const ctx = $('#aiContext').value.trim();
  const fixtures = fixturesOnDate(date).filter((f) => !getActualResult(f.a, f.b));
  if (!fixtures.length) { $('#aiStatus').textContent = '该日没有未赛场次'; return; }
  if (!AI_CFG.apiKey) { $('#aiStatus').innerHTML = '<span class="down">请先保存 API Key，或用下方手动录入</span>'; return; }
  const btn = $('#aiAnalyzeDay');
  btn.disabled = true;
  let done = 0;
  const webTag = (AI_CFG.webSource && AI_CFG.webSource !== 'off') ? '（含检索）' : '';
  for (const f of fixtures) {
    $('#aiStatus').textContent = `分析中${webTag} ${done + 1}/${fixtures.length}：${TEAMS[f.a].zh} vs ${TEAMS[f.b].zh}……`;
    try {
      await analyzeMatch(f, ctx);
    } catch (e) {
      $('#aiStatus').innerHTML = `<span class="down">出错：${e.message}</span>`;
      btn.disabled = false;
      renderAI();
      return;
    }
    done++;
    renderAI();
  }
  $('#aiStatus').innerHTML = `<span class="up">完成 ${done} 场分析</span>`;
  btn.disabled = false;
  refreshAll();
}

function addManualAssessment() {
  const [a, b] = $('#aiManFixture').value.split('|');
  const f = SCHEDULE.find((m) => m.a === a && m.b === b);
  if (!f) return;
  setManualAssessment(f, {
    summary: '手动录入',
    homeGoalMult: parseFloat($('#aiManHome').value) || 1,
    awayGoalMult: parseFloat($('#aiManAway').value) || 1,
    homeMotivation: 0.5, awayMotivation: 0.5,
    fixRisk: parseFloat($('#aiManRisk').value) || 0,
    fixScores: [{ a: parseInt($('#aiManSa').value, 10) || 0, b: parseInt($('#aiManSb').value, 10) || 0, weight: 1 }],
    keyFactors: ['手动设定'], confidence: 0.5,
  });
  renderAI();
  refreshAll();
}

function renderAI() {
  const date = $('#aiDate').value;
  const fixtures = fixturesOnDate(date);
  const cards = fixtures.map((f) => {
    const A = TEAMS[f.a], B = TEAMS[f.b];
    const head = `<div class="bet-head">
      <span class="bet-teams">${A.flag} ${A.zh} <span class="dim">vs</span> ${B.zh} ${B.flag}</span>
      <span class="dim">${f.group}组 · 第${f.md}轮</span>
    </div>`;
    const real = getActualResult(f.a, f.b);
    if (real) {
      return `<div class="card ai-card"><div class="bet-head">
        <span class="bet-teams">${A.flag} ${A.zh} vs ${B.zh} ${B.flag}</span>
        <span class="dim">${f.group}组 · 已结束 ${real[0]}:${real[1]}</span></div></div>`;
    }
    const as = getAIAssessment(f.a, f.b);
    const base = predictMatch(A, B, { model: 'ensemble', useHome: true, dc: true, ai: false });
    if (!as) {
      return `<div class="card ai-card">${head}
        <div class="ai-meta">尚未分析。基础最可能比分 ${base.best.a}:${base.best.b}（${A.zh}胜${(base.probs.win * 100).toFixed(0)}% / 平${(base.probs.draw * 100).toFixed(0)}% / ${B.zh}胜${(base.probs.loss * 100).toFixed(0)}%）</div>
      </div>`;
    }
    const adj = predictMatch(A, B, { model: 'ensemble', useHome: true, dc: true, ai: true });
    const factors = as.keyFactors.length ? `<ul class="ai-factors">${as.keyFactors.map((x) => `<li>${x}</li>`).join('')}</ul>` : '';
    const srcs = (as.sources && as.sources.length)
      ? `<div class="ai-meta">🌐 联网来源：${as.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.title || s.url}</a>`).join(' · ')}</div>` : '';
    return `<div class="card ai-card has-assess">
      ${head}
      <div class="ai-summary">🤖 ${as.summary || '（无摘要）'} <span class="ai-tag">${as.provider === 'manual' ? '手动' : as.provider}${as.web ? ' · 联网' : ''}</span></div>
      ${factors}
      ${srcs}
      <div class="ai-row">
        <span>动机 ${A.zh} ${(as.homeMotivation * 100).toFixed(0)}% · ${B.zh} ${(as.awayMotivation * 100).toFixed(0)}%</span>
        <span>进球系数 ${as.homeGoalMult.toFixed(2)} / ${as.awayGoalMult.toFixed(2)}</span>
      </div>
      <div class="ai-row">
        <span>假球/默契风险 ${(as.fixRisk * 100).toFixed(0)}%</span>
        <span class="risk-meter"><div style="width:${(as.fixRisk * 100).toFixed(0)}%"></div></span>
      </div>
      <div class="ai-cmp">
        <div class="box"><div class="t">基础预测</div><div class="s">${base.best.a} : ${base.best.b}</div><div class="ai-meta">${A.zh}胜${(base.probs.win * 100).toFixed(0)}% 平${(base.probs.draw * 100).toFixed(0)}% ${B.zh}胜${(base.probs.loss * 100).toFixed(0)}%</div></div>
        <div class="box adj"><div class="t">AI 调整后</div><div class="s">${adj.best.a} : ${adj.best.b}</div><div class="ai-meta">${A.zh}胜${(adj.probs.win * 100).toFixed(0)}% 平${(adj.probs.draw * 100).toFixed(0)}% ${B.zh}胜${(adj.probs.loss * 100).toFixed(0)}%</div></div>
      </div>
      <div style="margin-top:10px"><button class="mini-btn ai-del" data-a="${f.a}" data-b="${f.b}">删除该分析</button></div>
    </div>`;
  }).join('');
  const applyNote = aiApplyOn()
    ? '<span class="up">已开启：AI 调整正作用于所有预测/模拟/投注</span>'
    : '<span class="dim">未开启应用：以下仅为预览，不影响其它页面</span>';
  $('#aiResult').innerHTML = `<div class="card"><div class="section-title">${dateLabel(date)} · 共 ${fixtures.length} 场 · 已分析 ${assessmentCount()} 场 · ${applyNote}</div></div>` + cards;

  $('#aiResult').querySelectorAll('.ai-del').forEach((btn) => {
    btn.addEventListener('click', () => { removeAssessment(btn.dataset.a, btn.dataset.b); renderAI(); refreshAll(); });
  });
}

// ---------- 淘汰赛预测 ----------
function koTieHtml(id, st, cfg) {
  const [a, b] = st.teams[id];
  if (!a || !b) {
    return `<div class="ko-tie tbd"><span class="dim">M${id}：待定（取决于上一轮结果）</span></div>`;
  }
  const A = TEAMS[a], B = TEAMS[b];
  const res = getKoOutcome(a, b);
  if (res) {
    const wn = res.winner === a ? A : B;
    return `<div class="ko-tie done">
      <span>${A.flag} ${A.zh} <strong>${res.ga} : ${res.gb}</strong> ${B.zh} ${B.flag}${res.ga === res.gb ? '（点球）' : ''}</span>
      <span class="ko-win">✓ ${wn.flag} ${wn.zh} 晋级</span>
      <button class="mini-btn ko-undo" data-a="${a}" data-b="${b}">撤销</button>
    </div>`;
  }
  const p = koPredict(a, b, cfg);
  return `<div class="ko-tie">
    <div class="ko-line">
      <span class="ko-team">${A.flag} ${A.zh}</span>
      <span class="ko-score">${p.best.a} : ${p.best.b}</span>
      <span class="ko-team">${B.zh} ${B.flag}</span>
    </div>
    <div class="ai-meta">晋级概率（含加时/点球）：${A.zh} ${(p.advanceA * 100).toFixed(0)}% · ${B.zh} ${(p.advanceB * 100).toFixed(0)}%</div>
    <div class="ko-entry">
      <input class="score-input ko-ga" type="number" min="0" max="20" value="${p.best.a}" style="width:50px">:
      <input class="score-input ko-gb" type="number" min="0" max="20" value="${p.best.b}" style="width:50px">
      <select class="ko-winner">
        <option value="${a}"${p.advanceA >= p.advanceB ? ' selected' : ''}>${A.zh} 晋级</option>
        <option value="${b}"${p.advanceB > p.advanceA ? ' selected' : ''}>${B.zh} 晋级</option>
      </select>
      <button class="mini-btn ko-save" data-a="${a}" data-b="${b}">录入</button>
    </div>
  </div>`;
}

function renderKnockout() {
  const cfg = { ai: aiApplyOn() };
  const q = koQualifiers();
  const st = koBracketState(q);
  const note = q.complete
    ? '<span class="up">小组赛已完成 · 下为真实对阵</span>'
    : '<span class="down">小组赛未全部结束 · 下为按当前积分的临时投影</span>';

  // 32 强名单（12 组各前 2 名 = 24，+ 8 个最佳第三 = 32）
  const qualList = GROUP_NAMES.map((g) =>
    `<span class="qual-g">${g}组</span> ${TEAMS[q.winners[g]].flag}${TEAMS[q.winners[g]].zh}<span class="dim">①</span> · ${TEAMS[q.runners[g]].flag}${TEAMS[q.runners[g]].zh}<span class="dim">②</span>`).join('　');
  const thirdList = q.bestThirds.map((t) => `${TEAMS[t.code].flag}${TEAMS[t.code].zh}<span class="dim">(${t.group})</span>`).join('、');
  const total = Object.keys(q.winners).length + Object.keys(q.runners).length + q.bestThirds.length;
  const qualCard = `<div class="card">
    <div class="section-title">进入淘汰赛的 ${total} 支球队（12 组各前 2 名 24 队 + 8 个最佳第三）</div>
    <div class="qual-list">${qualList}</div>
    <div class="qual-thirds"><strong>最佳第三（8）：</strong>${thirdList}</div>
  </div>`;

  // 小组赛已完成 → 固定 32 强签表只模拟淘汰赛（恰好 32 支）；未完成 → 全程模拟（投影）
  const stats = q.complete
    ? koMonteCarlo(6000, { ai: aiApplyOn() })
    : monteCarlo(5000, { model: 'ensemble', useHome: true, ai: aiApplyOn() });
  const oddsList = Object.entries(stats).map(([c, s]) => ({ c, s }))
    .filter((x) => x.s[1] > 0.0005)
    .sort((a, b) => b.s[6] - a.s[6] || b.s[1] - a.s[1]);
  const oddsRows = oddsList.map((x, i) => `<tr>
      <td>${i + 1}</td><td class="team-cell">${teamLabel(TEAMS[x.c])}</td>
      <td class="pct">${pct(x.s[1], 0)}</td>
      <td class="pct">${pct(x.s[2], 0)}</td><td class="pct">${pct(x.s[3], 0)}</td>
      <td class="pct">${pct(x.s[4], 1)}</td><td class="pct">${pct(x.s[5], 1)}</td>
      <td class="pct"><strong>${pct(x.s[6], 1)}</strong></td></tr>`).join('');

  const idsByRound = [
    ['r32', R32_TEMPLATE.map((m) => m.id)],
    ['r16', [89, 90, 91, 92, 93, 94, 95, 96]],
    ['qf', [97, 98, 99, 100]],
    ['sf', [101, 102]],
    ['third', [103]],
    ['fin', [104]],
  ];
  const roundHtml = idsByRound.map(([rk, ids]) =>
    `<div class="card"><div class="section-title">${KO_ROUND_LABEL[rk]}</div>${ids.map((id) => koTieHtml(id, st, cfg)).join('')}</div>`).join('');

  $('#koResult').innerHTML =
    `<div class="card"><div class="section-title">${note} · 已录入淘汰赛结果 ${koResultCount()} 场${aiApplyOn() ? ' · AI 调整已应用' : ''}</div></div>` +
    qualCard +
    `<div class="card"><div class="section-title">夺冠与晋级概率（蒙特卡洛 5000 次 · 已结合所有已录入赛果 · 共 ${oddsList.length} 支在淘汰赛行列）</div>
      <table class="standings"><tr><th>#</th><th style="text-align:left">球队</th><th>进淘汰赛<br>(32强)</th><th>进16强</th><th>进8强</th><th>进4强</th><th>进决赛</th><th>夺冠</th></tr>${oddsRows}</table></div>` +
    roundHtml;
}

function initKnockoutTab() {
  $('#koBtn').addEventListener('click', renderKnockout);
  $('#koClear').addEventListener('click', () => {
    if (confirm('确认清空全部淘汰赛结果？')) { clearKoResults(); renderKnockout(); refreshAll(); }
  });
  $('#koResult').addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList.contains('ko-save')) {
      const tie = t.closest('.ko-tie');
      const ga = parseInt(tie.querySelector('.ko-ga').value, 10);
      const gb = parseInt(tie.querySelector('.ko-gb').value, 10);
      const winner = tie.querySelector('.ko-winner').value;
      if (Number.isNaN(ga) || Number.isNaN(gb) || ga < 0 || gb < 0) return;
      setKoResult(t.dataset.a, t.dataset.b, ga, gb, winner);
      renderKnockout(); refreshAll();
    } else if (t.classList.contains('ko-undo')) {
      removeKoResult(t.dataset.a, t.dataset.b);
      renderKnockout(); refreshAll();
    }
  });
}

// 赛果变化后刷新所有视图
function refreshAll() {
  recomputeForm();
  renderResultsTab();
  renderDataTable();
  renderMatch();
  if ($('#betResult').innerHTML.trim()) renderBetting();
  if ($('#standingsResult').innerHTML.trim()) renderStandings();
  if ($('#backtestResult').innerHTML.trim()) renderBacktest();
  if ($('#koResult').innerHTML.trim()) renderKnockout();
}

// ---------- 绑定 ----------
initSelectors();
initResultsTab();
initBettingTab();
initBettingDelegation();
initBacktestTab();
initLedgerTab();
initAITab();
initKnockoutTab();
recomputeAdjustments();
recomputeForm();
$('#formToggle').checked = formOn();
$('#formToggle').addEventListener('change', () => { setFormOn($('#formToggle').checked); refreshAll(); });
$('#predictBtn').addEventListener('click', renderMatch);
$('#groupBtn').addEventListener('click', renderGroup);
$('#mcBtn').addEventListener('click', renderTournament);
$('#standingsBtn').addEventListener('click', renderStandings);
renderMatch();
renderDataTable();
renderResultsTab();
renderBetting();
renderLedger();
renderAI();
