// 自制检索模块（不走 Tavily / OpenRouter 等检索服务商）
// 直接调用对浏览器开放 CORS、且免 Key 的公共接口：
//   · wiki    : 维基百科 / MediaWiki —— 球队资料、2026 世界杯小组词条（含赛况/重要事件）
//   · custom  : 用户自建端点（如自托管 SearXNG），URL 模板含 {q}
// 说明：纯静态网页受 CORS 限制，无法直接抓取谷歌/必应等搜索引擎；维基类开放 API 可直连。
// 维基百科对同日伤病/首发等突发新闻覆盖有限，但球队背景与赛事进程是可靠的。

// 在维基百科搜索最匹配的词条标题（action API，origin=* 开启匿名 CORS）
async function wikiSearchTitle(query, lang = 'en') {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=` + encodeURIComponent(query);
  const r = await fetch(url);
  const d = await r.json().catch(() => ({}));
  const hit = d.query && d.query.search && d.query.search[0];
  return hit ? hit.title : null;
}

// 取词条摘要（REST summary，返回 Access-Control-Allow-Origin: *）
async function wikiSummary(title, lang = 'en') {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` + encodeURIComponent(title.replace(/ /g, '_'));
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  if (!d || !d.extract) return null;
  return {
    title: d.title || title,
    extract: d.extract,
    url: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page)
      || `https://${lang}.wikipedia.org/wiki/` + encodeURIComponent(title.replace(/ /g, '_')),
  };
}

// 为一场比赛检索：双方国家队 + 该组世界杯词条
async function wikiContextForMatch(A, B, fixture) {
  const targets = [
    `${A.en} national football team`,
    `${B.en} national football team`,
    `2026 FIFA World Cup Group ${fixture.group}`,
  ];
  const lines = [], sources = [];
  for (const t of targets) {
    try {
      const title = (await wikiSearchTitle(t)) || t;
      const s = await wikiSummary(title);
      if (s && s.extract) {
        lines.push(`【${s.title}】${s.extract.slice(0, 400)}`);
        sources.push({ title: s.title, url: s.url });
      }
    } catch (e) { /* 跳过单条失败 */ }
  }
  if (!lines.length) throw new Error('维基检索无结果（可能被 CORS/网络拦截）');
  return { text: lines.join('\n'), sources };
}

// 自定义检索端点（自建 SearXNG 等）。URL 模板含 {q}，期望返回 JSON。
async function customContextForMatch(A, B, fixture, urlTemplate) {
  if (!urlTemplate) throw new Error('未配置自定义检索 URL');
  const q = `${A.en} vs ${B.en} 2026 World Cup team news injuries lineup`;
  const url = urlTemplate.includes('{q}')
    ? urlTemplate.replace('{q}', encodeURIComponent(q))
    : urlTemplate + encodeURIComponent(q);
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  const d = await r.json().catch(() => null);
  if (!d) throw new Error('自定义检索返回非 JSON');
  const arr = d.results || d.items || d.organic || d.data || [];
  const lines = [], sources = [];
  for (const it of arr.slice(0, 5)) {
    const title = it.title || it.name || '';
    const link = it.url || it.link || it.href || '';
    const content = it.content || it.snippet || it.description || it.text || '';
    lines.push(`- ${title}：${String(content).slice(0, 300)}（${link}）`);
    if (link) sources.push({ title: title || link, url: link });
  }
  if (!lines.length) throw new Error('自定义检索无结果');
  return { text: lines.join('\n'), sources };
}
