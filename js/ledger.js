// 投注台账：记录真实下注并统计回报率（ROI），让工具能自我验证。
// 数据存于浏览器本地，刷新不丢失。
const LEDGER_KEY = 'wc2026_ledger';
const LEDGER = []; // [{id, date, match, pick, odds, stake, status}]
                   // status: 'pending'(待开) | 'win'(赢) | 'lose'(输) | 'void'(取消)

function loadLedger() {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (raw) for (const b of JSON.parse(raw)) LEDGER.push(b);
  } catch (e) { /* ignore */ }
}
function saveLedger() {
  try { localStorage.setItem(LEDGER_KEY, JSON.stringify(LEDGER)); } catch (e) { /* ignore */ }
}

function addBet(bet) {
  bet.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  bet.status = bet.status || 'pending';
  LEDGER.push(bet);
  saveLedger();
  return bet.id;
}
function setBetStatus(id, status) {
  const b = LEDGER.find((x) => x.id === id);
  if (b) { b.status = status; saveLedger(); }
}
function removeBet(id) {
  const i = LEDGER.findIndex((x) => x.id === id);
  if (i >= 0) { LEDGER.splice(i, 1); saveLedger(); }
}
function clearLedger() { LEDGER.length = 0; saveLedger(); }

// 统计：已结算的盈亏与 ROI，以及命中率、待开本金
function ledgerStats() {
  let staked = 0, returned = 0, pending = 0, settled = 0, won = 0;
  for (const b of LEDGER) {
    const stake = +b.stake || 0, odds = +b.odds || 0;
    if (b.status === 'pending') { pending += stake; continue; }
    if (b.status === 'void') continue;
    staked += stake;
    settled++;
    if (b.status === 'win') { returned += stake * odds; won++; }
  }
  return {
    count: LEDGER.length,
    staked, returned,
    profit: returned - staked,
    roi: staked > 0 ? (returned - staked) / staked : 0,
    hitRate: settled > 0 ? won / settled : 0,
    pending, settled,
  };
}

loadLedger();
