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

function parseJsonLoose(text) {
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    return null;
  }
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
