const { callClaude, parseJsonLoose, setCors } = require('./_lib');

/*
 검수자(Reviewer) — 수집·추적 결과 초안을 실무 기준으로 채점하고, 약한 단계에 피드백을 준다.
 프론트가 이 점수/피드백으로 다음 라운드에 부족한 단계만 재작업한다(자기교정 루프).
 승인 임계는 프론트에서 처리(60% 이상도 '잠정'으로 노출). 여기서는 순수 채점만.
*/
const SYS = `당신은 한국 화장품 소싱·품질관리팀의 최종 검수자입니다. 아래 초안을 실제 시장 근거 기반으로 엄격히 검수하세요.

검수 기준:
- 유사제품 수집이 10건 이상인가 (미달 시 feedback_to="collect")
- 채널 다양성: 올리브영/화해/네이버쇼핑/다이소몰/블로그 중 3곳 이상에서 수집됐는가 (미달 시 feedback_to="collect")
- 제품이 실존하며 타겟 유형과 부합하는가 (지어낸 제품 의심 시 감점)
- 제조원(제조업자) 표기 확인 비율이 절반 이상인가 (미달 시 feedback_to="trace")
- 생산 가능처(제조원 후보)가 확인 제품 수로 뒷받침되는가

confidence(0~100)로 채점하고, 개선이 필요한 약점과 다음 재작업 대상을 지정하세요.
반드시 JSON만 응답(마크다운 금지, weak_points 최대 3개, 각 값 40자 이내):
{"confidence":0~100 숫자,"verdict":"승인 또는 재검토","weak_points":["..."],"feedback":"다음 라운드 보완 지시","feedback_to":"collect 또는 trace"}`;

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { draft = {}, round = 1 } = req.body || {};
    const products = draft.products || [];
    const candidates = draft.candidates || [];
    const channels = [...new Set(products.map(p => p.channel).filter(Boolean))];
    const verified = products.filter(p => p.manufacturer).length;

    const userMsg = `타겟 유형: ${draft.canonical || '—'}\n검토 회차: ${round}차\n\n[수집 요약]\n- 유사제품 ${products.length}건, 제조원 확인 ${verified}건\n- 수집 채널: ${channels.join(', ') || '미상'}\n\n[유사제품 목록]\n${products.map((p, i) => `${i + 1}. [${p.grade || '유사'}] ${p.brand || ''} ${p.product || ''} · 채널:${p.channel || '—'} · 제조원:${p.manufacturer || '미확인'}`).join('\n') || '(없음)'}\n\n[생산 가능처 후보(제조원)]\n${candidates.map((c, i) => `${i + 1}. ${c.name} (${c.source || '—'}${c.mfds === 'ok' ? ', 식약처확인' : ''})`).join('\n') || '(없음)'}`;

    const parsed = parseJsonLoose(await callClaude({ system: SYS, user: userMsg, maxTokens: 500 }));
    if (!parsed) return res.status(200).json({ confidence: 0, verdict: '재검토', weak_points: ['검수 판독 실패'], feedback: '재수집 필요', feedback_to: 'collect' });
    return res.status(200).json({
      confidence: Number(parsed.confidence) || 0,
      verdict: parsed.verdict === '승인' ? '승인' : '재검토',
      weak_points: parsed.weak_points || [],
      feedback: parsed.feedback || '',
      feedback_to: parsed.feedback_to === 'trace' ? 'trace' : 'collect',
    });
  } catch (e) {
    return res.status(200).json({ confidence: 0, verdict: '재검토', weak_points: [e.message], feedback: '', feedback_to: 'collect' });
  }
};
