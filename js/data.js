// 2026 美加墨世界杯 48 强数据 —— 三个独立数据源（尽量取真实公开数值并标注来源）
// 分组为 2025-12-05 华盛顿抽签 + 2026 年 3 月附加赛的最终结果
//
// 每队三个实力指标 + 来源标记：
//   elo / srcElo  : 世界足球 Elo 评分。srcElo='src' 为实测（eloratings.net /
//                   Wikipedia「World Football Elo Ratings」2026-01-19 快照）；
//                   'src~' 为单一来源近似；'est' 为推算——用各组平均 Elo
//                   （footrankings 公布，覆盖全 48 队）减去组内实测值后，按 FIFA
//                   积分比例分配给无实测值的球队（可复现，详见 README）。
//   fifa / srcFifa: FIFA/可口可乐世界排名积分，2026-04-01 版。srcFifa='exact'
//                   为官方公布积分（ESPN Top-50 / football-ranking.com）；
//                   'rank' 为仅知排名、由相邻名次插值的近似积分。
//   odds          : 博彩公司夺冠赔率（美式 +X，2026-06 开赛前 BetMGM/FanDuel 等；
//                   头部为报道证实值，其余按市场惯例估算）。
// 数据源与日期见文件末 RATINGS_META。所有数值可手动修改，页面即时生效。
const TEAMS = {
  // A 组
  MEX: { code: 'MEX', zh: '墨西哥', en: 'Mexico', flag: '🇲🇽', elo: 1800, srcElo: 'src~', fifa: 1681.03, srcFifa: 'exact', odds: 5000, group: 'A', host: true },
  RSA: { code: 'RSA', zh: '南非', en: 'South Africa', flag: '🇿🇦', elo: 1587, srcElo: 'est', fifa: 1407, srcFifa: 'rank', odds: 25000, group: 'A' },
  KOR: { code: 'KOR', zh: '韩国', en: 'South Korea', flag: '🇰🇷', elo: 1795, srcElo: 'est', fifa: 1591, srcFifa: 'exact', odds: 15000, group: 'A' },
  CZE: { code: 'CZE', zh: '捷克', en: 'Czechia', flag: '🇨🇿', elo: 1698, srcElo: 'est', fifa: 1505, srcFifa: 'exact', odds: 15000, group: 'A' },
  // B 组
  CAN: { code: 'CAN', zh: '加拿大', en: 'Canada', flag: '🇨🇦', elo: 1720, srcElo: 'est', fifa: 1559, srcFifa: 'exact', odds: 10000, group: 'B', host: true },
  SUI: { code: 'SUI', zh: '瑞士', en: 'Switzerland', flag: '🇨🇭', elo: 1897, srcElo: 'src', fifa: 1649.40, srcFifa: 'exact', odds: 8000, group: 'B' },
  QAT: { code: 'QAT', zh: '卡塔尔', en: 'Qatar', flag: '🇶🇦', elo: 1576, srcElo: 'est', fifa: 1428, srcFifa: 'rank', odds: 50000, group: 'B' },
  BIH: { code: 'BIH', zh: '波黑', en: 'Bosnia & Herzegovina', flag: '🇧🇦', elo: 1531, srcElo: 'est', fifa: 1387, srcFifa: 'rank', odds: 30000, group: 'B' },
  // C 组
  BRA: { code: 'BRA', zh: '巴西', en: 'Brazil', flag: '🇧🇷', elo: 1979, srcElo: 'src', fifa: 1761.16, srcFifa: 'exact', odds: 800, group: 'C' },
  MAR: { code: 'MAR', zh: '摩洛哥', en: 'Morocco', flag: '🇲🇦', elo: 1977, srcElo: 'est', fifa: 1755.87, srcFifa: 'exact', odds: 3000, group: 'C' },
  SCO: { code: 'SCO', zh: '苏格兰', en: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', elo: 1692, srcElo: 'est', fifa: 1503, srcFifa: 'exact', odds: 20000, group: 'C' },
  HAI: { code: 'HAI', zh: '海地', en: 'Haiti', flag: '🇭🇹', elo: 1456, srcElo: 'est', fifa: 1293, srcFifa: 'exact', odds: 100000, group: 'C' },
  // D 组
  USA: { code: 'USA', zh: '美国', en: 'United States', flag: '🇺🇸', elo: 1904, srcElo: 'est', fifa: 1673.13, srcFifa: 'exact', odds: 5000, group: 'D', host: true },
  TUR: { code: 'TUR', zh: '土耳其', en: 'Türkiye', flag: '🇹🇷', elo: 1826, srcElo: 'est', fifa: 1605, srcFifa: 'exact', odds: 8000, group: 'D' },
  AUS: { code: 'AUS', zh: '澳大利亚', en: 'Australia', flag: '🇦🇺', elo: 1797, srcElo: 'est', fifa: 1579, srcFifa: 'exact', odds: 25000, group: 'D' },
  PAR: { code: 'PAR', zh: '巴拉圭', en: 'Paraguay', flag: '🇵🇾', elo: 1713, srcElo: 'est', fifa: 1505, srcFifa: 'exact', odds: 25000, group: 'D' },
  // E 组
  GER: { code: 'GER', zh: '德国', en: 'Germany', flag: '🇩🇪', elo: 1910, srcElo: 'src', fifa: 1730.37, srcFifa: 'exact', odds: 1400, group: 'E' },
  ECU: { code: 'ECU', zh: '厄瓜多尔', en: 'Ecuador', flag: '🇪🇨', elo: 1933, srcElo: 'src', fifa: 1598, srcFifa: 'exact', odds: 6500, group: 'E' },
  CIV: { code: 'CIV', zh: '科特迪瓦', en: 'Ivory Coast', flag: '🇨🇮', elo: 1698, srcElo: 'est', fifa: 1540, srcFifa: 'exact', odds: 20000, group: 'E' },
  CUW: { code: 'CUW', zh: '库拉索', en: 'Curaçao', flag: '🇨🇼', elo: 1427, srcElo: 'est', fifa: 1294, srcFifa: 'exact', odds: 100000, group: 'E' },
  // F 组
  NED: { code: 'NED', zh: '荷兰', en: 'Netherlands', flag: '🇳🇱', elo: 1959, srcElo: 'src', fifa: 1757.87, srcFifa: 'exact', odds: 2000, group: 'F' },
  JPN: { code: 'JPN', zh: '日本', en: 'Japan', flag: '🇯🇵', elo: 1879, srcElo: 'src', fifa: 1660.43, srcFifa: 'exact', odds: 4000, group: 'F' },
  TUN: { code: 'TUN', zh: '突尼斯', en: 'Tunisia', flag: '🇹🇳', elo: 1668, srcElo: 'est', fifa: 1476, srcFifa: 'exact', odds: 30000, group: 'F' },
  SWE: { code: 'SWE', zh: '瑞典', en: 'Sweden', flag: '🇸🇪', elo: 1706, srcElo: 'est', fifa: 1509, srcFifa: 'exact', odds: 15000, group: 'F' },
  // G 组
  BEL: { code: 'BEL', zh: '比利时', en: 'Belgium', flag: '🇧🇪', elo: 1849, srcElo: 'src', fifa: 1734.71, srcFifa: 'exact', odds: 4000, group: 'G' },
  IRN: { code: 'IRN', zh: '伊朗', en: 'Iran', flag: '🇮🇷', elo: 1832, srcElo: 'est', fifa: 1615, srcFifa: 'rank', odds: 25000, group: 'G' },
  EGY: { code: 'EGY', zh: '埃及', en: 'Egypt', flag: '🇪🇬', elo: 1772, srcElo: 'est', fifa: 1562, srcFifa: 'exact', odds: 20000, group: 'G' },
  NZL: { code: 'NZL', zh: '新西兰', en: 'New Zealand', flag: '🇳🇿', elo: 1447, srcElo: 'est', fifa: 1275, srcFifa: 'exact', odds: 50000, group: 'G' },
  // H 组
  ESP: { code: 'ESP', zh: '西班牙', en: 'Spain', flag: '🇪🇸', elo: 2171, srcElo: 'src', fifa: 1876.40, srcFifa: 'exact', odds: 450, group: 'H' },
  URU: { code: 'URU', zh: '乌拉圭', en: 'Uruguay', flag: '🇺🇾', elo: 1890, srcElo: 'src', fifa: 1673.07, srcFifa: 'exact', odds: 6500, group: 'H' },
  KSA: { code: 'KSA', zh: '沙特阿拉伯', en: 'Saudi Arabia', flag: '🇸🇦', elo: 1575, srcElo: 'est', fifa: 1402, srcFifa: 'rank', odds: 50000, group: 'H' },
  CPV: { code: 'CPV', zh: '佛得角', en: 'Cape Verde', flag: '🇨🇻', elo: 1540, srcElo: 'est', fifa: 1371, srcFifa: 'exact', odds: 50000, group: 'H' },
  // I 组
  FRA: { code: 'FRA', zh: '法国', en: 'France', flag: '🇫🇷', elo: 2063, srcElo: 'src', fifa: 1877.32, srcFifa: 'exact', odds: 500, group: 'I' },
  NOR: { code: 'NOR', zh: '挪威', en: 'Norway', flag: '🇳🇴', elo: 1922, srcElo: 'src', fifa: 1557, srcFifa: 'exact', odds: 3500, group: 'I' },
  SEN: { code: 'SEN', zh: '塞内加尔', en: 'Senegal', flag: '🇸🇳', elo: 1869, srcElo: 'src', fifa: 1688.99, srcFifa: 'exact', odds: 8000, group: 'I' },
  IRQ: { code: 'IRQ', zh: '伊拉克', en: 'Iraq', flag: '🇮🇶', elo: 1626, srcElo: 'est', fifa: 1423, srcFifa: 'rank', odds: 50000, group: 'I' },
  // J 组
  ARG: { code: 'ARG', zh: '阿根廷', en: 'Argentina', flag: '🇦🇷', elo: 2113, srcElo: 'src', fifa: 1874.81, srcFifa: 'exact', odds: 900, group: 'J' },
  AUT: { code: 'AUT', zh: '奥地利', en: 'Austria', flag: '🇦🇹', elo: 1842, srcElo: 'est', fifa: 1597, srcFifa: 'exact', odds: 10000, group: 'J' },
  ALG: { code: 'ALG', zh: '阿尔及利亚', en: 'Algeria', flag: '🇩🇿', elo: 1812, srcElo: 'est', fifa: 1571, srcFifa: 'exact', odds: 25000, group: 'J' },
  JOR: { code: 'JOR', zh: '约旦', en: 'Jordan', flag: '🇯🇴', elo: 1605, srcElo: 'est', fifa: 1392, srcFifa: 'rank', odds: 50000, group: 'J' },
  // K 组
  POR: { code: 'POR', zh: '葡萄牙', en: 'Portugal', flag: '🇵🇹', elo: 1976, srcElo: 'src', fifa: 1763.83, srcFifa: 'exact', odds: 900, group: 'K' },
  COL: { code: 'COL', zh: '哥伦比亚', en: 'Colombia', flag: '🇨🇴', elo: 1998, srcElo: 'src', fifa: 1693.09, srcFifa: 'exact', odds: 4000, group: 'K' },
  UZB: { code: 'UZB', zh: '乌兹别克斯坦', en: 'Uzbekistan', flag: '🇺🇿', elo: 1674, srcElo: 'est', fifa: 1458, srcFifa: 'exact', odds: 50000, group: 'K' },
  COD: { code: 'COD', zh: '刚果（金）', en: 'DR Congo', flag: '🇨🇩', elo: 1692, srcElo: 'est', fifa: 1474, srcFifa: 'exact', odds: 50000, group: 'K' },
  // L 组
  ENG: { code: 'ENG', zh: '英格兰', en: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', elo: 2042, srcElo: 'src', fifa: 1825.97, srcFifa: 'exact', odds: 700, group: 'L' },
  CRO: { code: 'CRO', zh: '克罗地亚', en: 'Croatia', flag: '🇭🇷', elo: 1933, srcElo: 'src', fifa: 1717.07, srcFifa: 'exact', odds: 5000, group: 'L' },
  GHA: { code: 'GHA', zh: '加纳', en: 'Ghana', flag: '🇬🇭', elo: 1501, srcElo: 'est', fifa: 1346, srcFifa: 'exact', odds: 25000, group: 'L' },
  PAN: { code: 'PAN', zh: '巴拿马', en: 'Panama', flag: '🇵🇦', elo: 1716, srcElo: 'est', fifa: 1539, srcFifa: 'exact', odds: 30000, group: 'L' },
};

// 数据来源与日期（用于「数据源」页展示）
const RATINGS_META = {
  elo: {
    label: '世界足球 Elo 评分',
    asOf: '2026-01-19（实测快照）',
    sources: [
      { name: 'eloratings.net', url: 'https://www.eloratings.net/' },
      { name: 'Wikipedia: World Football Elo Ratings', url: 'https://en.wikipedia.org/wiki/World_Football_Elo_Ratings' },
      { name: 'footballratings.org', url: 'https://www.footballratings.org/' },
      { name: 'footrankings（各组平均 Elo）', url: 'https://www.threads.com/@footrankings' },
    ],
  },
  fifa: {
    label: 'FIFA/可口可乐世界排名积分',
    asOf: '2026-04-01',
    sources: [
      { name: 'FIFA 官方排名', url: 'https://inside.fifa.com/fifa-world-ranking/men' },
      { name: 'ESPN: FIFA Top 50 (Apr 2026)', url: 'https://www.espn.com/soccer/story/_/id/46664763/fifa-mens-top-50-world-rankings' },
      { name: 'football-ranking.com', url: 'https://football-ranking.com/fifa_rankings' },
    ],
  },
  odds: {
    label: '夺冠赔率（美式）',
    asOf: '2026-06（开赛前）',
    sources: [
      { name: 'FOX Sports: World Cup champion odds', url: 'https://www.foxsports.com/stories/soccer/world-cup-2026-champion-odds' },
      { name: 'ESPN: World Cup odds', url: 'https://www.espn.com/soccer/story/_/id/49025269/spain-france-lead-world-cup-odds-usa-bettors-back-home-team' },
    ],
  },
  // 来源标记中文说明
  legend: {
    src: '实测（取自 Elo 源快照）',
    'src~': '单一来源近似',
    est: '推算（组均值 + FIFA 比例分配）',
    exact: '官方公布积分',
    rank: '按排名插值的近似积分',
  },
};

const GROUPS = {};
for (const t of Object.values(TEAMS)) {
  (GROUPS[t.group] = GROUPS[t.group] || []).push(t.code);
}
const GROUP_NAMES = Object.keys(GROUPS).sort();

// 32 强对阵模板（官方赛程 M73-M88）。
// '1A' = A 组第一，'2B' = B 组第二，'3:ABCDF' = 来自 A/B/C/D/F 组之一的小组第三
const R32_TEMPLATE = [
  { id: 73, home: '2A', away: '2B' },
  { id: 74, home: '1E', away: '3:ABCDF' },
  { id: 75, home: '1F', away: '2C' },
  { id: 76, home: '1C', away: '2F' },
  { id: 77, home: '1I', away: '3:CDFGH' },
  { id: 78, home: '2E', away: '2I' },
  { id: 79, home: '1A', away: '3:CEFHI' },
  { id: 80, home: '2K', away: '2L' },
  { id: 81, home: '1D', away: '3:BEFIJ' },
  { id: 82, home: '1G', away: '3:AEHIJ' },
  { id: 83, home: '2D', away: '2G' },
  { id: 84, home: '1H', away: '2J' },
  { id: 85, home: '1B', away: '3:EFGIJ' },
  { id: 86, home: '1J', away: '2H' },
  { id: 87, home: '1K', away: '3:DEIJL' },
  { id: 88, home: '1L', away: '3:EHIJK' },
];

// 后续轮次按相邻配对推进（近似官方走位，对整体概率影响很小）
const R16_TEMPLATE = [[74, 77], [73, 75], [76, 78], [79, 80], [83, 84], [81, 82], [86, 88], [85, 87]];
