/*
 시드 벤더팩 — 콜드스타트 해소용.
 원칙: 공개 웹에서 실제 근거(기사/공식 홈페이지 URL)가 확인된 업체만 등재한다.
 근거 없는 업체를 추가하지 말 것. 모든 시드는 mfds:'unknown'으로 시작해 앱에서 식약처 검증을 거친다.
 키는 _taxonomy.js의 canonical과 일치해야 매칭된다.
*/
const SEED_VENDORS = {
  '이중튜브': [
    {
      name: '비앤비코리아',
      capability_note: '이중튜브(듀얼튜브) 충진설비 도입 보도 확인 · 클래스1000 클린룸, 부자재 UV 살균~오토클레이브 멸균 원스텝',
      evidence_quote: "화장품 ODM & OEM 전문업체 '㈜비앤비코리아'는 '이중튜브(듀얼튜브)' 충진설비를 도입",
      evidence_url: 'https://www.bizwnews.com/news/articleView.html?idxno=31158',
      mfds: 'unknown', source: 'seed',
    },
    {
      name: '한국코스모',
      capability_note: '튜브 자동 충진 씰링기·만능자동충진기 등 충전 설비 보유 (공식 홈페이지 설비현황) — 이중튜브 전용 여부는 RFQ로 확인 필요',
      evidence_quote: '튜브 자동 충진 씰링기, 만능자동충진기 등 다양한 충전 설비 보유',
      evidence_url: 'https://hankookcosmo.co.kr/status',
      mfds: 'unknown', source: 'seed',
    },
  ],
};

function getSeeds(canonical) {
  return SEED_VENDORS[canonical] || [];
}

module.exports = { SEED_VENDORS, getSeeds };
