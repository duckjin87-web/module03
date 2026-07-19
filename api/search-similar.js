const { callClaude, parseJsonLoose, naverSearch, stripTags, setCors } = require('./_lib');

/*
 유사제품 검색 파이프라인 (3단):
 1) 네이버 쇼핑검색 → 후보 제품 수집
 2) 상위 상세페이지 실제 fetch → 법정표기(화장품제조업자/책임판매업자) 직접 추출  ← 정확도 최대 레버
 3) 제조원 미상 제품은 "제품명+제조업자" 2차 웹검색(2-hop) 후 재추출
 근거 URL은 모델이 쓰지 않는다 — 모델은 evidence_idx(번호)만 반환하고 서버가 실제 URL을 붙인다(환각 원천 차단).
*/

const SYS = `당신은 화장품 시중 유사제품 조사 전문가입니다.
아래에 번호가 붙은 실제 근거 자료 목록이 주어집니다: 네이버 쇼핑/웹 검색결과와, 서버가 실제로 접속해 가져온 상품 상세페이지의 법정표기 발췌문.
이 목록 "안에 실제로 있는" 제품만 결과로 사용하세요. 목록에 없는 제품·회사를 지어내지 마세요.

[매우 중요 — 한국 화장품법상 두 주체를 반드시 구분]
- 화장품책임판매업자(책판): 브랜드/유통 주체. "책임판매업자", "제조판매원" 표기는 대개 이것.
- 화장품제조업자(제조원): 실제 공장. "화장품제조업자", "제조업자", "제조원" 표기만 확실한 근거.
근거에 제조업자가 명시되지 않았으면 manufacturer는 null. 책판을 제조원 칸에 옮겨 적기 금지. 추측 금지.

evidence_idx에는 판단 근거가 된 자료의 번호(정수)를 넣으세요. URL은 절대 직접 쓰지 마세요.
반드시 아래 JSON만 응답 (마크다운 금지):
{"products":[{"name":"제품명","brand":"브랜드 또는 null","seller":"책임판매업자 또는 null","manufacturer":"명시된 제조업자(공장) 또는 null","manufacturer_confidence":"high(법정표기 직접 명시)/mid(정황 추정)/low(불확실)","evidence_idx":1,"evidence_quote":"근거 인용 문구"}]}
관련 제품이 없으면 products는 빈 배열.`;

const HOP2_SYS = `아래에 번호 붙은 웹 검색결과가 주어집니다. 각 제품의 "화장품제조업자(제조원/실제 공장)"를 이 검색결과 안에서만 찾아 반환하세요.
책임판매업자(브랜드/유통)를 제조원으로 적지 마세요. 근거가 없으면 그 제품은 결과에서 제외하세요.
evidence_idx에는 근거 자료 번호(정수)만. URL 직접 작성 금지.
반드시 JSON만: {"found":[{"product":"제품명","manufacturer":"제조업자","confidence":"high/mid","evidence_idx":1,"evidence_quote":"인용"}]}`;

// 상세페이지에서 법정표기 주변 텍스트 추출
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
    const { canonical, search_keywords = [] } = req.body || {};
    if (!canonical) return res.status(400).json({ error: 'CANONICAL_REQUIRED' });

    // 1) 쇼핑검색
    const queries = (search_keywords.length ? search_keywords : [canonical]).slice(0, 3);
    let results = [];
    for (const q of queries) {
      try { results.push(...await naverSearch({ type: 'shop', query: q, display: 10 })); } catch (e) {}
    }
    if (!results.length) return res.status(200).json({ products: [], note: 'NO_SEARCH_RESULTS' });
    const seen = new Set();
    results = results.filter(r => { if (seen.has(r.link)) return false; seen.add(r.link); return true; }).slice(0, 20);

    // 근거 자료 목록: 번호 → URL 매핑을 서버가 관리
    const sources = results.map(r => ({ kind: 'shop', url: r.link, text: `${r.title} (${r.mall || '—'}) — ${r.snippet}` }));

    // 2) 상위 상세페이지 실제 fetch (병렬, 실패 무시)
    const pageTargets = results.slice(0, 6);
    const pages = await Promise.allSettled(pageTargets.map(r => fetchLegalExtract(r.link)));
    pages.forEach((p, i) => {
      if (p.status === 'fulfilled' && p.value) {
        sources.push({ kind: 'page', url: pageTargets[i].link, text: `[상세페이지 법정표기] ${pageTargets[i].title} → ${p.value}` });
      }
    });

    const numbered = sources.map((s, i) => `[${i + 1}] ${s.text}`).join('\n\n');
    const userMsg = `타겟 유형: ${canonical}\n\n근거 자료 목록:\n${numbered}`;
    const raw = await callClaude({ system: SYS, user: userMsg, maxTokens: 1600 });
    const parsed = parseJsonLoose(raw);
    if (!parsed) return res.status(502).json({ error: 'PARSE_FAILED', raw });

    let products = (parsed.products || []).map(p => ({
      ...p,
      evidence_url: (p.evidence_idx >= 1 && p.evidence_idx <= sources.length) ? sources[p.evidence_idx - 1].url : null,
    }));

    // 3) 2-hop: 제조원 미상 제품을 "제품명 + 제조업자"로 재검색해 역추적
    const unknown = products.filter(p => !p.manufacturer).slice(0, 4);
    if (unknown.length) {
      let hopResults = [];
      for (const p of unknown) {
        try { hopResults.push(...await naverSearch({ type: 'web', query: `${p.name} 화장품제조업자 제조원`, display: 5 })); } catch (e) {}
      }
      const seen2 = new Set();
      hopResults = hopResults.filter(r => { if (seen2.has(r.link)) return false; seen2.add(r.link); return true; }).slice(0, 15);
      if (hopResults.length) {
        const hopSources = hopResults.map(r => ({ url: r.link, text: `${r.title} — ${r.snippet}` }));
        const hopMsg = `대상 제품: ${unknown.map(p => p.name).join(' / ')}\n\n검색결과:\n${hopSources.map((s, i) => `[${i + 1}] ${s.text}`).join('\n\n')}`;
        try {
          const hopRaw = await callClaude({ system: HOP2_SYS, user: hopMsg, maxTokens: 800 });
          const hopParsed = parseJsonLoose(hopRaw);
          for (const f of (hopParsed?.found || [])) {
            const target = products.find(p => !p.manufacturer && p.name && f.product && (p.name.includes(f.product) || f.product.includes(p.name)));
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
