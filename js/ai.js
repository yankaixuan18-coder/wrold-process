// AI 比赛分析模块
// 用大模型（DeepSeek / Claude / GPT）结合最新情报与赛况，对单场比赛输出结构化判断：
//   · 双方预期进球的调整系数（动机、轮换、状态）
//   · 假球 / 默契球 / 摆烂（dead rubber、双方都满意的比分）风险与可能比分
// 判断会被 model.js 接入泊松模型（见 matchLambdas / mixFixScenario）。
//
// 重要约束（务必如实告知用户）：
//   1) 纯静态网页无后端：API Key 只能由用户自己填写，保存在浏览器本地（localStorage），
//      调用时直接从浏览器请求各家接口（需对方允许跨域；Anthropic 需开启浏览器直连头）。
//   2) 基础聊天模型不会自动联网，「最新信息」主要来自用户粘贴的情报 + 模型自身知识。
//   3) 假球风险仅为基于公开赛况（出线形势、轮换、dead rubber）的统计推断，非事实指控。

const AI_CFG_KEY = 'wc2026_ai_cfg';
const AI_ASSESS_KEY = 'wc2026_ai_assess';
const AI_APPLY_KEY = 'wc2026_ai_apply';

const AI_PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    kind: 'openai',
  },
  gpt: {
    label: 'GPT (OpenAI)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    kind: 'openai',
  },
  claude: {
    label: 'Claude (Anthropic)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-opus-4-8',
    kind: 'anthropic',
  },
  openrouter: {
    label: 'OpenRouter（DeepSeek+联网，一个Key）',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'deepseek/deepseek-chat',
    kind: 'openai',
    builtinWeb: true, // 开启 web 时用 OpenRouter 自带联网插件，无需 Tavily
  },
  requesty: {
    label: 'Requesty（DeepSeek 等，一个Key）',
    endpoint: 'https://router.requesty.ai/v1/chat/completions',
    defaultModel: 'deepseek/deepseek-v4-pro',
    kind: 'openai',
    // 无自带联网：联网请用「维基百科/自定义/Tavily」检索来源
  },
};

const AI_CFG = { provider: 'deepseek', model: '', apiKey: '', tavilyKey: '', webSource: 'off', customSearchUrl: '' };
const AI_ASSESS = {}; // 'a|b' -> assessment（按录入朝向存储）

(function loadAICfg() {
  try {
    const raw = localStorage.getItem(AI_CFG_KEY);
    if (raw) Object.assign(AI_CFG, JSON.parse(raw));
    const a = localStorage.getItem(AI_ASSESS_KEY);
    if (a) Object.assign(AI_ASSESS, JSON.parse(a));
  } catch (e) { /* ignore */ }
})();

function saveAICfg() { try { localStorage.setItem(AI_CFG_KEY, JSON.stringify(AI_CFG)); } catch (e) { /* ignore */ } }
function saveAIAssess() { try { localStorage.setItem(AI_ASSESS_KEY, JSON.stringify(AI_ASSESS)); } catch (e) { /* ignore */ } }

// 全局开关：是否在所有预测 / 模拟 / 投注中应用 AI 调整
function aiApplyOn() {
  try { return localStorage.getItem(AI_APPLY_KEY) === '1'; } catch (e) { return false; }
}
function setAIApply(on) { try { localStorage.setItem(AI_APPLY_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } }

// 评估查询（朝向：A=主队）。反向命中时翻转主客字段。
function getAIAssessment(a, b) {
  if (AI_ASSESS[a + '|' + b]) return AI_ASSESS[a + '|' + b];
  const rev = AI_ASSESS[b + '|' + a];
  return rev ? flipAssessment(rev) : null;
}
function flipAssessment(x) {
  return {
    ...x,
    homeGoalMult: x.awayGoalMult,
    awayGoalMult: x.homeGoalMult,
    homeMotivation: x.awayMotivation,
    awayMotivation: x.homeMotivation,
    fixScores: (x.fixScores || []).map((s) => ({ a: s.b, b: s.a, weight: s.weight })),
  };
}

function clampNum(x, lo, hi, dflt) {
  const n = Number(x);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

// 把模型返回的原始 JSON 规整为可信赖的评估对象
function normalizeAssessment(raw, fixture, meta) {
  const o = raw || {};
  const fixScores = Array.isArray(o.fixScores) ? o.fixScores
    .map((s) => ({ a: clampNum(s.a, 0, 8, 0), b: clampNum(s.b, 0, 8, 0), weight: clampNum(s.weight, 0, 100, 1) }))
    .filter((s) => s.weight > 0).slice(0, 6) : [];
  return {
    a: fixture.a, b: fixture.b, group: fixture.group, md: fixture.md, date: fixture.date,
    summary: String(o.summary || '').slice(0, 600),
    homeGoalMult: clampNum(o.homeGoalMult, 0.3, 2, 1),
    awayGoalMult: clampNum(o.awayGoalMult, 0.3, 2, 1),
    homeMotivation: clampNum(o.homeMotivation, 0, 1, 0.5),
    awayMotivation: clampNum(o.awayMotivation, 0, 1, 0.5),
    fixRisk: clampNum(o.fixRisk, 0, 1, 0),
    fixScores,
    keyFactors: Array.isArray(o.keyFactors) ? o.keyFactors.map((s) => String(s).slice(0, 200)).slice(0, 8) : [],
    confidence: clampNum(o.confidence, 0, 1, 0.5),
    provider: meta.provider, model: meta.model, ts: Date.now(),
  };
}

// 组装提示词：把对阵、实力、赔率、积分形势、剩余赛程、用户情报、基础预测都给模型
function buildAIPrompt(fixture, extraContext) {
  const A = TEAMS[fixture.a], B = TEAMS[fixture.b];
  const imp = (o) => (100 / (o + 100) * 100).toFixed(1) + '%';
  const standLine = (g) => groupStandings(g).map((r, i) =>
    `${i + 1}.${TEAMS[r.code].zh} ${r.Pts}分(${r.P}场,净${r.GD >= 0 ? '+' : ''}${r.GD})`).join('；');
  const remain = (code) => {
    const o = remainingOpponents(code).map((x) => TEAMS[x].zh);
    return o.length ? o.join('、') : '无（小组赛已踢完）';
  };
  // 基础预测（不含 AI 调整）作为锚点
  const base = predictMatch(A, B, { model: 'ensemble', useHome: true, dc: true, ai: false });

  const system = '你是一名足球数据分析师，擅长结合赛况与最新情报评估世界杯小组赛比赛。'
    + '你尤其关注「比赛动机」与「非竞争性比赛」风险——例如已出线/已出局的 dead rubber、'
    + '末轮双方都满意某一比分而默契踢平、主力轮换、摆烂等（这类情况常规泊松模型无法捕捉）。'
    + '请基于公开赛况与给定情报做统计推断，不要做无证据的造假指控。'
    + '只输出一个 JSON 对象，不要任何额外文字或 Markdown。';

  const schema = `{
  "summary": "一句中文总结这场比赛的动机与风险",
  "homeGoalMult": 1.0,   // ${A.zh}预期进球的缩放系数(0.3~2.0)，>1更想进球，<1摆烂/轮换
  "awayGoalMult": 1.0,   // ${B.zh}预期进球的缩放系数(0.3~2.0)
  "homeMotivation": 0.7, // ${A.zh}求胜动机(0~1)
  "awayMotivation": 0.7, // ${B.zh}求胜动机(0~1)
  "fixRisk": 0.0,        // 该场为「默契球/dead rubber/非常规结果」的概率(0~1)
  "fixScores": [ {"a":1,"b":1,"weight":1} ], // 若fixRisk>0，列出该情景下最可能的比分及权重(${A.zh}进球a:${B.zh}进球b)
  "keyFactors": ["关键因素1","关键因素2"],
  "confidence": 0.6      // 你对本次判断的置信度(0~1)
}`;

  const user = [
    `【比赛】${fixture.date} ${fixture.group}组 第${fixture.md}轮：${A.zh}(主) vs ${B.zh}(客)`,
    `【实力】${A.zh}：Elo ${A.elo}，FIFA ${A.fifa}，夺冠赔率+${A.odds}(隐含${imp(A.odds)})${A.host ? '，东道主' : ''}`,
    `        ${B.zh}：Elo ${B.elo}，FIFA ${B.fifa}，夺冠赔率+${B.odds}(隐含${imp(B.odds)})${B.host ? '，东道主' : ''}`,
    `【${fixture.group}组当前积分】${standLine(fixture.group)}`,
    `【剩余对手】${A.zh}：${remain(A.code)}；${B.zh}：${remain(B.code)}`,
    `【模型基础预测(未含动机调整)】最可能比分 ${base.best.a}:${base.best.b}，` +
      `${A.zh}胜${(base.probs.win * 100).toFixed(0)}% / 平${(base.probs.draw * 100).toFixed(0)}% / ${B.zh}胜${(base.probs.loss * 100).toFixed(0)}%`,
    fixture.md === 3 ? '【提示】这是小组赛末轮，dead rubber 与默契球风险通常更高，请重点评估。' : '',
    extraContext ? `【最新情报(用户提供，请重点参考)】\n${extraContext}` : '【最新情报】无，请基于赛况与你的知识判断。',
    '',
    '请只返回如下结构的 JSON（数值要落在注释范围内）：',
    schema,
  ].filter(Boolean).join('\n');

  return { system, user };
}

// 健壮地从模型输出中抽取 JSON
function parseAIJson(text) {
  if (!text) throw new Error('模型返回为空');
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  if (i < 0 || j < 0 || j < i) throw new Error('未找到 JSON：' + text.slice(0, 120));
  return JSON.parse(text.slice(i, j + 1));
}

// 调用所选大模型，返回 { text, sources }
async function callLLM(system, user) {
  const prov = AI_PROVIDERS[AI_CFG.provider];
  if (!prov) throw new Error('未知服务商');
  if (!AI_CFG.apiKey) throw new Error('请先填写 API Key');
  const model = AI_CFG.model || prov.defaultModel;
  let res, data;
  if (prov.kind === 'anthropic') {
    res = await fetch(prov.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': AI_CFG.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model, max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('Claude 接口错误：' + (data.error ? data.error.message : res.status));
    const block = (data.content || []).find((b) => b.type === 'text');
    return { text: block ? block.text : '', sources: [] };
  }
  // OpenAI 兼容（DeepSeek / GPT / OpenRouter / Requesty）
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 4000,
  };
  // OpenRouter 自带联网（一个 Key 搞定 DeepSeek + 联网）：检索来源选 openrouter 时挂 web 插件
  if (prov.builtinWeb && AI_CFG.webSource === 'openrouter') body.plugins = [{ id: 'web', max_results: 5 }];
  res = await fetch(prov.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + AI_CFG.apiKey },
    body: JSON.stringify(body),
  });
  data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const em = data.error ? (data.error.message || JSON.stringify(data.error)) : ('HTTP ' + res.status);
    const authIssue = res.status === 401 || res.status === 403 || /auth|api[_ ]?key|credential/i.test(em);
    const hint = authIssue
      ? '（请确认「服务商」与「API Key」匹配并已点保存：OpenRouter 用 sk-or- 开头，Requesty 用 rqsty- 开头，DeepSeek 官方用 sk- 开头）'
      : '';
    throw new Error(prov.label + ' 接口错误：' + em + hint);
  }
  const choice = data.choices && data.choices[0] ? data.choices[0] : null;
  const msg = choice ? choice.message : null;
  // 健壮取正文：兼容 content 为字符串/数组，以及推理模型的 reasoning 字段
  let text = '';
  if (msg) {
    if (typeof msg.content === 'string') text = msg.content;
    else if (Array.isArray(msg.content)) text = msg.content.map((p) => (typeof p === 'string' ? p : (p.text || p.content || ''))).join('');
    if (!text && msg.reasoning) text = msg.reasoning;
    if (!text && msg.reasoning_content) text = msg.reasoning_content;
  }
  const sources = msg && Array.isArray(msg.annotations)
    ? msg.annotations.filter((a) => a.type === 'url_citation' && a.url_citation)
      .map((a) => ({ title: a.url_citation.title || a.url_citation.url, url: a.url_citation.url }))
    : [];
  if (!text.trim()) {
    const fr = choice ? choice.finish_reason : '';
    throw new Error(prov.label + ' 返回空内容（finish_reason=' + (fr || '?') + '）。常见原因：①模型名该服务商不支持（OpenRouter 上 DeepSeek 请用 deepseek/deepseek-chat，不是 deepseek-v4-pro）；②被推理占满 token。请改模型名后重试。');
  }
  return { text, sources };
}

// ---------- Tavily 联网检索（为 DeepSeek 等补充最新情报） ----------
// DeepSeek 直连 API 无联网搜索，这里用 Tavily（专为 LLM 设计、可浏览器直连）作检索层。
async function tavilySearch(query) {
  if (!AI_CFG.tavilyKey) throw new Error('未配置 Tavily Key');
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: AI_CFG.tavilyKey, // 放在 body，避开 Authorization 头的跨域预检
      query, topic: 'news', days: 21, max_results: 5,
      search_depth: 'basic', include_answer: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Tavily 错误：' + (data.error || data.detail || res.status));
  return data;
}

function webQueryForMatch(A, B, fixture) {
  return `${A.en} vs ${B.en} 2026 FIFA World Cup ${fixture.date} team news injuries suspensions lineup rotation qualification scenario`;
}

// 返回 { text, sources }；text 注入提示词，sources 用于展示
async function webContextForMatch(A, B, fixture) {
  const data = await tavilySearch(webQueryForMatch(A, B, fixture));
  const lines = [];
  if (data.answer) lines.push('概要：' + data.answer);
  const results = (data.results || []).slice(0, 5);
  for (const r of results) lines.push(`- ${r.title}：${String(r.content || '').slice(0, 300)}（${r.url}）`);
  return { text: lines.join('\n') || '（无检索结果）', sources: results.map((r) => ({ title: r.title, url: r.url })) };
}

// 分析单场，写入存储并返回评估
async function analyzeMatch(fixture, extraContext) {
  const A = TEAMS[fixture.a], B = TEAMS[fixture.b];
  const prov = AI_PROVIDERS[AI_CFG.provider] || {};
  const src = AI_CFG.webSource || 'off';
  let ctx = extraContext || '';
  let sources = [];
  let webUsed = false;

  // 前置检索（OpenRouter 自带联网在 callLLM 内处理，这里不预检索）
  async function preSearch() {
    if (src === 'wiki') return wikiContextForMatch(A, B, fixture);            // 自制·免 Key
    if (src === 'custom') return customContextForMatch(A, B, fixture, AI_CFG.customSearchUrl); // 自建端点
    if (src === 'tavily' && AI_CFG.tavilyKey) return webContextForMatch(A, B, fixture);        // Tavily
    return null;
  }
  if (src === 'wiki' || src === 'custom' || (src === 'tavily' && AI_CFG.tavilyKey)) {
    try {
      const w = await preSearch();
      if (w) {
        const tag = src === 'wiki' ? '维基百科检索' : src === 'custom' ? '自定义检索' : 'Tavily 检索';
        ctx = (ctx ? ctx + '\n\n' : '') + `【${tag}（最新）】\n` + w.text;
        sources = w.sources; webUsed = true;
      }
    } catch (e) {
      ctx = (ctx ? ctx + '\n\n' : '') + '【检索失败，已忽略】' + e.message;
    }
  }

  const { system, user } = buildAIPrompt(fixture, ctx);
  const out = await callLLM(system, user); // { text, sources }
  const assess = normalizeAssessment(parseAIJson(out.text), fixture,
    { provider: AI_CFG.provider, model: AI_CFG.model || AI_PROVIDERS[AI_CFG.provider].defaultModel });
  // OpenRouter 自带联网：来源取自模型返回的引用注解
  if (src === 'openrouter' && prov.builtinWeb) { sources = out.sources; webUsed = true; }
  assess.sources = sources;
  assess.web = webUsed;
  AI_ASSESS[fixture.a + '|' + fixture.b] = assess;
  saveAIAssess();
  return assess;
}

// 直接写入手动评估（无需 API Key，便于离线试用 / 人工录入）
function setManualAssessment(fixture, raw) {
  const assess = normalizeAssessment(raw, fixture, { provider: 'manual', model: '手动' });
  AI_ASSESS[fixture.a + '|' + fixture.b] = assess;
  saveAIAssess();
  return assess;
}

function removeAssessment(a, b) {
  delete AI_ASSESS[a + '|' + b];
  delete AI_ASSESS[b + '|' + a];
  saveAIAssess();
}
function clearAssessments() {
  for (const k of Object.keys(AI_ASSESS)) delete AI_ASSESS[k];
  saveAIAssess();
}
function assessmentCount() { return Object.keys(AI_ASSESS).length; }
