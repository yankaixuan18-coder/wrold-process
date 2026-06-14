// 回测与校准
// 把模型对「已结束比赛」的赛前预测和真实结果逐场比对，量化准确度。
// 关键：时序回放（walk-forward）——预测每场时只用该场之前的赛果做动态修正，
// 杜绝未来信息泄漏；同时用「市场模型」和「均匀基准」作对照。
// 指标：胜平负命中率、Brier 分数、对数损失（均越低越好）、最可能比分命中率、总进球 MAE、校准曲线。

function btAccum() {
  return { n: 0, hit1x2: 0, brier: 0, logloss: 0, exact: 0, goalAE: 0,
    calib: Array.from({ length: 10 }, () => ({ sum: 0, hit: 0, cnt: 0 })) };
}

function btRecord(acc, pred, ga, gb) {
  const { probs, best, lamA, lamB } = pred;
  const ps = [probs.win, probs.draw, probs.loss];
  const yIdx = ga > gb ? 0 : ga === gb ? 1 : 2;          // 实际结果索引
  const predIdx = ps.indexOf(Math.max(...ps));
  acc.n++;
  if (predIdx === yIdx) acc.hit1x2++;
  for (let o = 0; o < 3; o++) acc.brier += (ps[o] - (o === yIdx ? 1 : 0)) ** 2;
  acc.logloss += -Math.log(Math.max(ps[yIdx], 1e-9));
  if (best.a === ga && best.b === gb) acc.exact++;
  acc.goalAE += Math.abs((lamA + lamB) - (ga + gb));
  // 校准：把三个结果的(预测概率, 是否命中)都纳入分箱
  for (let o = 0; o < 3; o++) {
    const bin = Math.min(9, Math.floor(ps[o] * 10));
    acc.calib[bin].sum += ps[o];
    acc.calib[bin].hit += (o === yIdx ? 1 : 0);
    acc.calib[bin].cnt++;
  }
}

function btFinalize(acc) {
  if (acc.n === 0) return null;
  return {
    n: acc.n,
    acc1x2: acc.hit1x2 / acc.n,
    brier: acc.brier / acc.n,        // 三分类 Brier（0~2，越低越好）
    logloss: acc.logloss / acc.n,
    exact: acc.exact / acc.n,
    goalMAE: acc.goalAE / acc.n,
    calib: acc.calib.map((b) => ({
      cnt: b.cnt,
      predMean: b.cnt ? b.sum / b.cnt : 0,
      obsFreq: b.cnt ? b.hit / b.cnt : 0,
    })),
  };
}

// 时序回放回测。modelCfg 为待测模型配置（如 BET_MODELS.ensemble.cfg）。
function runBacktest(modelCfg) {
  const chrono = chronoResults();
  if (chrono.length === 0) return null;

  const saved = { ...ADJ };
  for (const k of Object.keys(ADJ)) delete ADJ[k]; // 从赛前零修正状态开始

  const model = btAccum(), market = btAccum(), baseline = btAccum();
  for (const r of chrono) {
    const A = TEAMS[r.a], B = TEAMS[r.b];
    btRecord(model, predictMatch(A, B, { ...modelCfg, useHome: true, dc: true }), r.ga, r.gb);
    btRecord(market, predictMatch(A, B, { model: 'market', useHome: false, dc: true, ignoreAdj: true }), r.ga, r.gb);
    // 均匀基准：胜平负各 1/3，比分按势均力敌
    btRecord(baseline, { probs: { win: 1 / 3, draw: 1 / 3, loss: 1 / 3 }, best: { a: 1, b: 1 }, lamA: 1.38, lamB: 1.38 }, r.ga, r.gb);
    // 应用真实赛果，供后续场次的动态修正使用
    const delta = eloDelta(A, B, r.ga, r.gb);
    ADJ[r.a] = (ADJ[r.a] || 0) + delta;
    ADJ[r.b] = (ADJ[r.b] || 0) - delta;
  }

  for (const k of Object.keys(ADJ)) delete ADJ[k];
  Object.assign(ADJ, saved); // 还原全局修正状态

  return { model: btFinalize(model), market: btFinalize(market), baseline: btFinalize(baseline) };
}
