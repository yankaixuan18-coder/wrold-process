// 球队攻防（状态/风格）修正层 —— 比分系统优化
// 思路：小组赛踢完后，每队的「实际进/失球」相对「模型按实力预期的进/失球」的偏差，
// 反映了强弱之外的进攻/防守风格与状态。用经验贝叶斯收缩（伪计数 K）得到攻防系数，
// 与实力(ADJ)正交——ADJ 调「谁更强」，攻防层调「进球多寡与攻防倾向」。
// 收缩很强 + 可开关：样本少时几乎不动，避免过拟合。仅在开启时生效。
const FORM_KEY = 'wc2026_form_on';
const FORM_K = 6;              // 收缩伪计数（进球单位）：越大越保守
const FORM_ATK = {};          // code -> 进攻系数（>1 进球多于预期）
const FORM_DEF = {};          // code -> 防守系数（<1 失球少于预期）

function formOn() {
  try { return localStorage.getItem(FORM_KEY) === '1'; } catch (e) { return false; }
}
function setFormOn(on) { try { localStorage.setItem(FORM_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } }

function getAtkMult(code) { return FORM_ATK[code] || 1; }
function getDefMult(code) { return FORM_DEF[code] || 1; }

// 依据已录入赛果重算攻防系数。预期进球用「关闭 form」的实力模型计算，避免循环。
function recomputeForm() {
  for (const k of Object.keys(FORM_ATK)) delete FORM_ATK[k];
  for (const k of Object.keys(FORM_DEF)) delete FORM_DEF[k];
  if (typeof RESULTS === 'undefined' || !RESULTS.length) return;
  const obsF = {}, obsA = {}, expF = {}, expA = {};
  const bump = (o, c, v) => { o[c] = (o[c] || 0) + v; };
  for (const r of RESULTS) {
    const A = TEAMS[r.a], B = TEAMS[r.b];
    if (!A || !B) continue;
    // 预期进球：实力模型（含 ADJ、主场），显式关闭 form 与 AI，避免循环
    const [ea, eb] = matchLambdas(A, B, { model: 'ensemble', useHome: true, form: false, ai: false });
    bump(obsF, r.a, r.ga); bump(obsA, r.a, r.gb); bump(expF, r.a, ea); bump(expA, r.a, eb);
    bump(obsF, r.b, r.gb); bump(obsA, r.b, r.ga); bump(expF, r.b, eb); bump(expA, r.b, ea);
  }
  for (const c of Object.keys(obsF)) {
    // 收缩到 1：样本少时接近 1；进球多于预期→>1
    FORM_ATK[c] = clampForm((obsF[c] + FORM_K) / ((expF[c] || 0) + FORM_K));
    FORM_DEF[c] = clampForm((obsA[c] + FORM_K) / ((expA[c] || 0) + FORM_K));
  }
}
function clampForm(x) { return Math.min(1.5, Math.max(0.65, x)); }
