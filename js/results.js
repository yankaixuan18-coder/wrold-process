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

// 按录入顺序回放全部赛果，逐场做 Elo 更新
// delta = K × G × (实际得分 - 预期得分)，G 为净胜球放大系数
function recomputeAdjustments() {
  for (const k of Object.keys(ADJ)) delete ADJ[k];
  rebuildResultMap();
  const K = 50;
  for (const r of RESULTS) {
    const A = TEAMS[r.a], B = TEAMS[r.b];
    // 预期值用集成实力差（含此前赛果的累计修正与东道主主场）
    const d = strengthDiff(A, B, { model: 'ensemble', useHome: true });
    const we = 1 / (1 + Math.pow(10, -d / 400));
    const w = r.ga > r.gb ? 1 : r.ga === r.gb ? 0.5 : 0;
    const margin = Math.abs(r.ga - r.gb);
    const g = margin <= 1 ? 1 : margin === 2 ? 1.5 : (11 + margin) / 8;
    const delta = K * g * (w - we);
    ADJ[r.a] = (ADJ[r.a] || 0) + delta;
    ADJ[r.b] = (ADJ[r.b] || 0) - delta;
  }
}

loadResults();
rebuildResultMap();
