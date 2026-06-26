const { callClaude, parseJsonLoose, naverSearch, setCors } = require('./_lib');

const SYS = `당신은 화장품 OEM/ODM 제조업체 소싱 전문가입니다.
아래에 실제 검색 결과(제목/URL/스니펫)가 주어집니다. 이 검색 결과 "안에 실제로 등장하는" 화장품 제조업체만 후보로 뽑으세요.
검색 결과에 없는 회사명을 지어내거나 기억으로 추가하지 마세요 — 검색 결과 밖의 회사는 절대 포함 금지.
각 후보에 대해 제공된 핵심설비/공정 키워드와 스니펫 내용이 얼마나 부합하는지 capability_score(0~100)로 평가하고,
반드시 그 후보를 언급한 검색결과의 실제 URL을 evidence_url로, 관련 문구를 evidence_quote로 그대로 인용하세요.
반드시 아래 JSON만 응답 (마크다운 금지):
{"candidates":[{"name":"업체명","capability_score":0,"capability_note":"부합 판단 근거 1줄","evidence_url":"검색결과의 실제 URL","evidence_quote":"검색결과 스니펫에서 인용한 문구","location":"언급되어 있으면 소재지, 없으면 null"}]}
검색 결과에서 화장품 제조업체를 전혀 찾을 수 없으면 candidates를 빈 배열로 반환하세요.`;

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { canonical, key_equipment = [], search_keywords = [] } = req.body || {};
    if (!canonical) return res.status(400).json({ error: 'CANONICAL_REQUIRED' });

    const queries = (search_keywords.length ? search_keywords : [canonical]).slice(0, 4)
      .map(q => `${q} 화장품 제조 OEM ODM`);

    let results = [];
    for (const q of queries) {
      try {
        const r = await naverSearch({ type: 'web', query: q, display: 8 });
        results.push(...r);
      } catch (e) { /* 개별 쿼리 실패는 무시하고 계속 */ }
    }
    if (!results.length) {
      return res.status(200).json({ candidates: [], note: 'NO_SEARCH_RESULTS' });
    }
    // dedupe by link
    const seen = new Set();
    results = results.filter(r => { if (seen.has(r.link)) return false; seen.add(r.link); return true; }).slice(0, 24);

    const userMsg = `타겟 유형: ${canonical}\n핵심 설비/공정 키워드: ${key_equipment.join(', ') || '없음'}\n\n검색 결과 목록:\n${results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.link}\n스니펫: ${r.snippet}`).join('\n\n')}`;
    const raw = await callClaude({ system: SYS, user: userMsg, maxTokens: 1400 });
    const parsed = parseJsonLoose(raw);
    if (!parsed) return res.status(502).json({ error: 'PARSE_FAILED', raw });
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
