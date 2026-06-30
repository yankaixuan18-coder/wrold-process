// 淘汰赛预测模块
// 根据各组当前排名确定 32 强对阵（小组赛踢完即为真实对阵；未踢完则为按当前积分的临时投影），
// 逐轮预测每场（含加时/点球），可录入真实淘汰赛结果并向下传导。
// 与 model.js 联动：decideKnockout 会优先采用这里录入的结果（getKoOutcome）。

const KO_KEY = 'wc2026_ko_results';
const KO_RESULTS = {}; // 'a|b'(排序后) -> { a, b, ga, gb, winner }

(function loadKo() {
  try { const raw = localStorage.getItem(KO_KEY); if (raw) Object.assign(KO_RESULTS, JSON.parse(raw)); } catch (e) { /* ignore */ }
})();
function saveKo() { try { localStorage.setItem(KO_KEY, JSON.stringify(KO_RESULTS)); } catch (e) { /* ignore */ } }
function koKey(a, b) { return [a, b].sort().join('|'); }

// 供 model.js 调用：返回某对阵已录入的结果（含点球胜者）
function getKoOutcome(a, b) { return KO_RESULTS[koKey(a, b)] || null; }
function setKoResult(a, b, ga, gb, winner) {
  KO_RESULTS[koKey(a, b)] = { a, b, ga, gb, winner: winner || (ga > gb ? a : gb > ga ? b : a) };
  saveKo();
}
function removeKoResult(a, b) { delete KO_RESULTS[koKey(a, b)]; saveKo(); }
function clearKoResults() { for (const k of Object.keys(KO_RESULTS)) delete KO_RESULTS[k]; saveKo(); }

// 淘汰赛轮次结构（与 simulateTournament 的推进一致）
const KO_ROUNDS = {
  r16: [[74, 77], [73, 75], [76, 78], [79, 80], [83, 84], [81, 82], [86, 88], [85, 87]], // → 89..96
  qf: [[89, 90], [91, 92], [93, 94], [95, 96]], // → 97..100
  sf: [[97, 98], [99, 100]],                    // → 101,102
  fin: [[101, 102]],                            // → 103
};
const KO_ROUND_LABEL = { r32: '1/16 决赛', r16: '1/8 决赛', qf: '1/4 决赛', sf: '半决赛', fin: '决赛' };

// 由当前各组排名得出晋级球队与对阵分配
function koQualifiers() {
  const winners = {}, runners = {}, thirdsAll = [];
  let complete = true;
  for (const g of GROUP_NAMES) {
    const t = groupStandings(g);
    if (!t.every((r) => r.P === 3)) complete = false;
    winners[g] = t[0].code;
    runners[g] = t[1].code;
    thirdsAll.push({ ...t[2], group: g, pts: t[2].Pts, gf: t[2].GF, ga: t[2].GA });
  }
  thirdsAll.sort((x, y) =>
    y.pts - x.pts || (y.GD) - (x.GD) || y.gf - x.gf || (x.code < y.code ? -1 : 1));
  const bestThirds = thirdsAll.slice(0, 8);
  const thirdAssign = assignThirds(bestThirds); // matchId -> code
  return { winners, runners, thirdsAll, bestThirds, thirdAssign, complete };
}

function koResolveSlot(slot, matchId, q) {
  if (slot.startsWith('3:')) return q.thirdAssign[matchId] || null;
  const pos = slot[0], g = slot[1];
  return pos === '1' ? q.winners[g] : q.runners[g];
}

// 计算整张签表的「当前队伍」与「已定胜者」。
// teams[id] = [a,b]（未定为 null）；winner[id] = 已录入胜者（未定为 null）
function koBracketState(q) {
  const teams = {}, winner = {};
  for (const m of R32_TEMPLATE) {
    const a = koResolveSlot(m.home, m.id, q), b = koResolveSlot(m.away, m.id, q);
    teams[m.id] = [a, b];
    const o = (a && b) ? getKoOutcome(a, b) : null;
    winner[m.id] = o ? o.winner : null;
  }
  const advance = (defs, baseId) => defs.forEach((pair, i) => {
    const id = baseId + i;
    const a = winner[pair[0]] || null, b = winner[pair[1]] || null;
    teams[id] = [a, b];
    const o = (a && b) ? getKoOutcome(a, b) : null;
    winner[id] = o ? o.winner : null;
  });
  advance(KO_ROUNDS.r16, 89);
  advance(KO_ROUNDS.qf, 97);
  advance(KO_ROUNDS.sf, 101);
  advance(KO_ROUNDS.fin, 103);
  return { teams, winner };
}

// 单场淘汰赛预测（含加时/点球晋级概率）
function koPredict(a, b, cfg) {
  if (!a || !b) return null;
  return predictMatch(TEAMS[a], TEAMS[b], { ...(cfg || {}), model: 'ensemble', useHome: true, dc: true, knockout: true });
}

// 仅淘汰赛蒙特卡洛：固定 32 强签表（来自当前排名），只模拟淘汰赛，
// 并采纳已录入的真实结果。返回 code -> [_, P进淘汰赛, P16, P8, P4, P决赛, P夺冠]
// （仅当小组赛已完成、签表确定时使用，确保恰好 32 支球队）
function koMonteCarlo(iters, cfg) {
  const q = koQualifiers();
  const c = { ...(cfg || {}), model: 'ensemble', useHome: true, dc: true, cache: new Map() };
  const r32 = R32_TEMPLATE.map((m) => [koResolveSlot(m.home, m.id, q), koResolveSlot(m.away, m.id, q)]);
  const all32 = r32.flat().filter(Boolean);
  const reached = {};
  for (const code of all32) reached[code] = [0, 0, 0, 0, 0, 0, 0];
  for (let it = 0; it < iters; it++) {
    const win = {};
    R32_TEMPLATE.forEach((m, i) => {
      const [a, b] = r32[i];
      reached[a][1]++; reached[b][1]++;            // 两队都已进淘汰赛
      const w = decideKnockout(a, b, c); win[m.id] = w; reached[w][2]++; // 胜者进 16 强
    });
    KO_ROUNDS.r16.forEach((p, idx) => { const w = decideKnockout(win[p[0]], win[p[1]], c); win[89 + idx] = w; reached[w][3]++; });
    KO_ROUNDS.qf.forEach((p, idx) => { const w = decideKnockout(win[p[0]], win[p[1]], c); win[97 + idx] = w; reached[w][4]++; });
    KO_ROUNDS.sf.forEach((p, idx) => { const w = decideKnockout(win[p[0]], win[p[1]], c); win[101 + idx] = w; reached[w][5]++; });
    const fw = decideKnockout(win[101], win[102], c); reached[fw][6]++;
  }
  const out = {};
  for (const code of all32) out[code] = reached[code].map((n) => n / iters);
  return out; // 恰好 32 支
}

// 已录入淘汰赛结果数
function koResultCount() { return Object.keys(KO_RESULTS).length; }
