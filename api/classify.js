const { callClaude, parseJsonLoose, setCors } = require('./_lib');

const SYS = `당신은 한국 화장품 산업의 제품 유형 분류 전문가입니다.
사용자가 입력한 신규 제품 유형 또는 타겟 제품 정보를 분석해, 아래 JSON 스키마로만 응답하세요 (마크다운 금지).
분류는 추측이 아니라 화장품 산업 실무 기준(제형/용기/공정)으로 판단하고, 확신이 낮으면 confidence를 낮게 표기하세요.

{
  "category_major": "대분류 (예: 스킨케어/메이크업/헤어/바디/선케어/특수용기/포장전문 등)",
  "category_mid": "중분류 (제형 단위, 예: 크림/세럼/마스크/쿠션/이중튜브 등)",
  "canonical": "확정 유형명 (가장 표준적인 명칭)",
  "confidence": "high/mid/low",
  "similar_types": ["유사 유형 1", "유사 유형 2", "유사 유형 3"],
  "speculative_types": ["추측성 후보 1 (낮은 확신)", "추측성 후보 2"],
  "key_equipment": ["이 유형 생산에 필요한 핵심 설비/공정 키워드"],
  "search_keywords": ["네이버 검색에 쓸 쿼리 후보 3~5개"]
}`;

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { input, inputType } = req.body || {};
    if (!input || !input.trim()) return res.status(400).json({ error: 'INPUT_REQUIRED' });

    const userMsg = `입력 유형: ${inputType === 'target_product' ? '타겟 제품(제품명 또는 URL/상세정보)' : '신규 제품 유형 텍스트'}\n입력값: ${input}\n\n위 입력을 화장품 유형 분류 스키마에 따라 분류해주세요.`;
    const raw = await callClaude({ system: SYS, user: userMsg, maxTokens: 800 });
    const parsed = parseJsonLoose(raw);
    if (!parsed) return res.status(502).json({ error: 'PARSE_FAILED', raw });
    return res.status(200).json(parsed);
  } catch (e) {
    const code = e.message === 'ANTHROPIC_API_KEY_MISSING' ? 500 : 502;
    return res.status(code).json({ error: e.message });
  }
};
