const { setCors } = require('./_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const name = req.method === 'GET' ? req.query.name : (req.body || {}).name;
    if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });
    const key = process.env.MFDS_KEY;
    if (!key) return res.status(500).json({ error: 'MFDS_KEY_MISSING' });

    const url = `https://apis.data.go.kr/1471000/MnfSeqDetail01/getMnfSeqDetail01?serviceKey=${key}&type=json&numOfRows=3&pageNo=1&entrps_nm=${encodeURIComponent(name)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    const items = d?.body?.items;
    const status = items && items.length > 0 ? 'ok' : 'notfound';
    return res.status(200).json({ status, items: items || [] });
  } catch (e) {
    return res.status(200).json({ status: 'error', error: e.message });
  }
};
