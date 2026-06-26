const { callClaude, parseJsonLoose, naverSearch, setCors } = require('./_lib');

const SYS = `당신은 화장품 시중 유사제품 조사 전문가입니다.
아래에 실제 네이버 쇼핑/검색 결과(제품명/URL/쇼핑몰/스니펫)가 주어집니다. 이 목록 "안에 실제로 있는" 제품만 결과로 사용하세요.
목록에 없는 제품을 지어내지 마세요. 제조판매원이 스니펫에 명시되어 있지 않으면 mfr을 null로 두고 추측하지 마세요.
반드시 아래 JSON만 응답 (마크다운 금지):
{"products":[{"name":"제품명","brand":"브랜드명 또는 null","mfr":"스니펫에 명시된 제조판매원 또는 null","confidence":"high(라벨에 직접 명시)/mid(쇼핑몰 정보로 추정)/low(불확실)","evidence_url":"실제 URL","evidence_quote":"인용 문구"}]}
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
