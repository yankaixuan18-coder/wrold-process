// 实际赛果录入与动态实力修正
// 录入的真实比分有两个作用：
//   1. 已赛场次在小组赛/全程模拟中直接使用真实比分，不再随机
//   2. 按 Elo 更新公式（K=50，含净胜球放大系数）对各队实力做
//      贝叶斯式动态修正，修正量 ADJ 叠加到所有模型的实力差上
const STORAGE_KEY = 'wc2026_results';

const RESULTS = [];          // [{a, b, ga, gb}] 按录入顺序
const ADJ = {};              // code -> Elo 当量修正值
const RESULT_MAP = {};       // 'A|B' -> [ga, gb]（含反向键）

function loadResults() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // 首次访问：导入官方已赛比分（来自 schedule.js）
      if (typeof RESULTS_SEED !== 'undefined') {
        for (const r of RESULTS_SEED) {
          if (TEAMS[r.a] && TEAMS[r.b]) RESULTS.push(r);
        }
        saveResults();
      }
      return;
    }
    for (const r of JSON.parse(raw)) {
      if (TEAMS[r.a] && TEAMS[r.b]) RESULTS.push(r);
    }
  } catch (e) { /* localStorage 不可用时静默忽略 */ }
}

function saveResults() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(RESULTS));
  } catch (e) { /* ignore */ }
}

function rebuildResultMap() {
  for (const k of Object.keys(RESULT_MAP)) delete RESULT_MAP[k];
  for (const r of RESULTS) {
    RESULT_MAP[r.a + '|' + r.b] = [r.ga, r.gb];
    RESULT_MAP[r.b + '|' + r.a] = [r.gb, r.ga];
  }
}

function getActualResult(a, b) {
  return RESULT_MAP[a + '|' + b] || null;
}

// 录入（同一对阵重复录入则覆盖）
function addResult(a, b, ga, gb) {
  const idx = RESULTS.findIndex(
    (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  if (idx >= 0) RESULTS.splice(idx, 1);
  RESULTS.push({ a, b, ga, gb });
  saveResults();
  recomputeAdjustments();
}

function removeResult(i) {
  RESULTS.splice(i, 1);
  saveResults();
  recomputeAdjustments();
}

function clearResults() {
  RESULTS.length = 0;
  saveResults();
  recomputeAdjustments();
}

// 单场 Elo 当量更新量（A 视角，B 取相反数）。
// delta = K × G × (实际得分 - 预期得分)，G 为净胜球放大系数。
// 预期值用集成实力差（含调用时 ADJ 的累计状态与东道主主场）。
const ELO_K = 50;
function eloDelta(A, B, ga, gb) {
  const d = strengthDiff(A, B, { model: 'ensemble', useHome: true });
  const we = 1 / (1 + Math.pow(10, -d / 400));
  const w = ga > gb ? 1 : ga === gb ? 0.5 : 0;
  const margin = Math.abs(ga - gb);
  const g = margin <= 1 ? 1 : margin === 2 ? 1.5 : (11 + margin) / 8;
  return ELO_K * g * (w - we);
}

// 按录入顺序回放全部赛果，逐场做 Elo 更新
function recomputeAdjustments() {
  for (const k of Object.keys(ADJ)) delete ADJ[k];
  rebuildResultMap();
  for (const r of RESULTS) {
    const delta = eloDelta(TEAMS[r.a], TEAMS[r.b], r.ga, r.gb);
    ADJ[r.a] = (ADJ[r.a] || 0) + delta;
    ADJ[r.b] = (ADJ[r.b] || 0) - delta;
  }
}

// 赛果按官方赛程日期排序（用于回测的时序回放，避免未来信息泄漏）。
// 找不到对应赛程的赛果排到最后，保持相对顺序。
function chronoResults() {
  const dateOf = {};
  if (typeof SCHEDULE !== 'undefined') {
    for (const m of SCHEDULE) {
      dateOf[m.a + '|' + m.b] = m.date;
      dateOf[m.b + '|' + m.a] = m.date;
    }
  }
  return RESULTS
    .map((r, i) => ({ r, i, date: dateOf[r.a + '|' + r.b] || '9999-12-31' }))
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.i - y.i))
    .map((o) => o.r);
}

loadResults();
rebuildResultMap();
