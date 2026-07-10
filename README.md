# moduel03

CosmeDB — 화장품 OEM/ODM 소싱 검색엔진

## 배포 (Vercel)

1. 이 저장소를 Vercel 프로젝트로 연결 (Vercel 대시보드 → New Project → GitHub 저장소 선택, 빌드 설정 없이 그대로 Deploy)
2. Vercel 프로젝트 → Settings → Environment Variables 에 아래 키 등록 (브라우저/코드에는 절대 노출되지 않음)
   - `ANTHROPIC_API_KEY`
   - `NAVER_CLIENT_ID`
   - `NAVER_CLIENT_SECRET`
   - `MFDS_KEY` (data.go.kr 일반 인증키 — 아래 두 API에 모두 "활용신청" 되어 있어야 함)
   - `MFDS_REPORT_KEY` (선택 — 품목보고 API용 키를 따로 쓸 경우. 없으면 `MFDS_KEY`를 재사용)
3. 재배포 후 `index.html`이 같은 도메인의 `/api/*` 함수를 호출합니다. API를 다른 도메인에 올렸다면 페이지 우측 상단 ⚙ 설정에서 API Base URL을 지정하세요.

## 구조

- `index.html` — 프론트엔드 (분류 확인 → 근거기반 검색 → 결과/신뢰도 표시)
- `api/classify.js` — 1단계 유형 분류 (Claude)
- `api/search-mfr.js` — 화장품 제조업체 검색 (네이버 검색 + Claude 종합)
- `api/search-similar.js` — 국내 유사제품 검색 (네이버 쇼핑 + Claude 추출)
- `api/mfds-check.js` — 식약처(MFDS) 제조업 등록 여부 단건조회 (MnfSeqDetail01)
- `api/mfds-report.js` — 식약처 기능성화장품 보고품목정보로 품목→제조원 역추출 (최상위 신뢰 소스, FtnltCosmRptPrdlstInfoService)

### 참고: data.go.kr 활용신청

`api/mfds-report.js`는 공공데이터포털의 "식품의약품안전처_기능성화장품 보고품목정보"(15095680) API를 사용합니다.
data.go.kr에서 이 API에 활용신청 후 승인되면 기존 일반 인증키가 그대로 동작합니다.
응답 필드명이 서비스마다 조금씩 다를 수 있어, `mfds-report.js`는 여러 후보 필드명을 방어적으로 탐지합니다.
실제 키로 첫 호출 시 매칭이 0건이면 응답에 `_fieldSample`(원본 첫 아이템)이 포함되므로, 그 키 이름을 `normalizeItem()`의 후보 배열에 맞춰 한 번만 보정하면 됩니다.
※ 기능성화장품(미백/주름/자외선차단/염모/제모/탈모완화 등)만 대상이며, 순수 보습·색조 등 비기능성 품목은 이 소스에 없습니다.
