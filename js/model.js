// 多模型预测引擎
// 三个独立模型把各自的数据源换算成「Elo 当量分差」，再统一走
// 泊松分布生成比分概率；集成模型对三者的分差做加权平均。
//
//   elo    : Elo 实力分直接相减
//   fifa   : FIFA 官方积分差 × 换算系数（FIFA 分差对强弱的区分度略低）
//   market : 由夺冠赔率的隐含概率反推实力（对数尺度），赔率已包含
//            主场、伤病、阵容等市场信息，因此不再叠加主场加成
const HOME_BONUS = 75;        // 东道主（美/加/墨）的主场 Elo 加成
const BASE_GOALS = 1.38;      // 双方实力相当时单队预期进球
const MAX_GOALS = 8;          // 比分矩阵计算到 8 球
const FIFA_SCALE = 1000 / 850; // FIFA 积分差 → Elo 当量
const MARKET_B = 121;          // ln(隐含夺冠概率) → Elo 当量
const MARKET_TOP = 2190;       // 市场头号热门锚定的 Elo 当量
const DC_RHO = -0.13;          // Dixon-Coles 低比分相关性参数（负值提升 0:0 / 1:1 概率）

const MODEL_INFO = {
  elo: { name: 'Elo 模型', short: 'Elo' },
  fifa: { name: 'FIFA 排名模型', short: 'FIFA' },
  market: { name: '市场赔率模型', short: '赔率' },
  ensemble: { name: '集成模型', short: '集成' },
};
const DEFAULT_WEIGHTS = { elo: 1, fifa: 1, market: 1 };

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

// 美式赔率 → 隐含夺冠概率（未去除抽水，只用于相对比较）
function impliedProb(odds) { return 100 / (odds + 100); }

// 把夺冠赔率折算成 Elo 当量（以全场最热门球队为锚点）
let _marketCache = null;
function marketElo(team) {
  if (!_marketCache) {
    const pMax = Math.max(...Object.values(TEAMS).map((t) => impliedProb(t.odds)));
    _marketCache = {};
    for (const t of Object.values(TEAMS)) {
      _marketCache[t.code] = MARKET_TOP + MARKET_B * Math.log(impliedProb(t.odds) / pMax);
    }
  }
  return _marketCache[team.code];
}

// 单一模型给出的 Elo 当量分差（A 相对 B）
function modelDiff(modelId, A, B, useHome) {
  const host = (t) => (useHome && t.host ? HOME_BONUS : 0);
  switch (modelId) {
    case 'elo':
      return (A.elo + host(A)) - (B.elo + host(B));
    case 'fifa':
      return (A.fifa - B.fifa) * FIFA_SCALE + host(A) - host(B);
    case 'market':
      return marketElo(A) - marketElo(B);
    default:
      throw new Error('未知模型: ' + modelId);
  }
}

function ensembleDiff(A, B, useHome, weights) {
  const w = weights || DEFAULT_WEIGHTS;
  const total = w.elo + w.fifa + w.market || 1;
  return (
    w.elo * modelDiff('elo', A, B, useHome) +
    w.fifa * modelDiff('fifa', A, B, useHome) +
    w.market * modelDiff('market', A, B, useHome)
  ) / total;
}

// cfg: { model: 'ensemble'|'elo'|'fifa'|'market', useHome: true, weights: {...}, dc: true }
// 实际赛果产生的动态修正 ADJ（见 results.js）叠加在所有模型上
function strengthDiff(A, B, cfg = {}) {
  const { model = 'ensemble', useHome = true, weights, ignoreAdj = false } = cfg;
  const base = model === 'ensemble'
    ? ensembleDiff(A, B, useHome, weights)
    : modelDiff(model, A, B, useHome);
  // 赛果动态修正：投注模块的「庄家盘口」用 ignoreAdj 保持赛前市场不变，
  // 我方估计则吸收赛果，从而在球队超/欠预期时形成价值
  const adj = (!ignoreAdj && typeof ADJ !== 'undefined')
    ? (ADJ[A.code] || 0) - (ADJ[B.code] || 0)
    : 0;
  return base + adj;
}

// Elo 当量分差 → 双方预期进球数
function matchLambdas(A, B, cfg = {}) {
  const d = strengthDiff(A, B, cfg);
  let lamA = clamp(BASE_GOALS * Math.pow(10, d / 1000), 0.15, 4.8);
  let lamB = clamp(BASE_GOALS * Math.pow(10, -d / 1000), 0.15, 4.8);
  // AI 动机/状态调整：按 A=主队 朝向缩放预期进球（见 ai.js）
  const assess = aiAssessmentFor(A, B, cfg);
  if (assess) {
    lamA = clamp(lamA * clamp(assess.homeGoalMult || 1, 0.3, 2), 0.05, 4.8);
    lamB = clamp(lamB * clamp(assess.awayGoalMult || 1, 0.3, 2), 0.05, 4.8);
  }
  return [lamA, lamB];
}

// ---------- AI 比赛动机 / 异常（假球·默契球）调整（见 ai.js） ----------
// 仅当 cfg.ai === true 且存在该场 AI 评估时生效；评估按 A=主队 朝向返回。
function aiAssessmentFor(A, B, cfg) {
  if (!cfg || cfg.ai !== true) return null;
  if (typeof getAIAssessment !== 'function') return null;
  return getAIAssessment(A.code, B.code);
}

// 把「假球/默契球」情景比分分布与正常比分矩阵混合：
//   最终 = (1 − fixRisk) × 正常矩阵 + fixRisk × 情景比分分布
function mixFixScenario(matrix, assess) {
  if (!assess) return matrix;
  const r = clamp(assess.fixRisk || 0, 0, 1);
  const scores = assess.fixScores || [];
  if (r <= 0 || !scores.length) return matrix;
  let wsum = 0;
  for (const s of scores) wsum += Math.max(0, s.weight) || 0;
  if (wsum <= 0) return matrix;
  const out = matrix.map((row) => row.slice());
  for (let a = 0; a <= MAX_GOALS; a++)
    for (let b = 0; b <= MAX_GOALS; b++) out[a][b] *= (1 - r);
  for (const s of scores) {
    const a = Math.min(MAX_GOALS, Math.max(0, Math.round(s.a)));
    const b = Math.min(MAX_GOALS, Math.max(0, Math.round(s.b)));
    out[a][b] += r * ((Math.max(0, s.weight) || 0) / wsum);
  }
  return out;
}

function poissonPmf(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

// 比分概率矩阵 matrix[a][b] = P(比分为 a:b)，截断后归一化
// dc=true 时做 Dixon-Coles 修正：独立泊松会低估 0:0/1:1、高估 1:0/0:1，
// 用 τ 系数校正低比分区域后再归一化
function scoreMatrix(lamA, lamB, dc = true) {
  const pa = [], pb = [];
  for (let k = 0; k <= MAX_GOALS; k++) {
    pa.push(poissonPmf(lamA, k));
    pb.push(poissonPmf(lamB, k));
  }
  const m = [];
  for (let a = 0; a <= MAX_GOALS; a++) {
    m.push([]);
    for (let b = 0; b <= MAX_GOALS; b++) m[a].push(pa[a] * pb[b]);
  }
  if (dc) {
    m[0][0] *= 1 - lamA * lamB * DC_RHO;
    m[0][1] *= 1 + lamA * DC_RHO;
    m[1][0] *= 1 + lamB * DC_RHO;
    m[1][1] *= 1 - DC_RHO;
  }
  let total = 0;
  for (let a = 0; a <= MAX_GOALS; a++)
    for (let b = 0; b <= MAX_GOALS; b++) total += m[a][b];
  for (let a = 0; a <= MAX_GOALS; a++)
    for (let b = 0; b <= MAX_GOALS; b++) m[a][b] /= total;
  return m;
}

// 胜/平/负概率
function outcomeProbs(matrix) {
  let win = 0, draw = 0, loss = 0;
  for (let a = 0; a <= MAX_GOALS; a++) {
    for (let b = 0; b <= MAX_GOALS; b++) {
      if (a > b) win += matrix[a][b];
      else if (a === b) draw += matrix[a][b];
      else loss += matrix[a][b];
    }
  }
  return { win, draw, loss };
}

// 按概率排序的比分列表
function rankedScores(matrix, topN = 6) {
  const list = [];
  for (let a = 0; a <= MAX_GOALS; a++)
    for (let b = 0; b <= MAX_GOALS; b++) list.push({ a, b, p: matrix[a][b] });
  list.sort((x, y) => y.p - x.p);
  return list.slice(0, topN);
}

// 点球大战中 A 队获胜概率：接近五五开，按实力差小幅修正
function penaltyWinProb(A, B, cfg = {}) {
  return clamp(0.5 + strengthDiff(A, B, cfg) / 4000, 0.35, 0.65);
}

// 完整对阵预测（小组赛或淘汰赛）
function predictMatch(A, B, cfg = {}) {
  const dc = cfg.dc !== false;
  const [lamA, lamB] = matchLambdas(A, B, cfg);
  const matrix = mixFixScenario(scoreMatrix(lamA, lamB, dc), aiAssessmentFor(A, B, cfg));
  const probs = outcomeProbs(matrix);
  const top = rankedScores(matrix);
  const best = top[0];
  const result = { lamA, lamB, matrix, probs, top, best };

  if (cfg.knockout) {
    // 加时赛 30 分钟按正赛强度的 1/3 计算（进球少，不做 DC 修正），仍平则点球
    const etMatrix = scoreMatrix(lamA / 3, lamB / 3, false);
    const et = outcomeProbs(etMatrix);
    const pPen = penaltyWinProb(A, B, cfg);
    result.advanceA = probs.win + probs.draw * (et.win + et.draw * pPen);
    result.advanceB = 1 - result.advanceA;
  }
  return result;
}

// ---------- 随机模拟（蒙特卡洛） ----------

function samplePoisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// 比分分布缓存：同一次模拟里相同对阵直接复用累积分布，
// 抽样时从含 Dixon-Coles 修正的完整比分矩阵中取样
function matchDist(A, B, cfg) {
  const key = A.code + '|' + B.code;
  if (cfg.cache && cfg.cache.has(key)) return cfg.cache.get(key);
  const [lamA, lamB] = matchLambdas(A, B, cfg);
  const m = mixFixScenario(scoreMatrix(lamA, lamB, cfg.dc !== false), aiAssessmentFor(A, B, cfg));
  const cum = [];
  let acc = 0;
  for (let a = 0; a <= MAX_GOALS; a++)
    for (let b = 0; b <= MAX_GOALS; b++) { acc += m[a][b]; cum.push(acc); }
  const dist = { cum, lamA, lamB };
  if (cfg.cache) cfg.cache.set(key, dist);
  return dist;
}

function sampleScore(A, B, cfg) {
  const { cum } = matchDist(A, B, cfg);
  const r = Math.random();
  let i = 0;
  while (i < cum.length - 1 && cum[i] < r) i++;
  return [Math.floor(i / (MAX_GOALS + 1)), i % (MAX_GOALS + 1)];
}

// 淘汰赛单场随机出胜者
function sampleKnockoutWinner(codeA, codeB, cfg) {
  const A = TEAMS[codeA], B = TEAMS[codeB];
  const [ga, gb] = sampleScore(A, B, cfg);
  if (ga !== gb) return ga > gb ? codeA : codeB;
  const { lamA, lamB } = matchDist(A, B, cfg);
  const ea = samplePoisson(lamA / 3), eb = samplePoisson(lamB / 3);
  if (ea !== eb) return ea > eb ? codeA : codeB;
  return Math.random() < penaltyWinProb(A, B, cfg) ? codeA : codeB;
}

// 模拟一个小组的 6 场比赛，返回排序后的积分榜
// 已录入真实比分的场次（results.js）直接采用实际结果
function simulateGroup(groupCodes, cfg) {
  const table = {};
  for (const c of groupCodes) table[c] = { code: c, pts: 0, gf: 0, ga: 0 };
  for (let i = 0; i < groupCodes.length; i++) {
    for (let j = i + 1; j < groupCodes.length; j++) {
      const a = groupCodes[i], b = groupCodes[j];
      const real = (typeof getActualResult === 'function') ? getActualResult(a, b) : null;
      const [ga, gb] = real || sampleScore(TEAMS[a], TEAMS[b], cfg);
      table[a].gf += ga; table[a].ga += gb;
      table[b].gf += gb; table[b].ga += ga;
      if (ga > gb) table[a].pts += 3;
      else if (gb > ga) table[b].pts += 3;
      else { table[a].pts += 1; table[b].pts += 1; }
    }
  }
  return Object.values(table).sort((x, y) =>
    y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || Math.random() - 0.5);
}

// 将 8 支成绩最好的小组第三分配到对阵模板的限定槽位（回溯匹配）
function assignThirds(thirds) {
  const slots = R32_TEMPLATE.filter((m) => m.away.startsWith('3:'))
    .map((m) => ({ id: m.id, allowed: m.away.slice(2) }));
  const assign = {};
  const used = new Set();
  function backtrack(i) {
    if (i === slots.length) return true;
    const slot = slots[i];
    for (const t of thirds) {
      if (used.has(t.code)) continue;
      if (!slot.allowed.includes(t.group)) continue;
      used.add(t.code);
      assign[slot.id] = t.code;
      if (backtrack(i + 1)) return true;
      used.delete(t.code);
      delete assign[slot.id];
    }
    return false;
  }
  if (!backtrack(0)) {
    // 极少数组合不满足限定时退化为按顺序分配
    const remaining = thirds.filter((t) => !used.has(t.code));
    for (const slot of slots) {
      if (!assign[slot.id]) assign[slot.id] = remaining.shift().code;
    }
  }
  return assign; // matchId -> teamCode
}

// 完整模拟一届世界杯，返回每队止步的轮次
// 轮次编码：0=小组出局 1=进32强 2=进16强 3=进8强 4=进4强 5=进决赛 6=夺冠
function simulateTournament(cfg) {
  const reached = {};
  for (const c of Object.keys(TEAMS)) reached[c] = 0;

  const winners = {}, runners = {}, thirds = [];
  for (const g of GROUP_NAMES) {
    const table = simulateGroup(GROUPS[g], cfg);
    winners[g] = table[0].code;
    runners[g] = table[1].code;
    thirds.push({ ...table[2], group: g });
    reached[table[0].code] = 1;
    reached[table[1].code] = 1;
  }
  thirds.sort((x, y) =>
    y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || Math.random() - 0.5);
  const bestThirds = thirds.slice(0, 8);
  for (const t of bestThirds) reached[t.code] = 1;
  const thirdAssign = assignThirds(bestThirds);

  function resolveSlot(slot, matchId) {
    if (slot.startsWith('3:')) return thirdAssign[matchId];
    const pos = slot[0], g = slot[1];
    return pos === '1' ? winners[g] : runners[g];
  }

  // 32 强
  const matchWinner = {};
  for (const m of R32_TEMPLATE) {
    const a = resolveSlot(m.home, m.id), b = resolveSlot(m.away, m.id);
    const w = sampleKnockoutWinner(a, b, cfg);
    matchWinner[m.id] = w;
    reached[w] = 2;
  }
  // 16 强 → 8 强 → 4 强 → 决赛
  let prevIds = [];
  R16_TEMPLATE.forEach((pair, idx) => {
    const id = 89 + idx;
    const w = sampleKnockoutWinner(matchWinner[pair[0]], matchWinner[pair[1]], cfg);
    matchWinner[id] = w;
    reached[w] = 3;
    prevIds.push(id);
  });
  let round = 4;
  while (prevIds.length > 1) {
    const nextIds = [];
    for (let i = 0; i < prevIds.length; i += 2) {
      const newId = Math.max(...Object.keys(matchWinner).map(Number)) + 1;
      const w = sampleKnockoutWinner(matchWinner[prevIds[i]], matchWinner[prevIds[i + 1]], cfg);
      matchWinner[newId] = w;
      reached[w] = round;
      nextIds.push(newId);
    }
    prevIds = nextIds;
    round++;
  }
  return reached;
}

// 跑 N 次完整模拟，统计各队走到每个阶段的概率
function monteCarlo(iterations, cfg) {
  cfg = { ...cfg, cache: new Map() };
  const stats = {};
  for (const c of Object.keys(TEAMS)) stats[c] = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < iterations; i++) {
    const reached = simulateTournament(cfg);
    for (const [c, r] of Object.entries(reached)) {
      for (let s = 1; s <= r; s++) stats[c][s]++;
    }
  }
  const out = {};
  for (const [c, arr] of Object.entries(stats)) {
    out[c] = arr.map((n) => n / iterations);
  }
  return out; // code -> [_, P出线, P16强, P8强, P4强, P决赛, P夺冠]
}
