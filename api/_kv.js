/*
 Upstash Redis (Vercel KV) REST 헬퍼.
 환경변수 KV_REST_API_URL / KV_REST_API_TOKEN 이 없으면 configured:false 로 우아하게 비활성화됨.
 (그 경우 프론트는 localStorage 폴백으로 동작)
*/
async function redis(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return { configured: false, result: null };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const d = await r.json();
  if (d.error) throw new Error('[KV] ' + d.error);
  return { configured: true, result: d.result };
}

// HGETALL 결과([f,v,f,v] 또는 {f:v}) → 값(JSON 문자열) 배열
function hgetallValues(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    const out = [];
    for (let i = 1; i < result.length; i += 2) out.push(result[i]);
    return out;
  }
  return Object.values(result);
}

module.exports = { redis, hgetallValues };
