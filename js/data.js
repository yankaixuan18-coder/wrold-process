// 2026 美加墨世界杯 48 强数据
// 分组为 2025-12-05 华盛顿抽签 + 2026 年 3 月附加赛的最终结果
// elo 为基于 eloratings.net / FIFA 排名的近似实力评分，可按需手动调整
const TEAMS = {
  // A 组
  MEX: { code: 'MEX', zh: '墨西哥', en: 'Mexico', flag: '🇲🇽', elo: 1870, group: 'A', host: true },
  RSA: { code: 'RSA', zh: '南非', en: 'South Africa', flag: '🇿🇦', elo: 1690, group: 'A' },
  KOR: { code: 'KOR', zh: '韩国', en: 'South Korea', flag: '🇰🇷', elo: 1820, group: 'A' },
  CZE: { code: 'CZE', zh: '捷克', en: 'Czechia', flag: '🇨🇿', elo: 1790, group: 'A' },
  // B 组
  CAN: { code: 'CAN', zh: '加拿大', en: 'Canada', flag: '🇨🇦', elo: 1810, group: 'B', host: true },
  SUI: { code: 'SUI', zh: '瑞士', en: 'Switzerland', flag: '🇨🇭', elo: 1880, group: 'B' },
  QAT: { code: 'QAT', zh: '卡塔尔', en: 'Qatar', flag: '🇶🇦', elo: 1640, group: 'B' },
  BIH: { code: 'BIH', zh: '波黑', en: 'Bosnia & Herzegovina', flag: '🇧🇦', elo: 1730, group: 'B' },
  // C 组
  BRA: { code: 'BRA', zh: '巴西', en: 'Brazil', flag: '🇧🇷', elo: 2050, group: 'C' },
  MAR: { code: 'MAR', zh: '摩洛哥', en: 'Morocco', flag: '🇲🇦', elo: 1940, group: 'C' },
  SCO: { code: 'SCO', zh: '苏格兰', en: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', elo: 1790, group: 'C' },
  HAI: { code: 'HAI', zh: '海地', en: 'Haiti', flag: '🇭🇹', elo: 1560, group: 'C' },
  // D 组
  USA: { code: 'USA', zh: '美国', en: 'United States', flag: '🇺🇸', elo: 1850, group: 'D', host: true },
  TUR: { code: 'TUR', zh: '土耳其', en: 'Türkiye', flag: '🇹🇷', elo: 1860, group: 'D' },
  AUS: { code: 'AUS', zh: '澳大利亚', en: 'Australia', flag: '🇦🇺', elo: 1780, group: 'D' },
  PAR: { code: 'PAR', zh: '巴拉圭', en: 'Paraguay', flag: '🇵🇾', elo: 1790, group: 'D' },
  // E 组
  GER: { code: 'GER', zh: '德国', en: 'Germany', flag: '🇩🇪', elo: 1980, group: 'E' },
  ECU: { code: 'ECU', zh: '厄瓜多尔', en: 'Ecuador', flag: '🇪🇨', elo: 1890, group: 'E' },
  CIV: { code: 'CIV', zh: '科特迪瓦', en: 'Ivory Coast', flag: '🇨🇮', elo: 1780, group: 'E' },
  CUW: { code: 'CUW', zh: '库拉索', en: 'Curaçao', flag: '🇨🇼', elo: 1580, group: 'E' },
  // F 组
  NED: { code: 'NED', zh: '荷兰', en: 'Netherlands', flag: '🇳🇱', elo: 2010, group: 'F' },
  JPN: { code: 'JPN', zh: '日本', en: 'Japan', flag: '🇯🇵', elo: 1900, group: 'F' },
  TUN: { code: 'TUN', zh: '突尼斯', en: 'Tunisia', flag: '🇹🇳', elo: 1740, group: 'F' },
  SWE: { code: 'SWE', zh: '瑞典', en: 'Sweden', flag: '🇸🇪', elo: 1790, group: 'F' },
  // G 组
  BEL: { code: 'BEL', zh: '比利时', en: 'Belgium', flag: '🇧🇪', elo: 1935, group: 'G' },
  IRN: { code: 'IRN', zh: '伊朗', en: 'Iran', flag: '🇮🇷', elo: 1800, group: 'G' },
  EGY: { code: 'EGY', zh: '埃及', en: 'Egypt', flag: '🇪🇬', elo: 1760, group: 'G' },
  NZL: { code: 'NZL', zh: '新西兰', en: 'New Zealand', flag: '🇳🇿', elo: 1590, group: 'G' },
  // H 组
  ESP: { code: 'ESP', zh: '西班牙', en: 'Spain', flag: '🇪🇸', elo: 2190, group: 'H' },
  URU: { code: 'URU', zh: '乌拉圭', en: 'Uruguay', flag: '🇺🇾', elo: 1900, group: 'H' },
  KSA: { code: 'KSA', zh: '沙特阿拉伯', en: 'Saudi Arabia', flag: '🇸🇦', elo: 1650, group: 'H' },
  CPV: { code: 'CPV', zh: '佛得角', en: 'Cape Verde', flag: '🇨🇻', elo: 1620, group: 'H' },
  // I 组
  FRA: { code: 'FRA', zh: '法国', en: 'France', flag: '🇫🇷', elo: 2090, group: 'I' },
  NOR: { code: 'NOR', zh: '挪威', en: 'Norway', flag: '🇳🇴', elo: 1950, group: 'I' },
  SEN: { code: 'SEN', zh: '塞内加尔', en: 'Senegal', flag: '🇸🇳', elo: 1850, group: 'I' },
  IRQ: { code: 'IRQ', zh: '伊拉克', en: 'Iraq', flag: '🇮🇶', elo: 1650, group: 'I' },
  // J 组
  ARG: { code: 'ARG', zh: '阿根廷', en: 'Argentina', flag: '🇦🇷', elo: 2175, group: 'J' },
  AUT: { code: 'AUT', zh: '奥地利', en: 'Austria', flag: '🇦🇹', elo: 1830, group: 'J' },
  ALG: { code: 'ALG', zh: '阿尔及利亚', en: 'Algeria', flag: '🇩🇿', elo: 1790, group: 'J' },
  JOR: { code: 'JOR', zh: '约旦', en: 'Jordan', flag: '🇯🇴', elo: 1660, group: 'J' },
  // K 组
  POR: { code: 'POR', zh: '葡萄牙', en: 'Portugal', flag: '🇵🇹', elo: 2040, group: 'K' },
  COL: { code: 'COL', zh: '哥伦比亚', en: 'Colombia', flag: '🇨🇴', elo: 1930, group: 'K' },
  UZB: { code: 'UZB', zh: '乌兹别克斯坦', en: 'Uzbekistan', flag: '🇺🇿', elo: 1700, group: 'K' },
  COD: { code: 'COD', zh: '刚果（金）', en: 'DR Congo', flag: '🇨🇩', elo: 1700, group: 'K' },
  // L 组
  ENG: { code: 'ENG', zh: '英格兰', en: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', elo: 2100, group: 'L' },
  CRO: { code: 'CRO', zh: '克罗地亚', en: 'Croatia', flag: '🇭🇷', elo: 1930, group: 'L' },
  GHA: { code: 'GHA', zh: '加纳', en: 'Ghana', flag: '🇬🇭', elo: 1750, group: 'L' },
  PAN: { code: 'PAN', zh: '巴拿马', en: 'Panama', flag: '🇵🇦', elo: 1700, group: 'L' },
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
