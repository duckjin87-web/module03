const { callClaude, parseJsonLoose, naverSearch, setCors } = require('./_lib');

const SYS = `당신은 화장품 시중 유사제품 조사 전문가입니다.
아래에 실제 네이버 쇼핑/검색 결과(제품명/URL/쇼핑몰/스니펫)가 주어집니다. 이 목록 "안에 실제로 있는" 제품만 결과로 사용하세요. 목록에 없는 제품을 지어내지 마세요.

[매우 중요 — 한국 화장품법상 두 주체를 반드시 구분하세요]
- 화장품책임판매업자(책판): 브랜드/유통/판매 주체. 라벨·쇼핑정보의 "제조판매원"은 대개 이 책판입니다. 실제 공장이 아닙니다.
- 화장품제조업자(제조원): 실제로 제품을 만든 공장. 라벨에 "제조원"으로 별도 표기된 경우에만 확실합니다.
스니펫에 "제조원"이 명시되지 않았다면 manufacturer는 반드시 null로 두세요(책판을 제조원으로 옮겨 적지 마세요). 추측 금지.

반드시 아래 JSON만 응답 (마크다운 금지):
{"products":[{"name":"제품명","brand":"브랜드명 또는 null","seller":"책임판매업자(제조판매원) 또는 null","manufacturer":"스니펫에 '제조원'으로 명시된 실제 공장명 또는 null","manufacturer_confidence":"high(라벨에 제조원 직접 명시)/mid(정황상 추정)/low(불확실)","evidence_url":"실제 URL","evidence_quote":"인용 문구"}]}
목록에서 관련 제품을 찾을 수 없으면 products를 빈 배열로 반환하세요.`;

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { canonical, search_keywords = [] } = req.body || {};
    if (!canonical) return res.status(400).json({ error: 'CANONICAL_REQUIRED' });

    const queries = (search_keywords.length ? search_keywords : [canonical]).slice(0, 3);
    let results = [];
    for (const q of queries) {
      try {
        const r = await naverSearch({ type: 'shop', query: q, display: 10 });
        results.push(...r);
      } catch (e) { /* 개별 쿼리 실패는 무시 */ }
    }
    if (!results.length) {
      return res.status(200).json({ products: [], note: 'NO_SEARCH_RESULTS' });
    }
    const seen = new Set();
    results = results.filter(r => { if (seen.has(r.link)) return false; seen.add(r.link); return true; }).slice(0, 24);

    const userMsg = `타겟 유형: ${canonical}\n\n검색 결과 목록:\n${results.map((r, i) => `[${i + 1}] ${r.title} (${r.mall || '—'})\nURL: ${r.link}\n스니펫: ${r.snippet}`).join('\n\n')}`;
    const raw = await callClaude({ system: SYS, user: userMsg, maxTokens: 1400 });
    const parsed = parseJsonLoose(raw);
    if (!parsed) return res.status(502).json({ error: 'PARSE_FAILED', raw });
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
