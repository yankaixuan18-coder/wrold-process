// 2026 世界杯小组赛完整赛程（72 场），按官方日期排列
// 数据来源：FIFA / ESPN / Yahoo / Olympics 等公开赛程；
// 对阵与日期已逐场核对（含 6/11–6/13 已赛比分）。
// 每场：{ date:'2026-06-14', md:轮次, group:'E', a:主列队, b:客列队 }
const SCHEDULE = [
  // —— 第 1 轮 ——
  { date: '2026-06-11', md: 1, group: 'A', a: 'MEX', b: 'RSA' },
  { date: '2026-06-11', md: 1, group: 'A', a: 'KOR', b: 'CZE' },
  { date: '2026-06-12', md: 1, group: 'B', a: 'CAN', b: 'BIH' },
  { date: '2026-06-12', md: 1, group: 'D', a: 'USA', b: 'PAR' },
  { date: '2026-06-13', md: 1, group: 'B', a: 'QAT', b: 'SUI' },
  { date: '2026-06-13', md: 1, group: 'C', a: 'BRA', b: 'MAR' },
  { date: '2026-06-13', md: 1, group: 'C', a: 'HAI', b: 'SCO' },
  { date: '2026-06-14', md: 1, group: 'D', a: 'AUS', b: 'TUR' },
  { date: '2026-06-14', md: 1, group: 'E', a: 'GER', b: 'CUW' },
  { date: '2026-06-14', md: 1, group: 'E', a: 'CIV', b: 'ECU' },
  { date: '2026-06-14', md: 1, group: 'F', a: 'NED', b: 'JPN' },
  { date: '2026-06-14', md: 1, group: 'F', a: 'SWE', b: 'TUN' },
  { date: '2026-06-15', md: 1, group: 'G', a: 'BEL', b: 'EGY' },
  { date: '2026-06-15', md: 1, group: 'G', a: 'IRN', b: 'NZL' },
  { date: '2026-06-15', md: 1, group: 'H', a: 'ESP', b: 'CPV' },
  { date: '2026-06-15', md: 1, group: 'H', a: 'KSA', b: 'URU' },
  { date: '2026-06-16', md: 1, group: 'I', a: 'FRA', b: 'SEN' },
  { date: '2026-06-16', md: 1, group: 'I', a: 'IRQ', b: 'NOR' },
  { date: '2026-06-16', md: 1, group: 'J', a: 'ARG', b: 'ALG' },
  { date: '2026-06-17', md: 1, group: 'J', a: 'AUT', b: 'JOR' },
  { date: '2026-06-17', md: 1, group: 'K', a: 'POR', b: 'COD' },
  { date: '2026-06-17', md: 1, group: 'K', a: 'UZB', b: 'COL' },
  { date: '2026-06-17', md: 1, group: 'L', a: 'ENG', b: 'CRO' },
  { date: '2026-06-17', md: 1, group: 'L', a: 'GHA', b: 'PAN' },
  // —— 第 2 轮 ——
  { date: '2026-06-18', md: 2, group: 'A', a: 'MEX', b: 'KOR' },
  { date: '2026-06-18', md: 2, group: 'A', a: 'CZE', b: 'RSA' },
  { date: '2026-06-18', md: 2, group: 'B', a: 'CAN', b: 'QAT' },
  { date: '2026-06-18', md: 2, group: 'B', a: 'SUI', b: 'BIH' },
  { date: '2026-06-19', md: 2, group: 'C', a: 'BRA', b: 'HAI' },
  { date: '2026-06-19', md: 2, group: 'C', a: 'SCO', b: 'MAR' },
  { date: '2026-06-19', md: 2, group: 'D', a: 'USA', b: 'AUS' },
  { date: '2026-06-20', md: 2, group: 'D', a: 'TUR', b: 'PAR' },
  { date: '2026-06-20', md: 2, group: 'E', a: 'GER', b: 'CIV' },
  { date: '2026-06-20', md: 2, group: 'E', a: 'ECU', b: 'CUW' },
  { date: '2026-06-20', md: 2, group: 'F', a: 'NED', b: 'SWE' },
  { date: '2026-06-21', md: 2, group: 'F', a: 'TUN', b: 'JPN' },
  { date: '2026-06-21', md: 2, group: 'G', a: 'BEL', b: 'IRN' },
  { date: '2026-06-21', md: 2, group: 'G', a: 'NZL', b: 'EGY' },
  { date: '2026-06-21', md: 2, group: 'H', a: 'ESP', b: 'KSA' },
  { date: '2026-06-21', md: 2, group: 'H', a: 'URU', b: 'CPV' },
  { date: '2026-06-22', md: 2, group: 'I', a: 'FRA', b: 'IRQ' },
  { date: '2026-06-22', md: 2, group: 'I', a: 'NOR', b: 'SEN' },
  { date: '2026-06-22', md: 2, group: 'J', a: 'ARG', b: 'AUT' },
  { date: '2026-06-22', md: 2, group: 'J', a: 'JOR', b: 'ALG' },
  { date: '2026-06-23', md: 2, group: 'K', a: 'POR', b: 'UZB' },
  { date: '2026-06-23', md: 2, group: 'K', a: 'COL', b: 'COD' },
  { date: '2026-06-23', md: 2, group: 'L', a: 'ENG', b: 'GHA' },
  { date: '2026-06-23', md: 2, group: 'L', a: 'PAN', b: 'CRO' },
  // —— 第 3 轮（每组两场同时进行）——
  { date: '2026-06-24', md: 3, group: 'A', a: 'CZE', b: 'MEX' },
  { date: '2026-06-24', md: 3, group: 'A', a: 'RSA', b: 'KOR' },
  { date: '2026-06-24', md: 3, group: 'B', a: 'SUI', b: 'CAN' },
  { date: '2026-06-24', md: 3, group: 'B', a: 'BIH', b: 'QAT' },
  { date: '2026-06-24', md: 3, group: 'C', a: 'SCO', b: 'BRA' },
  { date: '2026-06-24', md: 3, group: 'C', a: 'MAR', b: 'HAI' },
  { date: '2026-06-25', md: 3, group: 'D', a: 'TUR', b: 'USA' },
  { date: '2026-06-25', md: 3, group: 'D', a: 'PAR', b: 'AUS' },
  { date: '2026-06-25', md: 3, group: 'E', a: 'ECU', b: 'GER' },
  { date: '2026-06-25', md: 3, group: 'E', a: 'CUW', b: 'CIV' },
  { date: '2026-06-25', md: 3, group: 'F', a: 'JPN', b: 'SWE' },
  { date: '2026-06-25', md: 3, group: 'F', a: 'TUN', b: 'NED' },
  { date: '2026-06-26', md: 3, group: 'G', a: 'EGY', b: 'IRN' },
  { date: '2026-06-26', md: 3, group: 'G', a: 'NZL', b: 'BEL' },
  { date: '2026-06-26', md: 3, group: 'H', a: 'URU', b: 'ESP' },
  { date: '2026-06-26', md: 3, group: 'H', a: 'CPV', b: 'KSA' },
  { date: '2026-06-26', md: 3, group: 'I', a: 'NOR', b: 'FRA' },
  { date: '2026-06-26', md: 3, group: 'I', a: 'SEN', b: 'IRQ' },
  { date: '2026-06-27', md: 3, group: 'J', a: 'ARG', b: 'JOR' },
  { date: '2026-06-27', md: 3, group: 'J', a: 'ALG', b: 'AUT' },
  { date: '2026-06-27', md: 3, group: 'K', a: 'COL', b: 'POR' },
  { date: '2026-06-27', md: 3, group: 'K', a: 'COD', b: 'UZB' },
  { date: '2026-06-27', md: 3, group: 'L', a: 'PAN', b: 'ENG' },
  { date: '2026-06-27', md: 3, group: 'L', a: 'CRO', b: 'GHA' },
];

// 官方已赛比分（截至 6/13），首次访问时自动导入到「实际赛果」
const RESULTS_SEED = [
  { a: 'MEX', b: 'RSA', ga: 2, gb: 0 },
  { a: 'KOR', b: 'CZE', ga: 2, gb: 1 },
  { a: 'CAN', b: 'BIH', ga: 1, gb: 1 },
  { a: 'USA', b: 'PAR', ga: 4, gb: 1 },
  { a: 'QAT', b: 'SUI', ga: 1, gb: 1 },
  { a: 'BRA', b: 'MAR', ga: 1, gb: 1 },
  { a: 'HAI', b: 'SCO', ga: 0, gb: 1 },
];

// 全部有比赛的日期（升序、去重）
const SCHEDULE_DATES = [...new Set(SCHEDULE.map((m) => m.date))].sort();

function fixturesOnDate(date) {
  return SCHEDULE.filter((m) => m.date === date);
}

// 日期中文显示，如 "6月14日 周日"
function dateLabel(iso) {
  const d = new Date(iso + 'T12:00:00');
  const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${wk}`;
}
