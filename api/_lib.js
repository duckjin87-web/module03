async function callClaude({ system, user, maxTokens = 1200 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY_MISSING');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(`[${data.error.type}] ${data.error.message}`);
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return text;
}

// 견고한 JSON 파싱 — 마크다운/군더더기 제거 + 토큰한도로 잘린 JSON을 괄호균형 복원해 살림.
// 정상 파싱이 될 땐 개입하지 않고, 실패할 때만 복구한다(부작용 없음, 순수 이득).
function parseJsonLoose(text) {
  if (!text) return null;
  let s = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = s.indexOf('{');
  if (start === -1) return null;
  s = s.slice(start);
  // 1) 첫 { ~ 마지막 } 로 정상 파싱 시도
  const lastClose = s.lastIndexOf('}');
  if (lastClose !== -1) {
    try { return JSON.parse(s.slice(0, lastClose + 1)); } catch (_) {}
  }
  // 2) 잘린 JSON 복구: 끝의 어정쩡한 토큰 제거 → 안 닫힌 따옴표 닫기 → 부족한 괄호 순서대로 채우기
  let r = s.replace(/[,{\[:]\s*$/, '');
  if (((r.match(/"/g) || []).length) % 2 === 1) r += '"';
  const stack = []; let inStr = false;
  for (let i = 0; i < r.length; i++) {
    const ch = r[i];
    if (ch === '"' && r[i - 1] !== '\\') inStr = !inStr;
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  r = r.replace(/,\s*$/, '');
  while (stack.length) r += (stack.pop() === '{' ? '}' : ']');
  try { return JSON.parse(r); } catch (_) { return null; }
}

async function naverSearch({ type, query, display = 10 }) {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('NAVER_KEY_MISSING');
  const endpoint = type === 'shop'
    ? 'https://openapi.naver.com/v1/search/shop.json'
    : 'https://openapi.naver.com/v1/search/webkr.json';
  const url = `${endpoint}?query=${encodeURIComponent(query)}&display=${display}`;
  const resp = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': id,
      'X-Naver-Client-Secret': secret,
    },
  });
  const data = await resp.json();
  if (data.errorMessage) throw new Error(`[NAVER] ${data.errorMessage}`);
  return (data.items || []).map(it => ({
    title: stripTags(it.title),
    link: it.link,
    snippet: stripTags(it.description || ''),
    ...(type === 'shop' ? { mall: it.mallName, price: it.lprice } : {}),
  }));
}

function stripTags(s) {
  return (s || '').replace(/<[^>]+>/g, '');
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { callClaude, parseJsonLoose, naverSearch, stripTags, setCors };
