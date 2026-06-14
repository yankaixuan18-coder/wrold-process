// 实时小组积分榜：仅用已结束比赛计算当前真实排名。
// 排序按 FIFA 世界杯小组规则：积分 → 净胜球 → 进球 → 相互战绩 → （此处以队名占位代替抽签）。
function standingsCmp(x, y) {
  if (y.Pts !== x.Pts) return y.Pts - x.Pts;
  if (y.GD !== x.GD) return y.GD - x.GD;
  if (y.GF !== x.GF) return y.GF - x.GF;
  const r = getActualResult(x.code, y.code); // 两队相互战绩
  if (r && r[0] !== r[1]) return r[1] - r[0];
  return x.code < y.code ? -1 : 1;
}

function groupStandings(g) {
  const codes = GROUPS[g];
  const t = {};
  for (const c of codes) t[c] = { code: c, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0 };
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const a = codes[i], b = codes[j];
      const r = getActualResult(a, b);
      if (!r) continue;
      const [ga, gb] = r;
      t[a].P++; t[b].P++;
      t[a].GF += ga; t[a].GA += gb; t[b].GF += gb; t[b].GA += ga;
      if (ga > gb) { t[a].W++; t[b].L++; }
      else if (ga < gb) { t[b].W++; t[a].L++; }
      else { t[a].D++; t[b].D++; }
    }
  }
  const rows = codes.map((c) => {
    const x = t[c];
    x.Pts = x.W * 3 + x.D;
    x.GD = x.GF - x.GA;
    return x;
  });
  rows.sort(standingsCmp);
  return rows;
}

// 某队在本组尚未进行的比赛（返回对手代码数组）
function remainingOpponents(code) {
  const g = TEAMS[code].group;
  const out = [];
  for (const c of GROUPS[g]) {
    if (c === code) continue;
    if (!getActualResult(code, c)) out.push(c);
  }
  return out;
}
