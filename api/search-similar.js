const { callClaude, parseJsonLoose, naverSearch, stripTags, setCors } = require('./_lib');

/*
 유사제품 검색 파이프라인 (채널 역검색 강화판):
 1) 채널 역검색 — 네이버 쇼핑 + 채널×키워드 조합 웹검색(화해/올리브영/네이버쇼핑/다이소몰/블로그 내돈내산·성분리뷰)
 2) 상위 상세페이지 실제 fetch → 법정표기(화장품제조업자/책임판매업자) 직접 추출
 3) 제조원 미상 제품은 "제품명+제조업자" 2차 웹검색(2-hop) 후 재추출
 원칙: 제조원이 확인 안 돼도 제품은 목록에 남긴다(추천). 근거 URL은 인용 인덱스(모델은 번호만, 서버가 URL 부착).
*/

const SYS = `당신은 한국 화장품 소싱 실무자입니다. 국내 유통 화장품에는 화장품제조업자(제조원)가 표기되며 화해·올리브영·네이버쇼핑·다이소몰·브랜드몰·블로그 리뷰에서 확인됩니다.
아래에 번호가 붙은 실제 근거 자료(쇼핑/채널 검색결과 + 서버가 접속해 가져온 상세페이지 법정표기)가 주어집니다. 이 목록 "안에 실제로 있는" 제품만 사용하고, 없는 제품·회사를 지어내지 마세요.

[제품 추천 규칙 — 매우 중요]
- 서로 다른 브랜드 위주로 "최소 10개" 이상 추천하세요(가능하면 그 이상).
- 제조원이 확인되지 않아도 제품 자체는 반드시 목록에 남기세요(manufacturer=null로). 제품을 버리지 마세요.
- grade: "확정"=유형 일치 확실 / "유사"=근접 유형 / "의심"=관련 추정. 의심 품목도 버리지 말고 포함.

[제조원/책판 구분]
- 책임판매업자(책판): 브랜드/유통. "제조판매원" 표기는 대개 책판.
- 제조업자(제조원): 실제 공장. "화장품제조업자/제조업자/제조원" 표기만 확실.
근거에 제조업자가 명시되지 않으면 manufacturer=null. 책판을 제조원으로 옮겨 적기 금지.

evidence_idx에는 근거 자료 번호(정수)만. URL은 절대 직접 쓰지 마세요.
반드시 아래 JSON만 응답(마크다운 금지):
{"products":[{"brand":"브랜드","product":"제품명","channel":"확인 채널","grade":"확정/유사/의심","seller":"책판 또는 null","manufacturer":"제조업자 또는 null","manufacturer_confidence":"high/mid/low","evidence_idx":1,"evidence_quote":"근거 인용"}]}
관련 제품이 하나도 없으면 products는 빈 배열.`;

const HOP2_SYS = `아래 번호 붙은 웹 검색결과에서 각 제품의 "화장품제조업자(제조원/실제 공장)"만 찾아 반환하세요.
책임판매업자(브랜드/유통)를 제조원으로 적지 말고, 근거 없으면 그 제품은 제외하세요.
evidence_idx는 근거 번호(정수)만. URL 직접 작성 금지.
반드시 JSON만: {"found":[{"product":"제품명","manufacturer":"제조업자","confidence":"high/mid","evidence_idx":1,"evidence_quote":"인용"}]}`;

const LEGAL_RE = /(화장품\s*제조업자|화장품\s*책임판매업자|책임\s*판매업자|제조업자|제조판매업자|제조자|제조원)/g;
async function fetchLegalExtract(url) {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CosmeDB/1.0)' },
      redirect: 'follow',
    });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 600000);
    const text = stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).replace(/\s+/g, ' ');
    const extracts = [];
    let m; LEGAL_RE.lastIndex = 0;
    while ((m = LEGAL_RE.exec(text)) && extracts.length < 4) {
      extracts.push(text.slice(Math.max(0, m.index - 30), m.index + 150));
    }
    return extracts.length ? extracts.join(' … ') : null;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { canonical, search_keywords = [], feedback = '' } = req.body || {};
    if (!canonical) return res.status(400).json({ error: 'CANONICAL_REQUIRED' });
    const kws = (search_keywords.length ? search_keywords : [canonical]).slice(0, 3);

    // 1) 채널 역검색 — 쇼핑 + 채널×키워드 웹검색
    let results = [];
    for (const q of kws) {
      try { results.push(...(await naverSearch({ type: 'shop', query: q, display: 12 }))); } catch (e) {}
    }
    const base = canonical;
    const channelQueries = [
      `올리브영 ${base}`, `화해 ${base} 제조사`, `${base} 내돈내산 성분`,
      `다이소 ${base}`, `${base} 추천 브랜드`,
    ];
    for (const q of channelQueries) {
      try { results.push(...(await naverSearch({ type: 'web', query: q, display: 5 }))); } catch (e) {}
    }
    if (!results.length) return res.status(200).json({ products: [], note: 'NO_SEARCH_RESULTS' });

    const seen = new Set();
    results = results.filter(r => { if (seen.has(r.link)) return false; seen.add(r.link); return true; }).slice(0, 40);

    const sources = results.map(r => ({ kind: r.mall ? 'shop' : 'web', url: r.link, text: `${r.title}${r.mall ? ` (${r.mall})` : ''} — ${r.snippet}` }));

    // 2) 상위 상세페이지 실제 fetch (법정표기)
    const pageTargets = results.filter(r => r.mall).slice(0, 8);
    const pages = await Promise.allSettled(pageTargets.map(r => fetchLegalExtract(r.link)));
    pages.forEach((p, i) => {
      if (p.status === 'fulfilled' && p.value) {
        sources.push({ kind: 'page', url: pageTargets[i].link, text: `[상세페이지 법정표기] ${pageTargets[i].title} → ${p.value}` });
      }
    });

    const numbered = sources.map((s, i) => `[${i + 1}] ${s.text}`).join('\n\n');
    const userMsg = `타겟 유형: ${canonical}\n${feedback ? `\n[검수 피드백 — 반드시 반영]\n${feedback}\n` : ''}\n근거 자료 목록:\n${numbered}`;
    const raw = await callClaude({ system: SYS, user: userMsg, maxTokens: 2200 });
    const parsed = parseJsonLoose(raw);
    if (!parsed) return res.status(502).json({ error: 'PARSE_FAILED', raw });

    let products = (parsed.products || []).map(p => ({
      ...p,
      evidence_url: (p.evidence_idx >= 1 && p.evidence_idx <= sources.length) ? sources[p.evidence_idx - 1].url : null,
    }));

    // 3) 2-hop: 제조원 미상 제품 역추적 (제품은 유지, 제조원만 보강)
    const unknown = products.filter(p => !p.manufacturer).slice(0, 6);
    if (unknown.length) {
      let hopResults = [];
      for (const p of unknown) {
        try { hopResults.push(...(await naverSearch({ type: 'web', query: `${p.brand || ''} ${p.product || ''} 화장품제조업자 제조원`, display: 5 }))); } catch (e) {}
      }
      const seen2 = new Set();
      hopResults = hopResults.filter(r => { if (seen2.has(r.link)) return false; seen2.add(r.link); return true; }).slice(0, 20);
      if (hopResults.length) {
        const hopSources = hopResults.map(r => ({ url: r.link, text: `${r.title} — ${r.snippet}` }));
        const hopMsg = `대상 제품: ${unknown.map(p => p.product).join(' / ')}\n\n검색결과:\n${hopSources.map((s, i) => `[${i + 1}] ${s.text}`).join('\n\n')}`;
        try {
          const hopParsed = parseJsonLoose(await callClaude({ system: HOP2_SYS, user: hopMsg, maxTokens: 900 }));
          for (const f of (hopParsed?.found || [])) {
            const target = products.find(p => !p.manufacturer && p.product && f.product && (p.product.includes(f.product) || f.product.includes(p.product)));
            if (target && f.manufacturer) {
              target.manufacturer = f.manufacturer;
              target.manufacturer_confidence = f.confidence === 'high' ? 'high' : 'mid';
              target.evidence_quote = f.evidence_quote || target.evidence_quote;
              target.evidence_url = (f.evidence_idx >= 1 && f.evidence_idx <= hopSources.length) ? hopSources[f.evidence_idx - 1].url : target.evidence_url;
              target.hop2 = true;
            }
          }
        } catch (e) { /* 2-hop 실패는 1차 결과로 응답 */ }
      }
    }

    return res.status(200).json({ products, pages_fetched: sources.filter(s => s.kind === 'page').length });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
