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
    $('#tab-' + btn.dataset.tab).classList.add('active');
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
  const results = {};
  for (const m of ['elo', 'fifa', 'market', 'ensemble']) {
    results[m] = predictMatch(A, B, { model: m, knockout, useHome, dc, weights });
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
  const cfg = { model: $('#groupModel').value, useHome: true, weights: readWeights(), cache: new Map() };
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
  const cfg = { model: $('#mcModel').value, useHome: true, weights: readWeights() };
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
          <td class="pct"><strong>${pct(r.s[6], 1)}</strong></td>
        </tr>`).join('');

    $('#mcResult').innerHTML = `
      <div class="card">
        <div class="section-title">48 队全程概率（${MODEL_INFO[cfg.model].name} · ${runs.toLocaleString()} 次完整模拟，耗时 ${elapsed}s，按夺冠概率排序）</div>
        <table class="standings">
          <tr><th>#</th><th style="text-align:left">球队</th><th>小组出线</th><th>进16强</th><th>进8强</th><th>进4强</th><th>进决赛</th><th colspan="2">夺冠</th></tr>
          ${rows}
        </table>
      </div>`;
    $('#mcStatus').textContent = '';
    btn.disabled = false;
  }, 50);
}

// ---------- 数据源一览 ----------
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
        <td class="pct">${t.elo}</td>
        <td class="pct">${t.fifa}</td>
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

// 单条投注腿的展示
function legHtml(sel, kind, bankroll) {
  const frac = kind === 'safe' ? safeStakeFrac(sel.p, sel.odds) : aggrStakeFrac(sel.p, sel.odds);
  const amount = Math.round(bankroll * frac);
  const stake = frac > 0
    ? `建议投 ${(frac * 100).toFixed(1)}% 本金（约 ${amount}）`
    : '<span class="dim">无正期望，建议跳过</span>';
  return `
    <div class="bet-pick ${kind}">
      <div class="bet-pick-main">
        <span class="bet-market">${sel.market}</span>
        <span class="bet-sel">${sel.pick}</span>
      </div>
      <div class="bet-meta">
        赔率 <strong>${sel.odds.toFixed(2)}</strong> ·
        命中 ${pct(sel.p)} ·
        ${evTag(sel.ev)} ·
        ${stake}
      </div>
    </div>`;
}

function parlayHtml(parlay, kind, bankroll, title) {
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
  return `
    <div class="card parlay-card ${kind}">
      <div class="section-title">${title}（${parlay.legs.length} 串 ${parlay.legs.length}）</div>
      <div class="parlay-legs">${legs}</div>
      <div class="parlay-summary">
        总赔率 <strong>${parlay.odds.toFixed(2)}</strong> ·
        全中概率 ${pct(parlay.p)} ·
        ${evTag(parlay.ev)}
      </div>
      <div class="parlay-stake">${stakeLine}</div>
    </div>`;
}

function renderBetting() {
  const date = $('#betDate').value;
  const modelKey = $('#betModel').value;
  const bankroll = Math.max(0, parseInt($('#betBankroll').value, 10) || 0);
  const rec = recommendForDate(date, BET_MODELS[modelKey].cfg);

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
    const safe = row.safe ? legHtml(row.safe, 'safe', bankroll) : '<p class="hint">无合适稳胆</p>';
    const aggr = row.aggr ? legHtml(row.aggr, 'aggr', bankroll) : '<p class="hint">无合适冲胆</p>';
    return `<div class="card bet-match">
      ${head}
      <div class="bet-cols">
        <div class="bet-col"><div class="bet-col-title safe-t">🛡 稳</div>${safe}</div>
        <div class="bet-col"><div class="bet-col-title aggr-t">🚀 冲</div>${aggr}</div>
      </div>
    </div>`;
  }).join('');

  const playedCount = rec.matches.filter((m) => m.played).length;
  const liveCount = rec.matches.length - playedCount;
  const summary = `<div class="card"><div class="section-title">${dateLabel(date)} · 共 ${rec.matches.length} 场（${playedCount} 场已赛，${liveCount} 场可推荐）· 估值模型：${BET_MODELS[modelKey].label}</div></div>`;

  $('#betResult').innerHTML =
    summary +
    matchCards +
    parlayHtml(rec.safeParlay, 'safe', bankroll, '🛡 当日稳串') +
    parlayHtml(rec.aggrParlay, 'aggr', bankroll, '🚀 当日冲串');
}

// 赛果变化后刷新所有视图
function refreshAll() {
  renderResultsTab();
  renderDataTable();
  renderMatch();
  if ($('#betResult').innerHTML.trim()) renderBetting();
}

// ---------- 绑定 ----------
initSelectors();
initResultsTab();
initBettingTab();
recomputeAdjustments();
$('#predictBtn').addEventListener('click', renderMatch);
$('#groupBtn').addEventListener('click', renderGroup);
$('#mcBtn').addEventListener('click', renderTournament);
renderMatch();
renderDataTable();
renderResultsTab();
renderBetting();
