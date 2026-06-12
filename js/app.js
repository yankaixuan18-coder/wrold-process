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

  if (A.code === B.code) {
    $('#matchResult').innerHTML = '<div class="card"><p>请选择两支不同的球队 😅</p></div>';
    return;
  }

  const r = predictMatch(A, B, { knockout, useHome });
  const { probs, top, best } = r;

  let advanceHtml = '';
  if (knockout) {
    advanceHtml = `<div class="advance-note">含加时与点球的晋级概率：${teamLabel(A)} ${pct(r.advanceA)} ｜ ${teamLabel(B)} ${pct(r.advanceB)}</div>`;
  }

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
      <div class="score-note">最可能比分（概率 ${pct(best.p)}）· 预期进球 ${r.lamA.toFixed(2)} : ${r.lamB.toFixed(2)}</div>
      ${advanceHtml}
    </div>
    <div class="card">
      <div class="section-title">90 分钟胜平负概率</div>
      <div class="prob-bar">
        <div class="prob-win" style="flex:${probs.win}">${A.zh}胜 ${pct(probs.win)}</div>
        <div class="prob-draw" style="flex:${probs.draw}">平 ${pct(probs.draw)}</div>
        <div class="prob-loss" style="flex:${probs.loss}">${B.zh}胜 ${pct(probs.loss)}</div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">最可能的 6 个比分</div>
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
  const useHome = true;
  const RUNS = 5000;

  // 单场最可能比分
  const fixtures = [];
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const A = TEAMS[codes[i]], B = TEAMS[codes[j]];
      const r = predictMatch(A, B, { useHome });
      fixtures.push(`
        <div class="fixture">
          <span>${teamLabel(A)}</span>
          <span class="fs">${r.best.a} : ${r.best.b}</span>
          <span>${teamLabel(B)}</span>
        </div>`);
    }
  }

  // 蒙特卡洛：出线概率与平均积分
  const agg = {};
  for (const c of codes) agg[c] = { pts: 0, first: 0, second: 0 };
  for (let i = 0; i < RUNS; i++) {
    const table = simulateGroup(codes, useHome);
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
      <div class="section-title">${g} 组单场最可能比分</div>
      <div class="fixtures">${fixtures.join('')}</div>
    </div>
    <div class="card">
      <div class="section-title">${g} 组出线形势（模拟 ${RUNS.toLocaleString()} 次，前二直接出线，小组第三仍有机会以最佳第三晋级）</div>
      <table class="standings">
        <tr><th>#</th><th style="text-align:left">球队</th><th>平均积分</th><th>第一</th><th>第二</th><th colspan="2">前二出线率</th></tr>
        ${rows}
      </table>
    </div>`;
}

// ---------- 全程模拟 ----------
function renderTournament() {
  const runs = parseInt($('#mcRuns').value, 10);
  const btn = $('#mcBtn');
  btn.disabled = true;
  $('#mcStatus').textContent = '模拟中……';
  $('#mcResult').innerHTML = '';

  // 让浏览器先渲染状态再开始计算
  setTimeout(() => {
    const t0 = performance.now();
    const stats = monteCarlo(runs, true);
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
            <div class="mini-bar"><div style="width:${Math.min(100, r.s[6] * 100 / 0.3 * 1).toFixed(1)}%"></div></div>
          </td>
          <td class="pct"><strong>${pct(r.s[6], 1)}</strong></td>
        </tr>`).join('');

    $('#mcResult').innerHTML = `
      <div class="card">
        <div class="section-title">48 队全程概率（${runs.toLocaleString()} 次完整模拟，耗时 ${elapsed}s，按夺冠概率排序）</div>
        <table class="standings">
          <tr><th>#</th><th style="text-align:left">球队</th><th>小组出线</th><th>进16强</th><th>进8强</th><th>进4强</th><th>进决赛</th><th colspan="2">夺冠</th></tr>
          ${rows}
        </table>
      </div>`;
    $('#mcStatus').textContent = '';
    btn.disabled = false;
  }, 50);
}

// ---------- 绑定 ----------
initSelectors();
$('#predictBtn').addEventListener('click', renderMatch);
$('#groupBtn').addEventListener('click', renderGroup);
$('#mcBtn').addEventListener('click', renderTournament);
renderMatch();
