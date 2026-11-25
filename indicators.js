/* ══════════════════════════════════════════════════════════════════
   indicators.js — 3 chỉ báo, mỗi chỉ báo 1 panel dưới đồ thị nến
     Panel 1: Vortex Oscillator (Pine v3)
     Panel 2: AIR Vortex ADX
     Panel 3: Klinger Oscillator (+ Donchian + phân kỳ)
   Dùng biến toàn cục từ index.html: mainChart, candleSeries, LightweightCharts
   Hook: renderIndicators(candles, fullCandles)
   ══════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ─── CẤU HÌNH (đổi số ở đây) ─── */
const CFG = {
  paneHeight: 110,   // chiều cao mặc định mỗi panel chỉ báo (px) — kéo thanh giữa các panel để đổi
  minPane: 50,       // chiều cao tối thiểu của panel chỉ báo (px)
  minMain: 140,      // chiều cao tối thiểu của khung nến (px)
  priceScaleWidth: 72,                    // bề rộng trục giá, giữ các panel thẳng hàng
  showMainTimeAxis: false,                // false: chỉ panel cuối hiện trục thời gian
  vo:  { s: 6, l: 27, l2: 72, l3: 234, f1: 3, f2: 2, f3: 4, micro: 6 },
  air: { length: 34, smoothing: 9, atrMult: 1.0, pipMult: 0.25, pct: 17, thr: 0.2, rsiLen: 14, rsiThr: 6 },
  kvo: { fast: 34, slow: 55, sig: 13, dcLen: 55, dcBand: 8, pivL: 5, pivR: 5, divMin: 5, divMax: 60 },
};

const NONE = 'rgba(0,0,0,0)';
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const nzv = v => (v == null || !isFinite(v)) ? 0 : v;
const fmt3 = v => v == null ? '—' : v.toFixed(3);
const fmtK = v => {
  if (v == null) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + ' tỷ';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + ' tr';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + ' k';
  return s + a.toFixed(0);
};

/* ══════════ TOÁN HỌC (port từ Pine) ══════════ */
function smaArr(arr, len) {
  const n = arr.length, out = new Array(n).fill(null);
  for (let i = len - 1; i < n; i++) {
    let s = 0, ok = true;
    for (let j = i - len + 1; j <= i; j++) { if (arr[j] == null) { ok = false; break; } s += arr[j]; }
    if (ok) out[i] = s / len;
  }
  return out;
}
// ta.ema của Pine: khởi tạo bằng SMA, mảng đầu vào có thể có null ở đầu
function emaArr(arr, len) {
  const n = arr.length, out = new Array(n).fill(null), k = 2 / (len + 1);
  const f = arr.findIndex(v => v != null);
  if (f < 0 || n - f < len) return out;
  let s = 0; for (let i = f; i < f + len; i++) s += arr[i];
  let prev = s / len; out[f + len - 1] = prev;
  for (let i = f + len; i < n; i++) { prev = arr[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}
function superSmoother(arr, len) {
  const out = new Array(arr.length).fill(0);
  const lam = Math.PI * Math.SQRT2 / len, a1 = Math.exp(-lam);
  const c2 = 2 * a1 * Math.cos(lam), c3 = -a1 * a1, c1 = 1 - c2 - c3;
  for (let i = 0; i < arr.length; i++) {
    const s0 = nzv(arr[i]), s1 = i > 0 ? nzv(arr[i - 1]) : 0;
    out[i] = c1 * (s0 + s1) * 0.5 + c2 * (i > 0 ? out[i - 1] : 0) + c3 * (i > 1 ? out[i - 2] : 0);
  }
  return out;
}
function trueRange(C) {
  return C.map((c, i) => i === 0 ? c.high - c.low
    : Math.max(c.high - c.low, Math.abs(c.high - C[i - 1].close), Math.abs(c.low - C[i - 1].close)));
}
function rsiArr(close, len) {
  const out = new Array(close.length).fill(null);
  let ag = null, al = null;
  for (let i = 1; i < close.length; i++) {
    if (i < len) continue;
    const chg = close[i] - close[i - 1];
    if (ag === null) {
      let g = 0, l = 0;
      for (let j = i - len + 1; j <= i; j++) { const c = close[j] - close[j - 1]; g += Math.max(c, 0); l += Math.max(-c, 0); }
      ag = g / len; al = l / len;
    } else { ag = (ag * (len - 1) + Math.max(chg, 0)) / len; al = (al * (len - 1) + Math.max(-chg, 0)) / len; }
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}
function pctLinear(sorted, pct) {
  const n = sorted.length; if (!n) return NaN; if (n === 1) return sorted[0];
  const r = (pct / 100) * (n - 1), lo = Math.floor(r), hi = Math.ceil(r);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (r - lo);
}
function iprSeries(C, len, loP, hiP) {            // ipr_array() trong Pine
  const out = new Array(C.length).fill(0);
  const hlcc4 = C.map(c => (c.high + c.low + 2 * c.close) / 4);
  for (let i = len - 1; i < C.length; i++) {
    const w = [];
    for (let j = i - len + 1; j <= i; j++) w.push(C[j].high, C[j].low, hlcc4[j]);
    w.sort((a, b) => a - b);
    out[i] = (pctLinear(w, hiP) - pctLinear(w, loP)) / 2;
  }
  return out;
}
function normalize(arr) {                          // normalize() trong Pine (min=0, max=1)
  const out = new Array(arr.length).fill(null);
  let mn = 1, mx = -1;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]; if (v == null) continue;
    mn = Math.min(v, mn); mx = Math.max(v, mx);
    out[i] = (v - mn) / Math.max(mx - mn, 1);
  }
  return out;
}
function lerpColor(c1, c2, t) {                    // color.from_gradient
  t = Math.max(0, Math.min(1, t));
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const ch = s => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/* ══════════ CHỈ BÁO 1 — VORTEX OSCILLATOR ══════════ */
function calcVO(C) {
  const P = CFG.vo, n = C.length, close = C.map(c => c.close);
  const s = smaArr(close, P.s), l = smaArr(close, P.l), l2 = smaArr(close, P.l2), l3 = smaArr(close, P.l3);
  const hist = new Array(n).fill(null), h2 = new Array(n).fill(null), h3 = new Array(n).fill(null), vh = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (s[i] == null) continue;
    if (l[i]  != null) hist[i] = s[i] - l[i];
    if (l2[i] != null) h2[i]   = s[i] - l2[i];
    if (l3[i] != null) h3[i]   = s[i] - l3[i];
    if (hist[i] != null && h2[i] != null && h3[i] != null)
      vh[i] = (hist[i] / P.f1 + h2[i] / P.f2 + h3[i] / P.f3) / 3;
  }
  const micro = emaArr(vh, P.micro);
  const cu = [], cd = [], xmu = [], xmd = [];
  for (let i = 0; i < n; i++) {
    const ok = i > 0 && vh[i] != null && vh[i - 1] != null;
    const up = ok && vh[i] > 0 && vh[i - 1] < 0, dn = ok && vh[i] < 0 && vh[i - 1] > 0;
    const okm = ok && micro[i] != null && micro[i - 1] != null;
    const mu = okm && vh[i] > micro[i] && vh[i - 1] <= micro[i - 1];
    const md = okm && vh[i] < micro[i] && vh[i - 1] >= micro[i - 1];
    cu[i] = up; cd[i] = dn;
    xmu[i] = (mu && vh[i] >= 0) || up;
    xmd[i] = md && vh[i] >= 0;
  }
  return { hist, h2, h3, vh, micro, cu, cd, xmu, xmd };
}

/* ══════════ CHỈ BÁO 2 — AIR VORTEX ADX ══════════ */
const GR = '#b6f1b8', RD = '#f581a8', UPc = '#57d132', DNc = '#e42626';   // theme "Classic"
function calcAIR(C) {
  const P = CFG.air, n = C.length, L = P.length;
  // request.security(..., close[1], low[1], high[1]) → ATR dùng TR của nến TRƯỚC
  const tr = trueRange(C), trSh = tr.map((_, i) => i >= 1 ? tr[i - 1] : null);
  const atrS = superSmoother(trSh, P.smoothing);
  const ipr = iprSeries(C, P.smoothing, P.pct, 100 - P.pct);
  const blender = C.map((_, i) => P.atrMult * atrS[i] + P.pipMult * ipr[i]);

  const pV = [0], pM = [0], pT = [0];
  for (let i = 0; i < n; i++) {
    pV.push(pV[i] + (i > 0 ? Math.abs(C[i].high - C[i - 1].low) : 0));
    pM.push(pM[i] + (i > 0 ? Math.abs(C[i].low - C[i - 1].high) : 0));
    pT.push(pT[i] + blender[i]);
  }
  const start = L + P.smoothing + 1;
  const plusR = new Array(n).fill(null), minusR = new Array(n).fill(null), ratio = new Array(n).fill(null);
  for (let i = start; i < n; i++) {
    const vmp = pV[i + 1] - pV[i + 1 - L], vmm = pM[i + 1] - pM[i + 1 - L];
    const st = (pT[i + 1] - pT[i + 1 - L]) || 1e-9;
    plusR[i] = vmp / st; minusR[i] = vmm / st;
    const sum = plusR[i] + minusR[i];
    ratio[i] = sum === 0 ? 0 : Math.abs(plusR[i] - minusR[i]) / sum;
  }
  const vRaw = superSmoother(ratio, L).map((v, i) => ratio[i] == null ? null : 100 * v);
  const vx = normalize(vRaw), pl = normalize(plusR), mi = normalize(minusR);
  const rs = rsiArr(C.map(c => c.close), P.rsiLen);

  const histCol = new Array(n).fill(null), ag = new Array(n).fill(null), agCol = new Array(n).fill(null);
  const upTrig = new Array(n).fill(false), dnTrig = new Array(n).fill(false);
  let trend = 0;
  for (let i = 0; i < n; i++) {
    if (vx[i] == null) continue;
    const v = vx[i], p = pl[i], m = mi[i];
    const rc = rs[i] != null && (rs[i] > 50 + P.rsiThr || rs[i] < 50 - P.rsiThr);
    const upT = v > P.thr && p > m, dnT = v > P.thr && p < m;
    const buy = p > m && p > v && upT && rc, sell = m > p && m > v && dnT && rc;
    const self = p < P.thr && m < P.thr;
    const ob = !self && !buy && !sell && p > m && rc, os = !self && !buy && !sell && m > p && rc;
    histCol[i] = self ? NONE : buy ? GR : sell ? RD : ob ? hexA(UPc, 0.65) : os ? hexA(DNc, 0.65) : NONE;
    ag[i] = upT ? p - m : dnT ? m - p : null;
    agCol[i] = upT ? GR : RD;
    const prev = trend; if (buy) trend = 1; if (sell) trend = -1;
    upTrig[i] = prev === -1 && trend === 1; dnTrig[i] = prev === 1 && trend === -1;
  }
  return { vx, pl, mi, histCol, ag, agCol, upTrig, dnTrig };
}

/* ══════════ CHỈ BÁO 3 — KLINGER OSCILLATOR ══════════ */
function calcKVO(C) {
  const P = CFG.kvo, n = C.length;
  const hlc3 = C.map(c => (c.high + c.low + c.close) / 3);
  const sv = C.map((c, i) => (i > 0 && hlc3[i] - hlc3[i - 1] >= 0) ? c.volume : -c.volume);
  const e1 = emaArr(sv, P.fast), e2 = emaArr(sv, P.slow);
  const kvo = e1.map((v, i) => (v != null && e2[i] != null) ? v - e2[i] : null);
  const sig = emaArr(kvo, P.sig);

  const up = new Array(n).fill(null), lo = new Array(n).fill(null), iu = new Array(n).fill(null), il = new Array(n).fill(null);
  const f = kvo.findIndex(v => v != null);
  if (f >= 0) for (let i = f + P.dcLen - 1; i < n; i++) {
    let hi = -Infinity, lw = Infinity;
    for (let j = i - P.dcLen + 1; j <= i; j++) { hi = Math.max(hi, kvo[j]); lw = Math.min(lw, kvo[j]); }
    const band = (hi - lw) / P.dcBand;
    up[i] = hi; lo[i] = lw; iu[i] = hi - band; il[i] = lw + band;
  }
  const col = kvo.map((v, i) => v == null ? null
    : (up[i] == null || up[i] === lo[i]) ? (v >= 0 ? '#ff9800' : '#2962ff')
    : lerpColor('#2962ff', '#ff9800', (v - lo[i]) / (up[i] - lo[i])));

  const crossUp = [], crossDn = [];
  for (let i = 0; i < n; i++) {
    const ok = i > 0 && kvo[i] != null && sig[i] != null && kvo[i - 1] != null && sig[i - 1] != null;
    crossUp[i] = ok && kvo[i] > sig[i] && kvo[i - 1] <= sig[i - 1];
    crossDn[i] = ok && kvo[i] < sig[i] && kvo[i - 1] >= sig[i - 1];
  }

  // Phân kỳ thường (bull / bear) — giống logic Pine: pivot 5/5, khoảng 5–60 nến
  const bull = [], bear = [];
  let pl = null, ph = null;                         // {c: chỉ số pivot, at: nến xác nhận}
  const L = P.pivL, R = P.pivR;
  for (let i = L + R; i < n; i++) {
    const c = i - R, v = kvo[c];
    let ok = true;
    for (let j = c - L; j <= c + R; j++) if (kvo[j] == null) { ok = false; break; }
    if (!ok) continue;
    let isLow = true, isHigh = true;
    for (let j = c - L; j <= c + R; j++) { if (kvo[j] < v) isLow = false; if (kvo[j] > v) isHigh = false; }
    if (isLow) {
      if (pl) {
        const gap = i - pl.at - 1;
        if (v > kvo[pl.c] && gap >= P.divMin && gap <= P.divMax && C[c].low < C[pl.c].low) bull.push({ a: pl.c, b: c });
      }
      pl = { c, at: i };
    }
    if (isHigh) {
      if (ph) {
        const gap = i - ph.at - 1;
        if (v < kvo[ph.c] && gap >= P.divMin && gap <= P.divMax && C[c].high > C[ph.c].high) bear.push({ a: ph.c, b: c });
      }
      ph = { c, at: i };
    }
  }
  return { kvo, sig, up, lo, iu, il, col, crossUp, crossDn, bull, bear };
}

/* ══════════ DỰNG PANEL ══════════ */
let mainReady = false, panes = [], state = null;
let bandRaf = 0, divSeries = [];
let sVO = {}, sAIR = {}, sKV = {};

function injectCSS() {
  const st = document.createElement('style');
  st.textContent = `
    #chart{min-height:${CFG.minMain}px}
    .ind-pane{flex:0 0 ${CFG.paneHeight}px;position:relative;min-height:0;overflow:hidden}
    .ind-split{flex:0 0 7px;position:relative;z-index:6;cursor:row-resize;touch-action:none;
      background:var(--border);transition:background .15s}
    .ind-split::after{content:'';position:absolute;left:50%;top:2px;width:36px;height:3px;margin-left:-18px;
      border-radius:2px;background:var(--muted);opacity:.5}
    .ind-split:hover,.ind-split.drag{background:var(--accent)}
    .ind-split:hover::after,.ind-split.drag::after{background:#000;opacity:.6}
    .ind-legend{position:absolute;left:8px;top:3px;z-index:3;font-size:11px;line-height:1.4;
      pointer-events:none;white-space:nowrap;color:var(--muted)}
    .ind-legend b{color:var(--text);margin-right:6px}
    .ind-legend span{margin-right:8px}
    .ind-canvas{position:absolute;left:0;top:0;pointer-events:none;z-index:2}`;
  document.head.appendChild(st);
}

function mkChart(el, showTime) {
  return LightweightCharts.createChart(el, {
    autoSize: true,
    layout: { background: { type: 'solid', color: '#0d1117' }, textColor: '#8b949e' },
    grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#21262d', minimumWidth: CFG.priceScaleWidth, scaleMargins: { top: 0.15, bottom: 0.1 } },
    timeScale: { borderColor: '#21262d', timeVisible: true, secondsVisible: false, visible: showTime },
    handleScale: { mouseWheel: true, pinch: true },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
  });
}
const LINE = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };

function build() {
  if (typeof LightweightCharts === 'undefined' || typeof mainChart === 'undefined' || !mainChart) return;
  injectCSS();
  let anchor = document.getElementById('vol-chart');
  for (let i = 0; i < 3; i++) {
    const sp = document.createElement('div');            // thanh kéo phía trên mỗi panel
    sp.className = 'ind-split'; sp.title = 'Kéo để đổi kích thước panel';
    anchor.after(sp); anchor = sp;
    const el = document.createElement('div');
    el.className = 'ind-pane'; el.id = 'ind-p' + i;
    const lg = document.createElement('div'); lg.className = 'ind-legend';
    anchor.after(el); anchor = el;
    const chart = mkChart(el, i === 2);
    el.appendChild(lg);
    panes.push({ el, chart, lg, sp, h: CFG.paneHeight });
  }
  setupSplitters();
  mainChart.applyOptions({
    rightPriceScale: { minimumWidth: CFG.priceScaleWidth },
    timeScale: { visible: CFG.showMainTimeAxis },
  });

  /* — Panel 1: Vortex Oscillator — */
  const c1 = panes[0].chart, pf = { type: 'price', precision: 3, minMove: 0.001 };
  sVO.longest = c1.addHistogramSeries({ ...LINE, priceFormat: pf });
  sVO.longer  = c1.addHistogramSeries({ ...LINE, priceFormat: pf });
  sVO.short   = c1.addHistogramSeries({ ...LINE, priceFormat: pf });
  sVO.vh      = c1.addHistogramSeries({ ...LINE, priceFormat: pf });
  sVO.micro   = c1.addLineSeries({ ...LINE, color: '#ffffff', lineWidth: 1, priceFormat: pf });
  sVO.vh.createPriceLine({ price: 0, color: 'rgba(255,255,255,.25)', lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: '' });

  /* — Panel 2: AIR Vortex ADX — */
  const c2 = panes[1].chart;
  sAIR.hist = c2.addHistogramSeries({ ...LINE, priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    autoscaleInfoProvider: base => {
      const r = base();
      if (!r) return { priceRange: { minValue: 0, maxValue: 1 } };
      return { priceRange: { minValue: Math.min(0, r.priceRange.minValue), maxValue: Math.max(1, r.priceRange.maxValue) }, margins: r.margins };
    } });
  sAIR.ag = c2.addLineSeries({ ...LINE, lineWidth: 2, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
  sAIR.hist.createPriceLine({ price: CFG.air.thr, color: hexA('#b5a1e2', 0.6), lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: '' });

  /* — Panel 3: Klinger — */
  const c3 = panes[2].chart, kf = { type: 'custom', formatter: fmtK, minMove: 1 };
  sKV.sig = c3.addBaselineSeries({ ...LINE, priceFormat: kf, lineWidth: 1,
    baseValue: { type: 'price', price: 0 },
    topLineColor: hexA('#00bcd4', 0.5), topFillColor1: hexA('#00bcd4', 0.25), topFillColor2: hexA('#00bcd4', 0.05),
    bottomLineColor: hexA('#e91e63', 0.5), bottomFillColor1: hexA('#e91e63', 0.05), bottomFillColor2: hexA('#e91e63', 0.25) });
  sKV.upper = c3.addLineSeries({ ...LINE, color: NONE, priceFormat: kf });   // vô hình, chỉ để autoscale phủ dải Donchian
  sKV.lower = c3.addLineSeries({ ...LINE, color: NONE, priceFormat: kf });
  sKV.kvo = c3.addLineSeries({ ...LINE, color: '#ff9800', lineWidth: 2, priceFormat: kf });
  sKV.kvo.createPriceLine({ price: 0, color: 'rgba(120,123,134,.8)', lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: '' });

  // canvas tô dải Donchian
  const cv = document.createElement('canvas'); cv.className = 'ind-canvas';
  panes[2].el.appendChild(cv);
  panes[2].cv = cv; panes[2].ctx = cv.getContext('2d');
  new ResizeObserver(() => { sizeCanvas(); scheduleBands(); }).observe(panes[2].el);

  linkCharts();
  mainReady = true;
  paintLegends(null);
}

/* ─── kéo thanh ngang giữa các panel để đổi kích thước ─── */
function setupSplitters() {
  const area = document.getElementById('chart-area');
  const SP = 7;                                            // bề dày thanh kéo (px), khớp CSS
  const apply = () => panes.forEach(p => { p.el.style.flex = `0 0 ${Math.round(p.h)}px`; });
  const maxTotal = () => area.clientHeight - panes.length * SP - CFG.minMain;
  const fit = () => {                                      // cửa sổ thấp lại → thu nhỏ các panel từ dưới lên
    let over = panes.reduce((s, p) => s + p.h, 0) - maxTotal();
    for (let i = panes.length - 1; i >= 0 && over > 0; i--) {
      const cut = Math.min(over, panes[i].h - CFG.minPane);
      if (cut > 0) { panes[i].h -= cut; over -= cut; }
    }
    apply();
  };
  panes.forEach((p, i) => {
    const A = i > 0 ? panes[i - 1] : null, B = p;          // A: panel phía trên thanh (null = khung nến)
    let y0 = 0, hA = 0, hB = 0, dragging = false;
    p.sp.addEventListener('pointerdown', e => {
      dragging = true; y0 = e.clientY; hA = A ? A.h : 0; hB = B.h;
      p.sp.setPointerCapture(e.pointerId); p.sp.classList.add('drag');
      document.body.style.userSelect = 'none'; e.preventDefault();
    });
    p.sp.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dy = e.clientY - y0;
      if (!A) {                                            // giữa khung nến và panel 1: kéo lên → panel 1 cao hơn
        const others = panes.reduce((s, q) => s + (q === B ? 0 : q.h), 0);
        B.h = Math.max(CFG.minPane, Math.min(hB - dy, maxTotal() - others));
      } else {                                             // giữa 2 panel chỉ báo: tổng chiều cao 2 panel giữ nguyên
        const tot = hA + hB;
        A.h = Math.max(CFG.minPane, Math.min(hA + dy, tot - CFG.minPane));
        B.h = tot - A.h;
      }
      apply();
    });
    const end = e => {
      if (!dragging) return;
      dragging = false; p.sp.classList.remove('drag'); document.body.style.userSelect = '';
      try { p.sp.releasePointerCapture(e.pointerId); } catch (_) { /* bỏ qua */ }
    };
    p.sp.addEventListener('pointerup', end);
    p.sp.addEventListener('pointercancel', end);
  });
  window.addEventListener('resize', fit);
  apply(); fit();
}

/* ─── đồng bộ trục thời gian + crosshair giữa mainChart và 3 panel ─── */
function linkCharts() {
  const all = [mainChart, ...panes.map(p => p.chart)];
  let guard = false, xGuard = false;

  all.forEach(ch => ch.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (guard || !r) return;
    guard = true;
    try { all.forEach(o => { if (o !== ch) o.timeScale().setVisibleLogicalRange(r); }); }
    finally { guard = false; }
    scheduleBands();
  }));
  linkCharts.runGuarded = fn => { guard = true; try { fn(); } finally { guard = false; } };

  const anchors = () => [
    { chart: mainChart,        series: candleSeries,  val: i => state.V[i].close },
    { chart: panes[0].chart,   series: sVO.vh,         val: i => state.vo.vh[i + state.off] },
    { chart: panes[1].chart,   series: sAIR.hist,      val: i => state.air.vx[i + state.off] },
    { chart: panes[2].chart,   series: sKV.kvo,        val: i => state.kv.kvo[i + state.off] },
  ];
  all.forEach(src => src.subscribeCrosshairMove(p => {
    if (xGuard || !state) return;
    xGuard = true;
    try {
      const i = p.time != null ? state.idx.get(p.time) : undefined;
      anchors().forEach(a => {
        if (a.chart === src) return;
        if (i == null) { a.chart.clearCrosshairPosition?.(); return; }
        const v = a.val(i);
        if (v == null) { a.chart.clearCrosshairPosition?.(); return; }
        try { a.chart.setCrosshairPosition(v, p.time, a.series); } catch (e) { /* bỏ qua */ }
      });
      paintLegends(i == null ? null : i);
    } finally { xGuard = false; }
  }));
}

/* ─── chú thích (legend) trên đầu mỗi panel ─── */
function paintLegends(i) {
  const [l1, l2, l3] = panes.map(p => p.lg);
  if (!state) {
    l1.innerHTML = '<b>Vortex Oscillator</b>';
    l2.innerHTML = '<b>AIR Vortex ADX</b>';
    l3.innerHTML = '<b>Klinger Oscillator</b>';
    return;
  }
  if (i == null) i = state.V.length - 1;
  const o = state.off, vo = state.vo, ar = state.air, kv = state.kv;
  const vh = vo.vh[i + o];
  l1.innerHTML = `<b>Vortex Oscillator</b>` +
    `<span style="color:${vh != null && vh >= 0 ? '#4CAF50' : '#FF5252'}">Vortex ${fmt3(vh)}</span>` +
    `<span style="color:#fff">Micro ${fmt3(vo.micro[i + o])}</span>`;
  l2.innerHTML = `<b>AIR Vortex ADX</b>` +
    `<span style="color:#b5a1e2">ADX ${fmt3(ar.vx[i + o])}</span>` +
    `<span style="color:${GR}">+DI ${fmt3(ar.pl[i + o])}</span>` +
    `<span style="color:${RD}">−DI ${fmt3(ar.mi[i + o])}</span>`;
  l3.innerHTML = `<b>Klinger Oscillator</b>` +
    `<span style="color:#ff9800">KVO ${fmtK(kv.kvo[i + o])}</span>` +
    `<span style="color:#00bcd4">Signal ${fmtK(kv.sig[i + o])}</span>`;
}

/* ─── tô dải Donchian của KVO bằng canvas ─── */
function sizeCanvas() {
  const p = panes[2]; if (!p || !p.cv) return;
  const dpr = window.devicePixelRatio || 1, w = p.el.clientWidth, h = p.el.clientHeight;
  p.cv.width = w * dpr; p.cv.height = h * dpr;
  p.cv.style.width = w + 'px'; p.cv.style.height = h + 'px';
}
function scheduleBands() {
  if (bandRaf) return;
  bandRaf = requestAnimationFrame(() => { bandRaf = 0; drawBands(); });
}
function drawBands() {
  const p = panes[2]; if (!p || !p.ctx) return;
  const dpr = window.devicePixelRatio || 1, ctx = p.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, p.cv.width / dpr, p.cv.height / dpr);
  if (!state) return;
  const ts = p.chart.timeScale(), rg = ts.getVisibleLogicalRange();
  if (!rg) return;
  const w = (ts.width ? ts.width() : p.el.clientWidth - CFG.priceScaleWidth);
  const dc = state.dc, n = state.V.length;
  const i0 = Math.max(0, Math.floor(rg.from) - 1), i1 = Math.min(n - 1, Math.ceil(rg.to) + 1);
  const fill = (outer, inner, color) => {
    const pts = [], pts2 = [];
    for (let i = i0; i <= i1; i++) {
      if (outer[i] == null || inner[i] == null) continue;
      const x = ts.logicalToCoordinate(i);
      const y1 = sKV.kvo.priceToCoordinate(outer[i]), y2 = sKV.kvo.priceToCoordinate(inner[i]);
      if (x == null || y1 == null || y2 == null) continue;
      pts.push([x, y1]); pts2.push([x, y2]);
    }
    if (pts.length < 2) return;
    ctx.beginPath();
    pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    for (let k = pts2.length - 1; k >= 0; k--) ctx.lineTo(pts2[k][0], pts2[k][1]);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, p.cv.height / dpr); ctx.clip();
  fill(dc.up, dc.iu, 'rgba(76,175,80,.35)');
  fill(dc.lo, dc.il, 'rgba(242,54,69,.35)');
  ctx.restore();
}

/* ══════════ RENDER ══════════ */
window.renderIndicators = function (candles, full) {
  if (!mainReady) return;
  if (!candles || !candles.length) return;

  // tính trên toàn bộ lịch sử, chỉ hiển thị đoạn trùng với nến đang xem
  let F = (full && full.length) ? full : candles;
  let off = F.findIndex(c => c.time === candles[0].time);
  if (off < 0) { F = candles; off = 0; }
  const V = F.slice(off), n = V.length;

  const vo = calcVO(F), air = calcAIR(F), kv = calcKVO(F);
  const S = arr => arr.slice(off, off + n);
  const idx = new Map(V.map((c, i) => [c.time, i]));
  state = { V, off, idx, vo, air, kv, dc: { up: S(kv.up), lo: S(kv.lo), iu: S(kv.iu), il: S(kv.il) } };

  const pt = (arr, fn) => V.map((c, i) => {
    const v = arr[i + off];
    return v == null ? { time: c.time } : fn(c.time, v, i + off);
  });

  linkCharts.runGuarded(() => {
    /* Panel 1 */
    sVO.longest.setData(pt(vo.h3,   (t, v) => ({ time: t, value: v, color: hexA(v > 0 ? '#00897B' : '#2962FF', 0.95) })));
    sVO.longer.setData (pt(vo.h2,   (t, v) => ({ time: t, value: v, color: hexA(v > 0 ? '#808000' : '#FF9800', 0.7) })));
    sVO.short.setData  (pt(vo.hist, (t, v) => ({ time: t, value: v, color: hexA(v > 0 ? '#E040FB' : '#9C27B0', 0.7) })));
    sVO.vh.setData     (pt(vo.vh,   (t, v) => ({ time: t, value: v, color: hexA(v >= 0 ? '#4CAF50' : '#FF5252', 0.6) })));
    sVO.micro.setData  (pt(vo.micro,(t, v) => ({ time: t, value: v })));
    const m1 = [];
    V.forEach((c, i) => {
      const k = i + off;
      if (vo.cu[k])  m1.push({ time: c.time, position: 'belowBar', color: '#4CAF50', shape: 'arrowUp',   size: 1 });
      if (vo.cd[k])  m1.push({ time: c.time, position: 'aboveBar', color: '#FF5252', shape: 'arrowDown', size: 1 });
      if (vo.xmu[k]) m1.push({ time: c.time, position: 'belowBar', color: '#808000', shape: 'circle',    size: 1 });
      if (vo.xmd[k]) m1.push({ time: c.time, position: 'aboveBar', color: '#E040FB', shape: 'circle',    size: 1 });
    });
    sVO.vh.setMarkers(m1);

    /* Panel 2 */
    sAIR.hist.setData(V.map((c, i) => air.vx[i + off] == null ? { time: c.time }
      : { time: c.time, value: air.vx[i + off], color: air.histCol[i + off] }));
    sAIR.ag.setData(V.map((c, i) => air.ag[i + off] == null ? { time: c.time }
      : { time: c.time, value: air.ag[i + off], color: air.agCol[i + off] }));
    const m2 = [];
    V.forEach((c, i) => {
      const k = i + off;
      if (air.upTrig[k]) m2.push({ time: c.time, position: 'aboveBar', color: GR, shape: 'arrowUp',   size: 1 });
      if (air.dnTrig[k]) m2.push({ time: c.time, position: 'aboveBar', color: RD, shape: 'arrowDown', size: 1 });
    });
    sAIR.hist.setMarkers(m2);

    /* Panel 3 */
    sKV.kvo.setData  (pt(kv.kvo, (t, v, k) => ({ time: t, value: v, color: kv.col[k] })));
    sKV.sig.setData  (pt(kv.sig, (t, v) => ({ time: t, value: v })));
    sKV.upper.setData(pt(kv.up,  (t, v) => ({ time: t, value: v })));
    sKV.lower.setData(pt(kv.lo,  (t, v) => ({ time: t, value: v })));
    const m3 = [];
    V.forEach((c, i) => {
      const k = i + off;
      if (kv.crossUp[k]) m3.push({ time: c.time, position: 'belowBar', color: '#ff9800', shape: 'circle', size: 1 });
      if (kv.crossDn[k]) m3.push({ time: c.time, position: 'aboveBar', color: '#2962ff', shape: 'circle', size: 1 });
    });
    sKV.kvo.setMarkers(m3);

    // đường phân kỳ (chỉ vẽ cặp pivot nằm trong đoạn đang xem, tối đa 80 đoạn mỗi loại)
    divSeries.forEach(s => panes[2].chart.removeSeries(s)); divSeries = [];
    const addSeg = (seg, color) => {
      if (seg.a < off) return;
      const s = panes[2].chart.addLineSeries({ ...LINE, color, lineWidth: 2 });
      s.setData([{ time: F[seg.a].time, value: kv.kvo[seg.a] }, { time: F[seg.b].time, value: kv.kvo[seg.b] }]);
      divSeries.push(s);
    };
    kv.bull.slice(-80).forEach(s => addSeg(s, '#2962ff'));
    kv.bear.slice(-80).forEach(s => addSeg(s, '#f23645'));
  });

  paintLegends(null);
  scheduleBands();
};

document.addEventListener('DOMContentLoaded', build);
})();
