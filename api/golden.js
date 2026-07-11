const { setCors } = require('./_lib');
const { redis } = require('./_kv');

/*
 골든셋: 과거 성사된 소싱 사례 (의뢰 유형 → 실제 낙점/거래 제조원).
 엔진 품질을 hit-rate/recall로 측정하기 위한 정답 데이터.
 KV 미구성 시 configured:false 반환 → 프론트는 localStorage 폴백.
 저장구조: 단일 키 cosmedb:v3:golden = JSON 배열
*/
const KEY = 'cosmedb:v3:golden';

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { configured, result } = await redis(['GET', KEY]);
      if (!configured) return res.status(200).json({ configured: false, cases: [] });
      let cases = [];
      if (result) { try { cases = JSON.parse(result); } catch (e) { cases = []; } }
      return res.status(200).json({ configured: true, cases });
    }

    if (req.method === 'POST') {
      const { action, item, id } = req.body || {};
      const probe = await redis(['GET', KEY]);
      if (!probe.configured) return res.status(200).json({ configured: false });
      let cases = [];
      if (probe.result) { try { cases = JSON.parse(probe.result); } catch (e) { cases = []; } }

      if (action === 'delete') {
        cases = cases.filter(c => c.id !== id);
      } else {
        if (!item || !item.query || !Array.isArray(item.expected_makers)) {
          return res.status(400).json({ error: 'INVALID_ITEM' });
        }
        cases.push({ id: 'g' + Date.now(), addedAt: Date.now(), ...item });
      }
      await redis(['SET', KEY, JSON.stringify(cases)]);
      return res.status(200).json({ configured: true, ok: true, cases });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
