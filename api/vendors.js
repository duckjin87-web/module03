const { setCors } = require('./_lib');
const { redis, hgetallValues } = require('./_kv');

/*
 팀 공유 신규처(제조원) 저장소.
 - 식별키: 사업자등록번호 > 식약처 업체코드 > 정규화 업체명 순으로 결정 → 중복/표기흔들림 오염 방지.
 - Redis HASH: key = cosmedb:v3:vendors:{canonical}, field = 식별키, value = 벤더 JSON
 - bump=false 인 업데이트(예: 식약처 상태 갱신)는 교차확인 카운트를 올리지 않음.
*/

function normName(s) {
  return (s || '')
    .replace(/주식회사|유한회사|\(주\)|\(유\)|㈜|㈔/g, '')
    .replace(/코리아|korea/gi, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}
function identityKey(v) {
  const biz = (v.biz_no || '').replace(/[^0-9]/g, '');
  if (biz.length >= 10) return 'biz:' + biz;
  const code = (v.mfds_code || '').toString().trim();
  if (code) return 'mfds:' + code;
  return 'name:' + normName(v.name);
}
const KEY = c => `cosmedb:v3:vendors:${c}`;

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const canonical = req.query.canonical;
      if (!canonical) return res.status(400).json({ error: 'CANONICAL_REQUIRED' });
      const { configured, result } = await redis(['HGETALL', KEY(canonical)]);
      if (!configured) return res.status(200).json({ configured: false, vendors: [] });
      const vendors = hgetallValues(result).map(v => { try { return JSON.parse(v); } catch (e) { return null; } }).filter(Boolean);
      return res.status(200).json({ configured: true, vendors });
    }

    if (req.method === 'POST') {
      const { canonical, entries = [], bump = true } = req.body || {};
      if (!canonical) return res.status(400).json({ error: 'CANONICAL_REQUIRED' });
      const probe = await redis(['PING']);
      if (!probe.configured) return res.status(200).json({ configured: false });
      for (const e of entries) {
        if (!e || !e.name) continue;
        const field = identityKey(e);
        const { result: existing } = await redis(['HGET', KEY(canonical), field]);
        let obj = null;
        if (existing) { try { obj = JSON.parse(existing); } catch (x) { obj = null; } }
        if (obj) {
          if (bump) obj.confirmedCount = (obj.confirmedCount || 1) + 1;
          for (const k of Object.keys(e)) if (e[k] != null && e[k] !== '') obj[k] = e[k];
        } else {
          obj = { ...e, confirmedCount: 1, addedAt: Date.now() };
        }
        obj.identity = field;
        await redis(['HSET', KEY(canonical), field, JSON.stringify(obj)]);
      }
      return res.status(200).json({ configured: true, ok: true });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
