# Anjabom.github.io — GPS 궤적 지도

GPS 기록 CSV를 위성지도 위에 그려 비교하는 정적 웹앱. GitHub Pages 사용자 사이트로 배포한다.
사용자와의 대화·보고·UI 문구는 모두 한국어.

## 구조
```
index.html        find_wc/ 로 넘겨 주는 리다이렉트만 있음
.nojekyll         Pages가 Jekyll 가공을 하지 않게 함 (지우지 말 것)
find_wc/
  index.html      화면 뼈대
  style.css       스타일 (색은 :root 변수)
  app.js          전부의 로직 — CSV 파싱, 지도, 색칠, 기준 경로 거리, 그래프
  *.csv           예제 데이터 — 로컬 전용, .gitignore로 저장소에서 제외 (app.js 의 SAMPLES 와 짝, 있을 때만 버튼 표시)
```
빌드 단계·패키지 매니저·프레임워크 없음. 외부 의존성은 cdnjs의 Leaflet 1.9.4 하나.

## 배포
- 저장소 `Anjabom/Anjabom.github.io`, 브랜치 `main`의 루트가 그대로 `https://anjabom.github.io/` 가 된다.
- 커밋·푸시하면 1~2분 뒤 반영. GitHub Actions 없음.
- 앱 주소: `https://anjabom.github.io/find_wc/`. `?load=a.csv,b.csv` 는 같은 폴더에 있는 CSV를 바로 띄운다(로컬 서버에서 예제 확인용).
- 커밋 작성자: `Anjabom <Anjabom@users.noreply.github.com>` (저장소 로컬 git config). 실제 이메일을 커밋에 넣지 않는다.

## 로컬 실행
```
python -m http.server 8000
```
→ `http://localhost:8000/find_wc/`. index.html을 더블클릭(file://)하면 예제 불러오기(fetch)만 안 된다.

## 규칙
- CSV는 브라우저 안에서만 처리한다. 업로드·저장(localStorage 포함)·분석 스크립트·광고를 넣지 않는다.
- 위경도 열 이름은 `LAT_KEYS`/`LON_KEYS`(app.js)로 자동 판별. 새 형식은 거기에 이름을 추가한다.
- (0,0)·깨진 좌표 줄은 건너뛴다. 값이 하나뿐인 열은 색 기준 목록에서 뺀다.
- 거리 계산은 기준 경로 첫 점을 원점으로 한 국소 평면 근사(m).
- 실제 주행 좌표 CSV는 공개하지 않기로 했다(2026-11-09). `.gitignore`의 `*.csv`를 풀거나 `git add -f` 하지 않는다.

## CSV 형식 (현재 예제)
- `maincourse.csv` 매핑 궤적: latitude, longitude, heading, speed, steer, direction, pitch, terrain, throttle_pulse, wheel_pulse, wheel_speed, steer_measured, throttle_raw, auto_mode, estop
- `subcourse.csv`: latitude, longitude, heading, speed, steer, direction, pitch, terrain, lane_cte, lane_conf, lane_flags
- `terrain`은 글자 표시(T, B, A, L, Y …)라 "구간 표시 열"로 색칠된다.

## 테스트
자동 테스트 없음. 고친 뒤 로컬 서버로 열어 `?load=maincourse.csv,subcourse.csv` 로 확인:
파일별 색 / terrain / 기준 경로 = maincourse 일 때 거리 색칠 / 지도 클릭 팝업 / 그래프 호버.
