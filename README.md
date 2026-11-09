# GPS 궤적 지도

GPS 기록 CSV를 끌어다 놓으면 위성지도 위에 궤적을 그려 주는 브라우저 도구입니다.
파일은 서버로 전송되지 않고 브라우저 안에서만 처리됩니다.

**바로 쓰기:** https://anjabom.github.io/find_wc/

## 할 수 있는 것
- 여러 CSV를 한 번에 겹쳐 그리기 (파일마다 색 지정, 표시/숨김)
- 열 값으로 궤적 색칠: 숫자 열은 초록→빨강, 글자 열(예: `terrain`)은 구간별 색
- **기준 경로** 를 고르면 다른 궤적이 그 경로에서 몇 m 벗어났는지 색과 그래프로 표시
- 그래프에 마우스를 올리거나 지도에서 궤적을 클릭하면 그 지점이 표시되고, 패널의 **선택 지점** 에 그 줄의 모든 값이 나옴
- 그래프 가로축은 누적 거리(m), 그래프 아래 띠는 지도와 같은 색
- 위성 / 일반 지도 전환, 패널 접기

## CSV 형식
첫 줄은 열 이름. 위도·경도 열만 있으면 됩니다.

| 위도 | 경도 |
|---|---|
| `latitude`, `lat`, `fix_lat`, `gps_lat` | `longitude`, `lon`, `lng`, `long`, `fix_lon`, `gps_lon` |

나머지 열은 자동으로 색 기준·그래프 목록에 들어갑니다. UTF-8과 엑셀 한글 CSV(CP949) 모두 읽습니다.

## 카카오 지도 켜기
키가 없으면 Esri 위성지도로 그려집니다. 카카오 위성지도로 바꾸려면:

1. https://developers.kakao.com 에 로그인 → **내 애플리케이션** → **애플리케이션 추가하기** (앱 이름은 아무거나)
2. 만든 앱의 **앱 키** 화면에서 **JavaScript 키** 를 복사
3. **JavaScript SDK 도메인**(메뉴: 플랫폼 → Web, 또는 앱 키 → JavaScript 키) 에 아래 주소를 등록
   - `https://anjabom.github.io`
   - `http://localhost:8000` (내 PC에서 시험할 때)
4. **제품 설정 → 카카오맵** 메뉴가 있으면 **사용 설정 ON**
5. `find_wc/app.js` 맨 위의 `const KAKAO_JS_KEY = '';` 따옴표 안에 키를 붙여넣고 커밋·푸시

JavaScript 키는 페이지 소스에 그대로 보이지만, 3번에 등록한 도메인에서만 동작하므로 공개돼도 괜찮습니다.
키가 틀렸거나 도메인이 등록되지 않았으면 패널 아래에 "카카오맵 로드 실패"가 뜨고 Esri 지도로 대신 보여 줍니다.

## 내 PC에서 실행
```
python -m http.server 8000
```
브라우저에서 http://localhost:8000/find_wc/ 를 엽니다.

## 사용한 것
- 카카오맵 JavaScript SDK (키가 있을 때)
- [Leaflet](https://leafletjs.com/) 1.9.4 + Esri World Imagery / OpenStreetMap (키가 없을 때)
