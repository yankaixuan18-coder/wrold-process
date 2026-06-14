// 投注价值分析与推荐（稳 / 冲）
// 方法：
//   · 用「市场赔率模型」反推庄家盘口（按抽水 margin 折算成十进制赔率）。
//   · 用「我们的模型」（默认 Elo+FIFA，排除市场，以发现与盘口的分歧）估计真实概率。
//   · 价值 EV = 我方概率 × 庄家赔率 − 1；EV>0 即理论上有利可图。
//   · 稳 = 高命中率（概率优先，剔除正确比分等低概率盘）。
//   · 冲 = 高赔率 + 正价值（含冷门、正确比分），博取高回报。
// 所有结果仅为统计推演，赌博有风险，务必量力而行。

const VIG = 1.07;       // 胜平负 / 大小球 / 双方进球盘综合抽水
const VIG_CS = 1.22;    // 正确比分盘抽水更高
const OVER_LINE = 2.5;  // 大小球分界

// 「我方模型」预设：默认排除市场，让 Elo+FIFA 与盘口形成分歧
const BET_MODELS = {
  elofifa:  { label: 'Elo + FIFA（默认·剔除市场找价值）', cfg: { model: 'ensemble', weights: { elo: 1, fifa: 1, market: 0 } } },
  ensemble: { label: '集成（含市场·更保守）',            cfg: { model: 'ensemble', weights: { elo: 1, fifa: 1, market: 1 } } },
  elo:      { label: '仅 Elo',                           cfg: { model: 'elo' } },
  fifa:     { label: '仅 FIFA 排名',                     cfg: { model: 'fifa' } },
};

function decimalFromProb(p, vig) {
  return Math.max(1.01, (1 / Math.max(p, 1e-6)) / vig);
}

// 由比分矩阵汇总各类盘口概率
function marketProbs(matrix) {
  let win = 0, draw = 0, loss = 0, over = 0, under = 0, bttsYes = 0, bttsNo = 0;
  const cs = [];
  for (let a = 0; a < matrix.length; a++) {
    for (let b = 0; b < matrix[a].length; b++) {
      const p = matrix[a][b];
      if (a > b) win += p; else if (a === b) draw += p; else loss += p;
      if (a + b > OVER_LINE) over += p; else under += p;
      if (a > 0 && b > 0) bttsYes += p; else bttsNo += p;
      cs.push({ a, b, p });
    }
  }
  cs.sort((x, y) => y.p - x.p);
  return { win, draw, loss, over, under, bttsYes, bttsNo, cs };
}

// 凯利公式建议仓位
function kelly(p, odds) {
  const b = odds - 1;
  return b > 0 ? Math.max(0, (p * b - (1 - p)) / b) : 0;
}
function safeStakeFrac(p, odds) { return Math.min(0.05, 0.25 * kelly(p, odds)); } // 稳：1/4 凯利，上限 5%
function aggrStakeFrac(p, odds) { return Math.min(0.10, 0.50 * kelly(p, odds)); } // 冲：1/2 凯利，上限 10%

// 评估一场比赛的全部候选投注
// betModelCfg 为 BET_MODELS[*].cfg
function evaluateMatch(codeA, codeB, betModelCfg) {
  const A = TEAMS[codeA], B = TEAMS[codeB];
  const our = predictMatch(A, B, { ...betModelCfg, useHome: true, dc: true });
  const om = marketProbs(our.matrix);
  // 庄家盘口：纯市场赔率模型，保持赛前市场（ignoreAdj），不吸收赛果修正
  const book = predictMatch(A, B, { model: 'market', useHome: false, dc: true, ignoreAdj: true });
  const bm = marketProbs(book.matrix);

  const sel = [];
  const add = (market, pick, pOur, pBook, vig) => {
    const odds = decimalFromProb(pBook, vig);
    sel.push({ market, pick, p: pOur, odds, ev: pOur * odds - 1, codeA, codeB });
  };
  add('胜平负', A.zh + '胜', om.win, bm.win, VIG);
  add('胜平负', '平局', om.draw, bm.draw, VIG);
  add('胜平负', B.zh + '胜', om.loss, bm.loss, VIG);
  add('双重机会', A.zh + '不败', om.win + om.draw, bm.win + bm.draw, VIG);
  add('双重机会', B.zh + '不败', om.loss + om.draw, bm.loss + bm.draw, VIG);
  add('双重机会', '分出胜负', om.win + om.loss, bm.win + bm.loss, VIG);
  add('进球数', '大 ' + OVER_LINE + ' 球', om.over, bm.over, VIG);
  add('进球数', '小 ' + OVER_LINE + ' 球', om.under, bm.under, VIG);
  add('双方进球', '是', om.bttsYes, bm.bttsYes, VIG);
  add('双方进球', '否', om.bttsNo, bm.bttsNo, VIG);
  for (const c of om.cs.slice(0, 5)) {
    const bc = bm.cs.find((x) => x.a === c.a && x.b === c.b);
    add('正确比分', A.zh + ' ' + c.a + ':' + c.b + ' ' + B.zh, c.p, bc.p, VIG_CS);
  }
  return { codeA, codeB, A, B, our, sel, topScore: om.cs[0] };
}

// 单场「稳」推荐：高命中率，剔除正确比分；同等条件优先有正价值
function pickSafe(m) {
  const pool = m.sel.filter((s) => s.market !== '正确比分' && s.p >= 0.5);
  if (!pool.length) return null;
  pool.sort((x, y) => (y.ev > 0) - (x.ev > 0) || y.p - x.p);
  return pool[0];
}

// 单场「冲」推荐：正价值 + 高赔率；若无则取最可能的正确比分博胆
function pickAggressive(m) {
  const value = m.sel.filter((s) => s.ev > 0.03 && s.odds >= 2.2);
  if (value.length) {
    value.sort((x, y) => y.ev - x.ev);
    return value[0];
  }
  const cs = m.sel.filter((s) => s.market === '正确比分').sort((x, y) => y.p - x.p);
  return cs[0] || null;
}

// 串票用的「冲」腿：剔除正确比分与极端长赔（避免串成天文数字），取有价值的中高赔盘
function pickAggressiveLeg(m) {
  const pool = m.sel.filter((s) => s.market !== '正确比分' && s.ev > 0.03 && s.odds >= 1.6 && s.odds <= 4.5);
  if (!pool.length) return null;
  pool.sort((x, y) => y.ev - x.ev);
  return pool[0];
}

// 串票：每场一条腿，赔率相乘；概率按独立近似相乘
function buildParlay(legs) {
  let odds = 1, p = 1;
  for (const l of legs) { odds *= l.odds; p *= l.p; }
  return { legs, odds, p, ev: p * odds - 1 };
}

// 为某一天生成完整推荐
// 返回 { matches:[{m, safe, aggr, played, actual}], safeParlay, aggrParlay }
function recommendForDate(date, betModelCfg, opts = {}) {
  const maxSafeLegs = opts.maxSafeLegs || 4;
  const maxAggrLegs = opts.maxAggrLegs || 3;
  const fixtures = fixturesOnDate(date);
  const matches = [];
  const safeCandidates = [];
  const aggrCandidates = [];

  for (const f of fixtures) {
    const actual = (typeof getActualResult === 'function') ? getActualResult(f.a, f.b) : null;
    if (actual) {
      matches.push({ fixture: f, played: true, actual });
      continue;
    }
    const m = evaluateMatch(f.a, f.b, betModelCfg);
    const safe = pickSafe(m);
    const aggr = pickAggressive(m);
    matches.push({ fixture: f, played: false, m, safe, aggr });
    if (safe && safe.p >= 0.6) safeCandidates.push(safe);
    const aggrLeg = pickAggressiveLeg(m);
    if (aggrLeg) aggrCandidates.push(aggrLeg);
  }

  // 稳串：命中率最高的若干腿
  safeCandidates.sort((x, y) => y.p - x.p);
  const safeLegs = safeCandidates.slice(0, maxSafeLegs);
  const safeParlay = safeLegs.length >= 2 ? buildParlay(safeLegs) : null;

  // 冲串：价值最高的若干腿
  aggrCandidates.sort((x, y) => y.ev - x.ev);
  const aggrLegs = aggrCandidates.slice(0, maxAggrLegs);
  const aggrParlay = aggrLegs.length >= 2 ? buildParlay(aggrLegs) : null;

  return { date, matches, safeParlay, aggrParlay };
}
