'use strict';

// 카카오맵 JavaScript 키. 비어 있거나 불러오기에 실패하면 Esri 위성지도(Leaflet)로 대신 그린다.
// 키 발급·도메인 등록 방법은 README의 "카카오 지도 켜기".
const KAKAO_JS_KEY = '';

// 예제 버튼으로 불러올 CSV (이 폴더 기준). 파일이 있을 때만 버튼이 나온다.
const SAMPLES = ['maincourse.csv', 'subcourse.csv'];

const R = 6371008.8;
const D2R = Math.PI / 180;
const FILE_COLORS = ['#ff2d8f', '#2f7cf6', '#ffd60a', '#30d158', '#bf5af2', '#ff9f0a', '#64d2ff', '#ff453a'];
const CAT_COLORS = ['#ff453a', '#2f7cf6', '#ffd60a', '#30d158', '#bf5af2', '#ff9f0a', '#64d2ff', '#ff2d8f', '#ac8e68', '#5e5ce6'];
const NEUTRAL = '#8e8e93';
const LAT_KEYS = ['latitude', 'lat', 'fix_lat', 'gps_lat'];
const LON_KEYS = ['longitude', 'lon', 'lng', 'long', 'fix_lon', 'gps_lon'];
const FILE = '__file';
const DEV = '__dev';

const $ = (id) => document.getElementById(id);
const state = { tracks: [], colorBy: FILE, refId: '', chartId: '', chartCol: '', sel: null, base: 'sat' };
const devCache = new Map(); // `${trackId}:${refId}` -> number[]
let nextId = 1;
let mapApi = null;

// ── 지도 엔진 (카카오 / Leaflet 공통 인터페이스) ─────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
    document.head.appendChild(s);
  });
}

function loadCss(href) {
  return new Promise((resolve) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = resolve;
    l.onerror = resolve;
    document.head.appendChild(l);
  });
}

function dotEl(cls, color) {
  const d = document.createElement('div');
  d.className = cls;
  if (color) d.style.background = color;
  return d;
}

async function kakaoMap(el) {
  await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&autoload=false`);
  await Promise.race([
    new Promise((resolve) => kakao.maps.load(resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('카카오맵 초기화 시간 초과')), 8000)),
  ]);
  const K = kakao.maps;
  const LL = ([lat, lon]) => new K.LatLng(lat, lon);
  const map = new K.Map(el, { center: LL([36.5, 127.8]), level: 13, mapTypeId: K.MapTypeId.SKYVIEW });
  map.addControl(new K.ZoomControl(), K.ControlPosition.RIGHT);
  const cursor = new K.CustomOverlay({ content: dotEl('cursor-dot'), xAnchor: 0.5, yAnchor: 0.5, zIndex: 10 });
  const px = (ll) => {
    const p = map.getProjection().containerPointFromCoords(ll);
    return { x: p.x, y: p.y };
  };
  return {
    name: '지도: 카카오맵',
    line: (pts, { color, weight, opacity = 1 }) => new K.Polyline({
      map, path: pts.map(LL), strokeWeight: weight, strokeColor: color, strokeOpacity: opacity,
    }),
    dot: (p, color) => new K.CustomOverlay({
      map, position: LL(p), content: dotEl('start-dot', color), xAnchor: 0.5, yAnchor: 0.5, zIndex: 5,
    }),
    remove: (h) => h.setMap(null),
    fit: (pts, left) => {
      const b = new K.LatLngBounds();
      pts.forEach((p) => b.extend(LL(p)));
      map.setBounds(b, 40, 40, 40, left);
    },
    setBase: (base) => map.setMapTypeId(base === 'sat' ? K.MapTypeId.SKYVIEW : K.MapTypeId.ROADMAP),
    toPixel: (p) => px(LL(p)),
    onClick: (fn) => K.event.addListener(map, 'click', (e) => fn(px(e.latLng))),
    setCursor: (p) => {
      if (!p) { cursor.setMap(null); return; }
      cursor.setPosition(LL(p));
      cursor.setMap(map);
    },
  };
}

async function leafletMap(el) {
  await loadCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
  const map = L.map(el, { zoomControl: false }).setView([36.5, 127.8], 7);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
  const bases = {
    sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 19, maxZoom: 22, attribution: 'Tiles &copy; Esri',
    }),
    road: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxNativeZoom: 19, maxZoom: 22, attribution: '&copy; OpenStreetMap contributors',
    }),
  };
  let current = 'sat';
  bases.sat.addTo(map);
  const renderer = L.canvas({ padding: 0.5 });
  const cursor = L.marker([0, 0], {
    icon: L.divIcon({ className: '', html: '<div class="cursor-dot"></div>', iconSize: [18, 18] }),
    interactive: false, zIndexOffset: 1000,
  });
  return {
    name: '지도: Esri 위성 (카카오 키 없음)',
    line: (pts, { color, weight, opacity = 1 }) => L.polyline(pts, { renderer, color, weight, opacity, interactive: false }).addTo(map),
    dot: (p, color) => L.circleMarker(p, {
      renderer, radius: 6, color: '#000', weight: 2, fillColor: color, fillOpacity: 1, interactive: false,
    }).addTo(map),
    remove: (h) => h.remove(),
    fit: (pts, left) => map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [left, 40], paddingBottomRight: [40, 40] }),
    setBase: (base) => {
      bases[current].remove();
      current = base;
      bases[base].addTo(map);
    },
    toPixel: (p) => map.latLngToContainerPoint(p),
    onClick: (fn) => map.on('click', (e) => fn(e.containerPoint)),
    setCursor: (p) => (p ? cursor.setLatLng(p).addTo(map) : cursor.remove()),
  };
}

async function initMap() {
  const el = $('map');
  if (KAKAO_JS_KEY) {
    try {
      mapApi = await kakaoMap(el);
    } catch (e) {
      el.innerHTML = '';
      showMsg('카카오맵을 불러오지 못해 Esri 위성지도로 대신 보여 줘요. 키와 도메인 등록을 확인하세요.', true);
    }
  }
  if (!mapApi) mapApi = await leafletMap(el);
  mapApi.onClick(onMapClick);
  $('mapName').textContent = KAKAO_JS_KEY && mapApi.name.includes('Esri') ? '지도: Esri 위성 (카카오맵 로드 실패)' : mapApi.name;
}

// ── CSV 읽기 ──────────────────────────────────────────
async function readText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('euc-kr').decode(buf); // 엑셀에서 저장한 한글 CSV
  }
}

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0].trim() !== '');
}

const findCol = (lower, keys) => {
  for (const k of keys) {
    const j = lower.indexOf(k);
    if (j >= 0) return j;
  }
  return -1;
};

function projector([lat0, lon0]) {
  const k = Math.cos(lat0 * D2R);
  return ([lat, lon]) => [(lon - lon0) * D2R * k * R, (lat - lat0) * D2R * R];
}

function buildTrack(name, text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('데이터 줄이 없어요');
  const header = rows[0].map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());
  const li = findCol(lower, LAT_KEYS);
  const oi = findCol(lower, LON_KEYS);
  if (li < 0 || oi < 0) throw new Error('위도·경도 열을 찾지 못했어요 (latitude/longitude, lat/lon, fix_lat/fix_lon)');

  const raw = header.map(() => []);
  const pts = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const lat = parseFloat(row[li]);
    const lon = parseFloat(row[oi]);
    // 측위 전 (0,0) 이나 깨진 줄은 건너뛴다
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)
      || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    pts.push([lat, lon]);
    for (let j = 0; j < header.length; j++) raw[j].push((row[j] ?? '').trim());
  }
  if (pts.length < 2) throw new Error('유효한 좌표가 2개 미만이에요');

  const cols = {};
  const colNames = [];
  header.forEach((h, j) => {
    if (j === li || j === oi || !h || cols[h]) return;
    const vals = raw[j];
    const numeric = vals.every((v) => v === '' || Number.isFinite(Number(v)));
    const data = numeric ? vals.map((v) => (v === '' ? NaN : Number(v))) : vals;
    cols[h] = { numeric, data, varies: new Set(data).size > 1 };
    colNames.push(h);
  });

  // 누적 거리 — 그래프의 가로축
  const P = projector(pts[0]);
  const dist = [0];
  let prev = P(pts[0]);
  for (let i = 1; i < pts.length; i++) {
    const cur = P(pts[i]);
    dist.push(dist[i - 1] + Math.hypot(cur[0] - prev[0], cur[1] - prev[1]));
    prev = cur;
  }

  const id = String(nextId++);
  return {
    id,
    name,
    color: FILE_COLORS[(Number(id) - 1) % FILE_COLORS.length],
    pts,
    dist,
    length: dist[dist.length - 1],
    cols,
    colNames,
    coordCols: `${header[li]}/${header[oi]}`,
    skipped: rows.length - 1 - pts.length,
    visible: true,
    handles: [],
  };
}

// ── 기준 경로와의 거리 ────────────────────────────────
function segDist(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function devOf(t, ref) {
  const key = `${t.id}:${ref.id}`;
  if (devCache.has(key)) return devCache.get(key);
  const P = projector(ref.pts[0]);
  const rp = ref.pts.map(P);
  const out = t.pts.map((p) => {
    const [x, y] = P(p);
    let best = Infinity;
    for (let i = 1; i < rp.length; i++) best = Math.min(best, segDist(x, y, rp[i - 1], rp[i]));
    return best;
  });
  devCache.set(key, out);
  return out;
}

const getTrack = (id) => state.tracks.find((t) => t.id === id) || null;
const getRef = () => getTrack(state.refId);

// ── 색 ────────────────────────────────────────────────
function quantile(values, q) {
  const s = Float64Array.from(values).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] : NaN;
}

const STOPS = [[48, 209, 88], [255, 214, 10], [255, 69, 58]];
function gradient(x) {
  const steps = 20; // 같은 색끼리 묶어 선 개수를 줄인다
  const t = Math.round(Math.max(0, Math.min(1, x)) * steps) / steps;
  const s = t < 0.5 ? 0 : 1;
  const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const c = STOPS[s].map((a, k) => Math.round(a + (STOPS[s + 1][k] - a) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function colorSpec() {
  const vis = state.tracks.filter((t) => t.visible);
  const c = state.colorBy;
  if (c === DEV) {
    const ref = getRef();
    if (!ref) return { type: 'file' };
    const all = vis.filter((t) => t !== ref).flatMap((t) => devOf(t, ref));
    return {
      type: 'num', label: '기준 경로(흰 선)와의 거리', unit: ' m', lo: 0, hi: Math.max(0.5, quantile(all, 0.98)),
      get: (t) => (t === ref ? null : devOf(t, ref)),
    };
  }
  const withCol = vis.filter((t) => t.cols[c]);
  if (c === FILE || !withCol.length) return { type: 'file' };

  if (withCol.every((t) => t.cols[c].numeric)) {
    const all = withCol.flatMap((t) => t.cols[c].data).filter(Number.isFinite);
    const lo = quantile(all, 0.02);
    let hi = quantile(all, 0.98);
    if (!(hi > lo)) hi = lo + 1;
    return { type: 'num', label: c, unit: '', lo, hi, get: (t) => t.cols[c]?.data ?? null };
  }

  const cats = [...new Set(withCol.flatMap((t) => t.cols[c].data.map(String)))].sort();
  const colors = new Map();
  let k = 0;
  for (const v of cats) colors.set(v, v === '' || v === '0' ? NEUTRAL : CAT_COLORS[k++ % CAT_COLORS.length]);
  return { type: 'cat', label: c, colors, get: (t) => (t.cols[c] ? t.cols[c].data.map(String) : null) };
}

// 점마다의 색. 한 가지 색이면 null
function pointColors(t, spec) {
  const vals = spec.type === 'file' ? null : spec.get(t);
  if (!vals) return null;
  return vals.map((v) => {
    if (spec.type === 'cat') return spec.colors.get(v) || NEUTRAL;
    return Number.isFinite(v) ? gradient((v - spec.lo) / (spec.hi - spec.lo)) : NEUTRAL;
  });
}

// 거리 색칠 중의 기준 경로는 흰색 — 빨강(멀다)과 헷갈리지 않게
const solidColor = (t, spec) => (spec.type === 'num' && t === getRef() ? '#ffffff' : t.color);

// ── 그리기 ────────────────────────────────────────────
function render() {
  const spec = colorSpec();
  for (const t of state.tracks) {
    t.handles.forEach((h) => mapApi.remove(h));
    t.handles = [];
    if (!t.visible) continue;
    const add = (h) => t.handles.push(h);
    add(mapApi.line(t.pts, { color: '#000', weight: 8, opacity: 0.35 })); // 위성사진 위에서 잘 보이게
    const colors = pointColors(t, spec);
    if (!colors) {
      add(mapApi.line(t.pts, { color: solidColor(t, spec), weight: 5 }));
    } else {
      // 구간 k(점 k → k+1)는 점 k의 색으로 칠하고, 같은 색이 이어지면 한 선으로 묶는다
      const n = t.pts.length;
      let s = 0;
      for (let k = 1; k <= n - 1; k++) {
        if (k === n - 1 || colors[k] !== colors[s]) {
          add(mapApi.line(t.pts.slice(s, k + 1), { color: colors[s], weight: 5 }));
          s = k;
        }
      }
    }
    add(mapApi.dot(t.pts[0], t.color));
  }
  drawTrackList();
  drawLegend(spec);
  drawChart();
  drawSelection();
}

const fmt = (v) => {
  if (typeof v === 'string') return v === '' ? '(빈칸)' : v;
  if (!Number.isFinite(v)) return '-';
  if (Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  return v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3);
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function drawLegend(spec) {
  const el = $('legend');
  if (spec.type === 'num') {
    el.innerHTML = `<b>${esc(spec.label)}</b><div class="grad"></div>`
      + `<div class="scale"><span>${fmt(spec.lo)}${spec.unit} 이하</span><span>${fmt(spec.hi)}${spec.unit} 이상</span></div>`;
  } else if (spec.type === 'cat') {
    el.innerHTML = `<b>${esc(spec.label)}</b><div class="cats">${
      [...spec.colors].map(([v, c]) => `<span><i style="background:${c}"></i>${esc(fmt(v))}</span>`).join('')
    }</div>`;
  } else {
    el.innerHTML = '';
  }
}

function drawTrackList() {
  const ul = $('tracks');
  const ref = getRef();
  ul.innerHTML = '';
  for (const t of state.tracks) {
    let meta = `${t.pts.length.toLocaleString()}점 · ${t.length.toFixed(1)} m · ${esc(t.coordCols)}`;
    if (t.skipped) meta += ` · ${t.skipped}줄 건너뜀`;
    if (t === ref) meta += '<br>기준 경로';
    else if (ref) {
      const d = devOf(t, ref);
      meta += `<br>기준과 거리 평균 ${fmt(d.reduce((a, b) => a + b, 0) / d.length)} m · 최대 ${fmt(Math.max(...d))} m`;
    }
    const li = document.createElement('li');
    li.className = t.visible ? '' : 'off';
    li.innerHTML = `<input type="checkbox" ${t.visible ? 'checked' : ''} title="표시">`
      + `<label class="swatch" style="background:${t.color}" title="색 바꾸기"><input type="color" value="${t.color}"></label>`
      + `<div class="tname"><b title="${esc(t.name)}">${esc(t.name)}</b><small>${meta}</small></div>`
      + '<button class="btn small">지우기</button>';
    li.querySelector('input[type=checkbox]').addEventListener('change', (e) => { t.visible = e.target.checked; render(); });
    li.querySelector('input[type=color]').addEventListener('change', (e) => { t.color = e.target.value; render(); });
    li.querySelector('button').addEventListener('click', () => removeTracks([t]));
    ul.appendChild(li);
  }
}

// ── 선택 상자 ─────────────────────────────────────────
function option(value, label, selected) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  o.selected = value === selected;
  return o;
}

function refreshControls() {
  const ref = getRef();
  const numericCols = [];
  const textCols = [];
  for (const t of state.tracks) {
    for (const name of t.colNames) {
      const col = t.cols[name];
      if (!col.varies) continue; // 값이 하나뿐인 열은 색으로 볼 게 없다
      if (!numericCols.includes(name) && !textCols.includes(name)) (col.numeric ? numericCols : textCols).push(name);
    }
  }
  const valid = [FILE, ...numericCols, ...textCols, ...(ref ? [DEV] : [])];
  if (!valid.includes(state.colorBy)) state.colorBy = FILE;

  const cb = $('colorBy');
  cb.innerHTML = '';
  cb.appendChild(option(FILE, '파일별 색', state.colorBy));
  if (ref) cb.appendChild(option(DEV, '기준 경로와의 거리', state.colorBy));
  for (const [label, list] of [['숫자 열', numericCols], ['구간 표시 열', textCols]]) {
    if (!list.length) continue;
    const og = document.createElement('optgroup');
    og.label = label;
    list.forEach((n) => og.appendChild(option(n, n, state.colorBy)));
    cb.appendChild(og);
  }

  const rs = $('ref');
  rs.innerHTML = '';
  rs.appendChild(option('', '없음', state.refId));
  state.tracks.forEach((t) => rs.appendChild(option(t.id, t.name, state.refId)));

  if (!getTrack(state.chartId)) state.chartId = state.tracks[0]?.id || '';
  const ct = $('chartTrack');
  ct.innerHTML = '';
  state.tracks.forEach((t) => ct.appendChild(option(t.id, t.name, state.chartId)));
  refreshChartCols();
}

function chartColsFor(t) {
  if (!t) return [];
  const list = t.colNames.filter((n) => t.cols[n].numeric && t.cols[n].varies);
  const ref = getRef();
  if (ref && ref !== t) list.unshift(DEV);
  return list;
}

function refreshChartCols(followColor = false) {
  const t = getTrack(state.chartId);
  const cols = chartColsFor(t);
  if (followColor && cols.includes(state.colorBy)) state.chartCol = state.colorBy;
  else if (!cols.includes(state.chartCol)) {
    state.chartCol = cols.includes(state.colorBy) ? state.colorBy : cols.includes('speed') ? 'speed' : cols[0] || '';
  }
  const cc = $('chartCol');
  cc.innerHTML = '';
  cols.forEach((n) => cc.appendChild(option(n, n === DEV ? '기준과 거리 (m)' : n, state.chartCol)));
}

// ── 그래프 (가로축 = 누적 거리) ───────────────────────
const PAD = { l: 34, r: 6, t: 6, b: 12 };
const BAND = 7; // 그래프 아래 색 띠 높이 — 지도와 같은 색

function chartSeries(t) {
  if (!t || !state.chartCol) return null;
  if (state.chartCol === DEV) return getRef() ? devOf(t, getRef()) : null;
  return t.cols[state.chartCol]?.data ?? null;
}

function chartGeom(t, w, h) {
  const total = t.length || 1;
  return {
    X: (i) => PAD.l + (t.dist[i] / total) * (w - PAD.l - PAD.r),
    plotBottom: h - PAD.b - BAND - 3,
  };
}

function drawChart() {
  const box = $('chartBox');
  box.hidden = !state.tracks.length;
  if (box.hidden) return;

  const canvas = $('chart');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#9aa0aa';

  const t = getTrack(state.chartId);
  const ys = chartSeries(t);
  $('chartEnd').textContent = t ? `${Math.round(t.length)} m` : '';
  if (!ys) {
    ctx.fillText('그래프로 볼 숫자 열이 없어요', PAD.l, h / 2);
    return;
  }
  const { X, plotBottom } = chartGeom(t, w, h);
  const finite = ys.filter(Number.isFinite);
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const Y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (plotBottom - PAD.t);

  ctx.strokeStyle = '#2c2f36';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const v of [lo, (lo + hi) / 2, hi]) { ctx.moveTo(PAD.l, Y(v)); ctx.lineTo(w - PAD.r, Y(v)); }
  ctx.stroke();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of [lo, (lo + hi) / 2, hi]) ctx.fillText(fmt(v), PAD.l - 4, Y(v));

  // 선 + 아래 채우기
  ctx.beginPath();
  let pen = false;
  ys.forEach((v, i) => {
    if (!Number.isFinite(v)) { pen = false; return; }
    if (pen) ctx.lineTo(X(i), Y(v)); else ctx.moveTo(X(i), Y(v));
    pen = true;
  });
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // 색 띠 — 지도에 칠한 색 그대로
  const spec = colorSpec();
  const colors = pointColors(t, spec);
  const bandY = plotBottom + 3;
  for (let i = 0; i < t.pts.length - 1; i++) {
    ctx.fillStyle = colors ? colors[i] : solidColor(t, spec);
    ctx.fillRect(X(i), bandY, Math.max(1, X(i + 1) - X(i) + 0.5), BAND);
  }

  const sel = state.sel;
  if (sel && sel.id === t.id) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(sel.i), PAD.t);
    ctx.lineTo(X(sel.i), bandY + BAND);
    ctx.stroke();
  }
}

function chartIndexAt(e) {
  const t = getTrack(state.chartId);
  if (!t) return null;
  const rect = e.currentTarget.getBoundingClientRect();
  const frac = (e.clientX - rect.left - PAD.l) / (rect.width - PAD.l - PAD.r);
  const target = Math.max(0, Math.min(1, frac)) * t.length;
  let lo = 0;
  let hi = t.dist.length - 1;
  while (lo < hi) { // target 이상인 첫 점
    const mid = (lo + hi) >> 1;
    if (t.dist[mid] < target) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && target - t.dist[lo - 1] < t.dist[lo] - target) lo--;
  return { t, i: lo };
}

$('chart').addEventListener('mousemove', (e) => {
  const hit = chartIndexAt(e);
  if (hit) select(hit.t, hit.i);
});
$('chart').addEventListener('click', (e) => {
  const hit = chartIndexAt(e);
  if (hit) select(hit.t, hit.i);
});
new ResizeObserver(() => drawChart()).observe($('chart'));

// ── 선택 지점 ─────────────────────────────────────────
function select(t, i) {
  state.sel = { id: t.id, i };
  mapApi.setCursor(t.pts[i]);
  drawChart();
  drawSelection();
}

function clearSelection() {
  state.sel = null;
  mapApi.setCursor(null);
  drawChart();
  drawSelection();
}

function drawSelection() {
  const box = $('sel');
  const t = state.sel && getTrack(state.sel.id);
  box.hidden = !t;
  if (!t) return;
  const i = state.sel.i;
  const rows = [
    ['파일', t.name],
    ['점 번호', `${i} / ${t.pts.length - 1}`],
    ['누적 거리', `${t.dist[i].toFixed(1)} m`],
    ['위도', t.pts[i][0].toFixed(9)],
    ['경도', t.pts[i][1].toFixed(9)],
  ];
  const ref = getRef();
  if (ref && ref !== t) rows.push(['기준과 거리', `${fmt(devOf(t, ref)[i])} m`]);
  for (const n of t.colNames) rows.push([n, fmt(t.cols[n].data[i])]);
  $('selRows').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}

function onMapClick(clickPx) {
  let best = null;
  for (const t of state.tracks) {
    if (!t.visible) continue;
    t.pts.forEach((p, i) => {
      const q = mapApi.toPixel(p);
      const d = Math.hypot(q.x - clickPx.x, q.y - clickPx.y);
      if (d <= 14 && (!best || d < best.d)) best = { t, i, d };
    });
  }
  if (!best) return;
  if (state.chartId !== best.t.id) {
    state.chartId = best.t.id;
    $('chartTrack').value = best.t.id;
    refreshChartCols();
  }
  select(best.t, best.i);
}

$('selClear').addEventListener('click', clearSelection);

// ── 불러오기 · 지우기 ────────────────────────────────
function showMsg(text, isError = false) {
  const el = $('msg');
  el.textContent = text;
  el.className = isError ? 'msg error' : 'msg';
}

// 패널에 가린 왼쪽만큼 비켜서 맞춘다
const panelOffset = () => {
  const p = $('panel');
  return window.innerWidth > 600 && !p.classList.contains('collapsed') ? p.offsetWidth + 40 : 40;
};

function fitTracks(tracks) {
  const pts = tracks.filter((t) => t.visible).flatMap((t) => t.pts);
  if (pts.length) mapApi.fit(pts, panelOffset());
}

function addTracks(added) {
  if (!added.length) return;
  state.tracks.push(...added);
  if (!state.chartId) state.chartId = added[0].id;
  refreshControls();
  render();
  fitTracks(added);
}

async function addFiles(files) {
  const added = [];
  const errors = [];
  for (const f of files) {
    try {
      added.push(buildTrack(f.name, await readText(f)));
    } catch (e) {
      errors.push(`${f.name}: ${e.message}`);
    }
  }
  addTracks(added);
  showMsg(errors.join(' / '), errors.length > 0);
}

async function loadUrls(urls) {
  if (location.protocol === 'file:') {
    showMsg('파일을 더블클릭해 연 상태라 예제를 못 불러와요. CSV를 직접 끌어다 놓거나 README의 로컬 서버 방법으로 여세요.', true);
    return;
  }
  const added = [];
  const errors = [];
  for (const url of urls) {
    const name = decodeURIComponent(url.split('/').pop());
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`);
      added.push(buildTrack(name, await res.text()));
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  addTracks(added);
  showMsg(errors.join(' / '), errors.length > 0);
}

function removeTracks(list) {
  for (const t of list) {
    t.handles.forEach((h) => mapApi.remove(h));
    for (const key of [...devCache.keys()]) if (key.split(':').includes(t.id)) devCache.delete(key);
    if (state.refId === t.id) state.refId = '';
    if (state.sel?.id === t.id) { state.sel = null; mapApi.setCursor(null); }
  }
  state.tracks = state.tracks.filter((t) => !list.includes(t));
  refreshControls();
  render();
}

// ── 이벤트 ────────────────────────────────────────────
$('file').addEventListener('change', (e) => {
  addFiles([...e.target.files]);
  e.target.value = '';
});
$('fitAll').addEventListener('click', () => fitTracks(state.tracks));
$('clearAll').addEventListener('click', () => removeTracks([...state.tracks]));
for (const [id, base] of [['baseSat', 'sat'], ['baseRoad', 'road']]) {
  $(id).addEventListener('click', () => {
    state.base = base;
    mapApi.setBase(base);
    $('baseSat').classList.toggle('active', base === 'sat');
    $('baseRoad').classList.toggle('active', base === 'road');
  });
}
$('collapse').addEventListener('click', () => {
  const collapsed = $('panel').classList.toggle('collapsed');
  $('collapse').textContent = collapsed ? '+' : '−';
  $('collapse').title = collapsed ? '펼치기' : '접기';
});
$('colorBy').addEventListener('change', (e) => {
  state.colorBy = e.target.value;
  refreshChartCols(true);
  render();
});
$('ref').addEventListener('change', (e) => {
  state.refId = e.target.value;
  if (state.refId && state.colorBy === FILE) state.colorBy = DEV;
  // 그래프는 기준이 아닌 파일을 보여 줘야 거리가 나온다
  if (state.refId && state.chartId === state.refId) {
    state.chartId = state.tracks.find((t) => t.id !== state.refId)?.id || state.chartId;
  }
  refreshControls();
  refreshChartCols(true);
  render();
});
$('chartTrack').addEventListener('change', (e) => {
  state.chartId = e.target.value;
  refreshChartCols();
  drawChart();
});
$('chartCol').addEventListener('change', (e) => {
  state.chartCol = e.target.value;
  drawChart();
});

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) document.body.classList.remove('dragging');
});
document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const files = [...e.dataTransfer.files].filter((f) => /\.(csv|txt)$/i.test(f.name));
  if (files.length) addFiles(files);
  else showMsg('CSV 파일만 불러올 수 있어요', true);
});

// 예제 CSV는 저장소에 올리지 않으므로(.gitignore) 실제로 있는 파일만 버튼으로 보여 준다
async function showSamples() {
  if (location.protocol === 'file:') return;
  const found = [];
  for (const url of SAMPLES) {
    try {
      if ((await fetch(url, { method: 'HEAD' })).ok) found.push(url);
    } catch { /* 없으면 버튼을 만들지 않는다 */ }
  }
  const samples = $('samples');
  if (found.length > 1) {
    const all = document.createElement('button');
    all.textContent = '예제 모두';
    all.addEventListener('click', () => loadUrls(found));
    samples.appendChild(all);
  }
  for (const url of found) {
    const b = document.createElement('button');
    b.textContent = url;
    b.addEventListener('click', () => loadUrls([url]));
    samples.appendChild(b);
  }
}

// ── 시작 ──────────────────────────────────────────────
(async () => {
  await initMap();
  refreshControls();
  render();
  showSamples();
  // ?load=a.csv,b.csv 로 열면 그 파일들을 바로 불러온다
  const preload = new URLSearchParams(location.search).get('load');
  if (preload) loadUrls(preload.split(',').map((s) => s.trim()).filter(Boolean));
})();
