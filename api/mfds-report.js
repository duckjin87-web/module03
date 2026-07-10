const { setCors } = require('./_lib');

/*
 기능성화장품 보고품목정보 (식약처 공개 API)
 endpoint: http://apis.data.go.kr/1471000/FtnltCosmRptPrdlstInfoService/getRptPrdlstInq
 - 품목명으로 검색 → 해당 품목의 제조업자 + 책임판매업자를 반환
 - 정부 공식 데이터이므로 "품목 → 제조원" 매핑의 최상위 신뢰 근거
 - 주의: 기능성화장품(미백/주름/자외선차단/염모/제모/탈모완화 등)만 대상.
   순수 보습·색조 등 비기능성 품목은 이 소스에 없음 → 그 경우 네이버/유사제품 소스로 보완.

 응답 필드명이 서비스 문서상 확정되지 않아, 여러 후보 키를 방어적으로 탐지한다.
 실제 키로 첫 호출 후 응답을 보고 pick() 후보 배열만 한 번 맞추면 된다.
*/

const MFDS_REPORT_KEY = () => process.env.MFDS_REPORT_KEY || process.env.MFDS_KEY;

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
  }
  return null;
}

function normalizeItem(it) {
  return {
    item_name: pick(it, ['ITEM_NAME', 'PRDLST_NM', 'item_name', 'PRDUCT']),
    manufacturer: pick(it, ['MANUF_ENTRPS', 'MANUF_ENTP_NAME', 'MANUF', 'MNF_ENTP_NM', 'CNSGN_MANUF', 'MANUFACTURE_ENTRPS_NM']),
    seller: pick(it, ['ENTP_NAME', 'ENTRPS', 'BSSH_NM', 'RPT_ENTRPS', 'ENTP_NM']),
    seller_reg_no: pick(it, ['ENTP_NO', 'RPT_ENTP_NO', 'PRMISNO', 'ENTRPS_NO']),
    report_no: pick(it, ['REPORT_NO', 'RPT_NO', 'PRDLST_REPORT_NO', 'ITEM_SEQ']),
    report_date: pick(it, ['REPORT_YMD', 'REPORT_DATE', 'RPT_YMD', 'PRDLST_REPORT_DE']),
    effect: pick(it, ['EFFECT', 'EFCY', 'EFFICACY', 'FNCLTY_CN']),
  };
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { query, search_keywords = [], rows = 30 } = req.body || {};
    const terms = (query ? [query] : []).concat(search_keywords).map(s => (s || '').trim()).filter(Boolean);
    if (!terms.length) return res.status(400).json({ error: 'QUERY_REQUIRED' });
    const key = MFDS_REPORT_KEY();
    if (!key) return res.status(500).json({ error: 'MFDS_REPORT_KEY_MISSING' });

    const base = 'http://apis.data.go.kr/1471000/FtnltCosmRptPrdlstInfoService/getRptPrdlstInq';
    let items = [];
    let rawSample = null;
    for (const term of terms.slice(0, 3)) {
      const url = `${base}?serviceKey=${key}&type=json&numOfRows=${rows}&pageNo=1&item_name=${encodeURIComponent(term)}`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
        const text = await r.text();
        let d;
        try { d = JSON.parse(text); } catch (e) { rawSample = rawSample || text.slice(0, 400); continue; }
        const body = d?.body || d?.response?.body;
        let list = body?.items || body?.item || [];
        if (list && !Array.isArray(list)) list = [list];
        if (Array.isArray(list) && list.length) {
          if (!rawSample) rawSample = list[0]; // 첫 원본 아이템(필드명 확인용)
          items.push(...list.map(normalizeItem));
        }
      } catch (e) { /* 개별 term 실패는 무시 */ }
    }

    // 제조원 기준 집계 (같은 제조원이 여러 품목에서 나오면 신뢰↑)
    const byMaker = {};
    for (const it of items) {
      if (!it.manufacturer) continue;
      const k = it.manufacturer;
      if (!byMaker[k]) byMaker[k] = { manufacturer: k, product_count: 0, sample_items: [], sellers: new Set() };
      byMaker[k].product_count++;
      if (byMaker[k].sample_items.length < 3) byMaker[k].sample_items.push(it.item_name);
      if (it.seller) byMaker[k].sellers.add(it.seller);
    }
    const makers = Object.values(byMaker)
      .map(m => ({ ...m, sellers: [...m.sellers].slice(0, 5) }))
      .sort((a, b) => b.product_count - a.product_count);

    return res.status(200).json({
      makers,
      items,
      matched: items.length,
      note: items.length ? null : 'NO_REPORT_MATCH',
      _fieldSample: (makers.length ? undefined : rawSample), // 매칭 0건일 때만 원본 샘플 노출(필드명 디버깅용)
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
