# moduel03

CosmeDB — 화장품 OEM/ODM 소싱 검색엔진

## 배포 (Vercel)

1. 이 저장소를 Vercel 프로젝트로 연결 (Vercel 대시보드 → New Project → GitHub 저장소 선택, 빌드 설정 없이 그대로 Deploy)
2. Vercel 프로젝트 → Settings → Environment Variables 에 아래 키 등록 (브라우저/코드에는 절대 노출되지 않음)
   - `ANTHROPIC_API_KEY`
   - `NAVER_CLIENT_ID`
   - `NAVER_CLIENT_SECRET`
   - `MFDS_KEY`
3. 재배포 후 `index.html`이 같은 도메인의 `/api/*` 함수를 호출합니다. API를 다른 도메인에 올렸다면 페이지 우측 상단 ⚙ 설정에서 API Base URL을 지정하세요.

## 구조

- `index.html` — 프론트엔드 (분류 확인 → 근거기반 검색 → 결과/신뢰도 표시)
- `api/classify.js` — 1단계 유형 분류 (Claude)
- `api/search-mfr.js` — 화장품 제조업체 검색 (네이버 검색 + Claude 종합)
- `api/search-similar.js` — 국내 유사제품 검색 (네이버 쇼핑 + Claude 추출)
- `api/mfds-check.js` — 식약처(MFDS) 등록 여부 단건조회
