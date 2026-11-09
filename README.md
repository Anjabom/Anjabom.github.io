# GPS 궤적 지도

GPS 기록 CSV를 끌어다 놓으면 위성지도 위에 궤적을 그려 주는 브라우저 도구입니다.
파일은 서버로 전송되지 않고 브라우저 안에서만 처리됩니다.

**바로 쓰기:** https://anjabom.github.io/find_wc/

## 할 수 있는 것
- 여러 CSV를 한 번에 겹쳐 그리기 (파일마다 색 지정, 표시/숨김)
- 열 값으로 궤적 색칠: 숫자 열은 초록→빨강, 글자 열(예: `terrain`)은 구간별 색
- **기준 경로** 를 고르면 다른 궤적이 그 경로에서 몇 m 벗어났는지 색과 그래프로 표시
- 아래 그래프에 마우스를 올리면 지도에 그 지점 표시, 지도에서 궤적을 클릭하면 그 줄의 모든 값 표시
- 위성 / 일반 지도 전환

## CSV 형식
첫 줄은 열 이름. 위도·경도 열만 있으면 됩니다.

| 위도 | 경도 |
|---|---|
| `latitude`, `lat`, `fix_lat`, `gps_lat` | `longitude`, `lon`, `lng`, `long`, `fix_lon`, `gps_lon` |

나머지 열은 자동으로 색 기준·그래프 목록에 들어갑니다. UTF-8과 엑셀 한글 CSV(CP949) 모두 읽습니다.

## 내 PC에서 실행
```
python -m http.server 8000
```
브라우저에서 http://localhost:8000/find_wc/ 를 엽니다.

## 사용한 것
- [Leaflet](https://leafletjs.com/) 1.9.4
- 위성 타일: Esri World Imagery / 일반 지도: OpenStreetMap
