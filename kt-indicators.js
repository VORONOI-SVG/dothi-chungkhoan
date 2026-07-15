/* ══════════════════════════════════════════════════════════════════
   KT INDICATORS MODULE
   Tích hợp vào biểu đồ Lightweight Charts đã có sẵn trong index.html.

   Biến toàn cục dùng chung từ script chính (index.html):
     mainChart, volChart, candleSeries, lastCandles, LightweightCharts

   KT1  → vẽ ĐÈ lên khung nến chính (overlay):
          - Đường nền SSL Hybrid (HMA 60), đổi màu theo xu hướng tăng/giảm
          - Vùng Fair Value Gap (FVG) dạng hộp mờ
          - Quadro Volume Profile (4 cột volume mua/bán bên phải nến cuối)
   KT2  → khung riêng bên dưới khung Volume (pane mới, thời gian đồng bộ):
          - Vortex Oscillator (histogram, tô màu theo tín hiệu)
          - Augmented RSI (đường) + tín hiệu Quá mua (>80) / Quá bán (<20)
          - Tín hiệu Mua/Bán (mũi tên) khi Vortex+/- vượt ngưỡng và được
            xác nhận bởi RSI

   GHI CHÚ VỀ PHẠM VI:
   File Pine gốc của bạn gộp rất nhiều chỉ báo nhỏ trong 1 script (Cycles
   Analysis, BBx4, KVO, Thermal Gauge, Breadth Thrust...). Các phần đó
   dùng nhiều box/table/label kiểu vẽ tùy biến mà Lightweight Charts
   không hỗ trợ trực tiếp, nên bản này tập trung vào PHẦN CỐT LÕI của
   KT1 (SSL Hybrid + FVG + Quadro Volume Profile) và KT2 (Vortex + ARSI
   + tín hiệu Mua/Bán). Có thể mở rộng thêm sau nếu cần.
   ══════════════════════════════════════════════════════════════════ */

/* ── State ────────────────────────────────────────────────────────── */
let kt1On = false, kt2On = false;

let sslBullSeries = null, sslBearSeries = null;
let fvgCanvas = null, fvgCtx = null;
let fvgBoxes = [];
let qvpData = null;

let kt2Chart = null;
let vortexHistSeries = null, arsiLineSeries = null;
let kvoBullSeries = null, kvoBearSeries = null, kvoSignalSeries = null;
let kvoDcUpSeries = null, kvoDcLoSeries = null;
let kt2SyncGuard = false;

const KT_DEFAULT_RIGHT_OFFSET = 8;
const KT_QVP_RIGHT_OFFSET = 90;

/* ══════════════════════════════════════════════════════════════════
   MATH HELPERS (JS port of the Pine Script functions we need)
   ══════════════════════════════════════════════════════════════════ */
function ktEma(arr, len) {
  const k = 2 / (len + 1);
  const out = new Array(arr.length).fill(null);
  let prev = null;
  for (let i = 0; i < arr.length; i++) {
    prev = prev === null ? arr[i] : arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function ktWma(arr, len) {
  const out = new Array(arr.length).fill(null);
  for (let i = len - 1; i < arr.length; i++) {
    let num = 0, den = 0;
    for (let j = 0; j < len; j++) { const w = len - j; num += arr[i - j] * w; den += w; }
    out[i] = num / den;
  }
  return out;
}

function ktHma(arr, len) {
  const half = Math.max(1, Math.round(len / 2));
  const sq   = Math.max(1, Math.round(Math.sqrt(len)));
  const wmaHalf = ktWma(arr, half);
  const wmaFull = ktWma(arr, len);
  const diff = arr.map((_, i) => (wmaHalf[i] != null && wmaFull[i] != null) ? 2 * wmaHalf[i] - wmaFull[i] : null);
  const diffFilled = diff.map(v => v == null ? 0 : v);
  const smoothed = ktWma(diffFilled, sq);
  return smoothed.map((v, i) => diff[i] == null ? null : v);
}

function ktRma(arr, len) {
  const out = new Array(arr.length).fill(null);
  let prev = null;
  for (let i = 0; i < arr.length; i++) {
    if (i < len - 1) continue;
    if (prev === null) {
      let s = 0; for (let j = i - len + 1; j <= i; j++) s += arr[j];
      prev = s / len;
    } else prev = (prev * (len - 1) + arr[i]) / len;
    out[i] = prev;
  }
  return out;
}

function ktSuperSmoother(arr, len) {
  const out = new Array(arr.length).fill(0);
  const lambda = Math.PI * Math.SQRT2 / len;
  const a1 = Math.exp(-lambda);
  const c2 = 2 * a1 * Math.cos(lambda);
  const c3 = -a1 * a1;
  const c1 = 1 - c2 - c3;
  for (let i = 0; i < arr.length; i++) {
    const src1 = i >= 1 ? arr[i - 1] : arr[i];
    const f1 = i >= 1 ? out[i - 1] : 0;
    const f2 = i >= 2 ? out[i - 2] : 0;
    out[i] = c1 * (arr[i] + src1) * 0.5 + c2 * f1 + c3 * f2;
  }
  return out;
}

function ktTrueRange(candles) {
  const out = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { out[i] = candles[i].high - candles[i].low; continue; }
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    out[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return out;
}

function ktRsi(closeArr, len) {
  const out = new Array(closeArr.length).fill(null);
  let avgGain = null, avgLoss = null;
  for (let i = 1; i < closeArr.length; i++) {
    if (i < len) continue;
    const chg = closeArr[i] - closeArr[i - 1];
    const gain = Math.max(chg, 0), loss = Math.max(-chg, 0);
    if (avgGain === null) {
      let g = 0, l = 0;
      for (let j = i - len + 1; j <= i; j++) {
        const c = closeArr[j] - closeArr[j - 1];
        g += Math.max(c, 0); l += Math.max(-c, 0);
      }
      avgGain = g / len; avgLoss = l / len;
    } else {
      avgGain = (avgGain * (len - 1) + gain) / len;
      avgLoss = (avgLoss * (len - 1) + loss) / len;
    }
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function ktPercentileLinear(sortedArr, pct) {
  const n = sortedArr.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedArr[0];
  const rank = (pct / 100) * (n - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (rank - lo);
}

function ktIprSeries(candles, len, lowerPct, upperPct) {
  const out = new Array(candles.length).fill(0);
  const hlcc4 = candles.map(c => (c.high + c.low + c.close + c.close) / 4);
  for (let i = len - 1; i < candles.length; i++) {
    const win = [];
    for (let j = i - len + 1; j <= i; j++) win.push(candles[j].high, candles[j].low, hlcc4[j]);
    win.sort((a, b) => a - b);
    out[i] = (ktPercentileLinear(win, upperPct) - ktPercentileLinear(win, lowerPct)) / 2;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   KT1 — SSL HYBRID BASELINE (overlay)
   ══════════════════════════════════════════════════════════════════ */
function computeSSL(candles, len = 60) {
  const highArr = candles.map(c => c.high);
  const lowArr  = candles.map(c => c.low);
  const closeArr = candles.map(c => c.close);
  const emaHigh = ktHma(highArr, len);
  const emaLow  = ktHma(lowArr, len);

  const n = candles.length;
  const trend = new Array(n).fill(null);
  const sslLine = new Array(n).fill(null);
  let cur = null;
  for (let i = 0; i < n; i++) {
    if (emaHigh[i] == null || emaLow[i] == null) continue;
    if (closeArr[i] > emaHigh[i]) cur = 1;
    else if (closeArr[i] < emaLow[i]) cur = -1;
    trend[i] = cur;
    sslLine[i] = cur == null ? null : (cur < 0 ? emaHigh[i] : emaLow[i]);
  }
  return { sslLine, trend };
}

/* ══════════════════════════════════════════════════════════════════
   KT1 — FAIR VALUE GAP (overlay boxes)
   ══════════════════════════════════════════════════════════════════ */
function computeFVG(candles, thresholdPct = 0) {
  const threshold = thresholdPct / 100;
  const boxes = [];
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2], c1 = candles[i - 1], c2 = candles[i];
    const bull = c2.low > c0.high && c1.close > c0.high && (c2.low - c0.high) / c0.high > threshold;
    const bear = c2.high < c0.low && c1.close < c0.low && (c0.low - c2.high) / c2.high > threshold;
    if (bull) boxes.push({ startIndex: i - 2, top: c2.low, bottom: c0.high, bull: true, mitigatedAt: null });
    else if (bear) boxes.push({ startIndex: i - 2, top: c0.low, bottom: c2.high, bull: false, mitigatedAt: null });
  }
  for (const box of boxes) {
    for (let k = box.startIndex + 3; k < candles.length; k++) {
      if (box.bull && candles[k].close < box.bottom) { box.mitigatedAt = k; break; }
      if (!box.bull && candles[k].close > box.top) { box.mitigatedAt = k; break; }
    }
  }
  return boxes;
}

/* ══════════════════════════════════════════════════════════════════
   KT1 — QUADRO VOLUME PROFILE (BigBeluga) — overlay bars near last bar
   Với mỗi bin giá trong `lookback` nến gần nhất:
     - Nến lịch sử được xếp vào bin theo GIÁ ĐÓNG CỬA của chính nó.
     - Volume của nến đó được tính là "mua" (nến tăng) hay "bán" (nến
       giảm), rồi được gộp vào cột TRÁI hay PHẢI tùy theo bin đó nằm
       TRÊN hay DƯỚI giá đóng cửa HIỆN TẠI (giống bản Pine gốc).
   ══════════════════════════════════════════════════════════════════ */
function computeQVP(candles, opts = {}) {
  const lookback = Math.min(opts.lookback ?? 200, candles.length);
  const bins = opts.bins ?? 60;
  if (lookback < 10) return null;
  const slice = candles.slice(candles.length - lookback);
  const currentClose = candles[candles.length - 1].close;

  let top = -Infinity, bottom = Infinity;
  for (const c of slice) { top = Math.max(top, c.high); bottom = Math.min(bottom, c.low); }
  const step = (top - bottom) / bins;
  if (!(step > 0)) return null;

  const leftProfile = new Array(bins).fill(0);
  const rightProfile = new Array(bins).fill(0);

  for (const c of slice) {
    // Assign each candle to exactly ONE price bin (its own closing price),
    // instead of smearing it across neighboring bins — this keeps the
    // profile's bar lengths proportional to the real volume at each level.
    let k = Math.floor((c.close - bottom) / step);
    if (k < 0) k = 0;
    if (k > bins - 1) k = bins - 1;
    const middle = bottom + step * k + step / 2;
    const isBull = c.close > c.open;
    const bullVol = isBull ? c.volume : 0;
    const bearVol = isBull ? 0 : c.volume;
    if (currentClose > middle) { leftProfile[k] += bullVol; rightProfile[k] += bearVol; }
    else { leftProfile[k] += bearVol; rightProfile[k] += bullVol; }
  }

  const maxLeft = Math.max(...leftProfile, 1e-9);
  const maxRight = Math.max(...rightProfile, 1e-9);
  const bars = [];
  let totSell1 = 0, totBuy1 = 0, totBuy2 = 0, totSell2 = 0; // 1 = upper quadrant, 2 = lower quadrant
  for (let k = 0; k < bins; k++) {
    const loww = bottom + step * k, highh = loww + step, middle = loww + step / 2;
    const isUpper = middle > currentClose;
    if (isUpper) { totSell1 += leftProfile[k]; totBuy1 += rightProfile[k]; }
    else { totBuy2 += leftProfile[k]; totSell2 += rightProfile[k]; }
    bars.push({
      top: highh, bottom: loww,
      leftVal: leftProfile[k] / maxLeft,
      rightVal: rightProfile[k] / maxRight,
      isUpper,
    });
  }
  const totalVol = totSell1 + totBuy1 + totBuy2 + totSell2 || 1e-9;
  return {
    bars,
    currentClose,
    totSell1, totBuy1, totBuy2, totSell2,
    pctSell1: totSell1 / totalVol * 100,
    pctBuy1: totBuy1 / totalVol * 100,
    pctBuy2: totBuy2 / totalVol * 100,
    pctSell2: totSell2 / totalVol * 100,
  };
}

/* ══════════════════════════════════════════════════════════════════
   KT2 — VORTEX OSCILLATOR (lower pane)
   ══════════════════════════════════════════════════════════════════ */
function computeVortex(candles, opts = {}) {
  const length = opts.length ?? 34;
  const smoothing = opts.smoothing ?? 9;
  const atrMult = opts.atrMult ?? 1.0;
  const pipMult = opts.pipMult ?? 0.25;
  const spacerChop = opts.spacerChop ?? 17;

  const tr = ktTrueRange(candles);
  const atrFactor = ktSuperSmoother(tr, smoothing).map(v => v * atrMult);
  const iprFactor = ktIprSeries(candles, smoothing, spacerChop, 100 - spacerChop).map(v => v * pipMult);
  const blender = candles.map((_, i) => (atrFactor[i] || 0) + (iprFactor[i] || 0));

  const n = candles.length;
  const plusRaw = new Array(n).fill(null);
  const minusRaw = new Array(n).fill(null);
  const ratio = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    if (i < length) continue;
    let vmp = 0, vmm = 0, sumTr = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const prevLo = j > 0 ? candles[j - 1].low : candles[j].low;
      const prevHi = j > 0 ? candles[j - 1].high : candles[j].high;
      vmp += Math.abs(candles[j].high - prevLo);
      vmm += Math.abs(candles[j].low - prevHi);
      sumTr += blender[j];
    }
    if (sumTr === 0) sumTr = 1e-9;
    plusRaw[i] = vmp / sumTr;
    minusRaw[i] = vmm / sumTr;
    const diDif = Math.abs(plusRaw[i] - minusRaw[i]) * 10;
    const diSum = (plusRaw[i] + minusRaw[i]) * 10;
    ratio[i] = diSum === 0 ? 0 : diDif / diSum;
  }

  const ratioFilled = ratio.map(v => v == null ? 0 : v);
  const vortRaw = ktSuperSmoother(ratioFilled, length).map((v, i) => ratio[i] == null ? null : 100 * v);

  function normalizeSeries(arr) {
    const out = new Array(arr.length).fill(null);
    let hMin = 1.0, hMax = -1.0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v == null) continue;
      hMin = Math.min(v, hMin); hMax = Math.max(v, hMax);
      out[i] = (v - hMin) / Math.max(hMax - hMin, 1.0);
    }
    return out;
  }

  return {
    vortex: normalizeSeries(vortRaw),
    vortexPlus: normalizeSeries(plusRaw),
    vortexMinus: normalizeSeries(minusRaw),
  };
}

/* ══════════════════════════════════════════════════════════════════
   KT2 — AUGMENTED RSI (LuxAlgo) (lower pane)
   ══════════════════════════════════════════════════════════════════ */
function computeARSI(candles, len = 14) {
  const src = candles.map(c => c.close);
  const n = src.length;
  const upper = new Array(n).fill(null), lower = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i < len - 1) continue;
    let hi = -Infinity, lo = Infinity;
    for (let j = i - len + 1; j <= i; j++) { hi = Math.max(hi, src[j]); lo = Math.min(lo, src[j]); }
    upper[i] = hi; lower[i] = lo;
  }
  const diff = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (upper[i] == null || upper[i - 1] == null) continue;
    if (upper[i] > upper[i - 1]) diff[i] = upper[i] - lower[i];
    else if (lower[i] < lower[i - 1]) diff[i] = -(upper[i] - lower[i]);
    else diff[i] = src[i] - src[i - 1];
  }
  const diffFilled = diff.map(v => v == null ? 0 : v);
  const absDiffFilled = diff.map(v => v == null ? 0 : Math.abs(v));
  const num = ktRma(diffFilled, len);
  const den = ktRma(absDiffFilled, len);
  return num.map((v, i) => (v == null || !den[i]) ? null : (v / den[i]) * 50 + 50);
}

/* ══════════════════════════════════════════════════════════════════
   KT2 — KLINGER VOLUME OSCILLATOR (lower pane, own price scale)
   ══════════════════════════════════════════════════════════════════ */
function computeKVO(candles, len1 = 34, len2 = 55, sigLen = 13) {
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3);
  const sv = candles.map((c, i) => {
    if (i === 0) return c.volume;
    return hlc3[i] - hlc3[i - 1] >= 0 ? c.volume : -c.volume;
  });
  const emaFast = ktEma(sv, len1);
  const emaSlow = ktEma(sv, len2);
  const kvo = emaFast.map((v, i) => (v == null || emaSlow[i] == null) ? null : v - emaSlow[i]);
  const kvoFilled = kvo.map(v => v == null ? 0 : v);
  const signalRaw = ktEma(kvoFilled, sigLen);
  const signal = signalRaw.map((v, i) => kvo[i] == null ? null : v);
  return { kvo, signal };
}

function computeKVODonchian(kvo, lookback = 55) {
  const n = kvo.length;
  const dcUp = new Array(n).fill(null);
  const dcLo = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (kvo[i] == null) continue;
    let hi = -Infinity, lo = Infinity, cnt = 0;
    for (let j = Math.max(0, i - lookback + 1); j <= i; j++) {
      if (kvo[j] == null) continue;
      hi = Math.max(hi, kvo[j]); lo = Math.min(lo, kvo[j]); cnt++;
    }
    if (cnt > 0) { dcUp[i] = hi; dcLo[i] = lo; }
  }
  return { dcUp, dcLo };
}

/* ══════════════════════════════════════════════════════════════════
   UI SETUP — toggle buttons injected next to the MA20/MA50 buttons
   ══════════════════════════════════════════════════════════════════ */
function setupKTToggles() {
  const rbRight = document.querySelector('.rb-right');
  if (!rbRight) return;

  const sep = document.createElement('div');
  sep.className = 'rb-sep';
  rbRight.appendChild(sep);

  const lbl = document.createElement('span');
  lbl.className = 'ctb-lbl';
  lbl.textContent = 'Chỉ báo:';
  rbRight.appendChild(lbl);

  const b1 = document.createElement('button');
  b1.className = 'ma-toggle'; b1.id = 'kt1-toggle'; b1.textContent = 'KT1';
  b1.style.color = '#00c3ff';
  rbRight.appendChild(b1);

  const b2 = document.createElement('button');
  b2.className = 'ma-toggle'; b2.id = 'kt2-toggle'; b2.textContent = 'KT2';
  b2.style.color = '#e91e63';
  rbRight.appendChild(b2);

  b1.addEventListener('click', () => {
    kt1On = !kt1On;
    b1.classList.toggle('on', kt1On);
    b1.style.background = kt1On ? '#00c3ff' : 'transparent';
    b1.style.borderColor = kt1On ? '#00c3ff' : 'var(--border)';
    if (mainChart) {
      mainChart.timeScale().applyOptions({
        rightOffset: kt1On ? KT_QVP_RIGHT_OFFSET : KT_DEFAULT_RIGHT_OFFSET,
      });
    }
    if (kt1On) renderKT1(lastCandles || []); else clearKT1();
  });

  b2.addEventListener('click', () => {
    kt2On = !kt2On;
    b2.classList.toggle('on', kt2On);
    b2.style.background = kt2On ? '#e91e63' : 'transparent';
    b2.style.borderColor = kt2On ? '#e91e63' : 'var(--border)';
    document.getElementById('kt2-chart').classList.toggle('vis', kt2On);
    if (kt2On) { ensureKT2Chart(); renderKT2(lastCandles || []); }
    else clearKT2();
    window.dispatchEvent(new Event('resize'));
  });
}

/* ══════════════════════════════════════════════════════════════════
   OVERLAY CANVAS (FVG boxes + Quadro Volume Profile), drawn on top of
   #chart, synced to mainChart's time/price scales
   ══════════════════════════════════════════════════════════════════ */
function setupFVGCanvas() {
  const chartEl = document.getElementById('chart');
  if (!chartEl) return;
  fvgCanvas = document.createElement('canvas');
  fvgCanvas.id = 'fvg-overlay';
  chartEl.appendChild(fvgCanvas);
  fvgCtx = fvgCanvas.getContext('2d');
  resizeFVGCanvas();
  window.addEventListener('resize', resizeFVGCanvas);
  if (mainChart) mainChart.timeScale().subscribeVisibleLogicalRangeChange(drawKT1Overlay);
}

function resizeFVGCanvas() {
  const chartEl = document.getElementById('chart');
  if (!chartEl || !fvgCanvas) return;
  const w = chartEl.clientWidth, h = chartEl.clientHeight;
  fvgCanvas.width = w; fvgCanvas.height = h;
  fvgCanvas.style.width = w + 'px'; fvgCanvas.style.height = h + 'px';
  drawKT1Overlay();
}

function ktFmtVol(v) {
  if (typeof FMT_VOL === 'function') return FMT_VOL(v);
  if (!v) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' tỷ';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' tr';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + ' k';
  return String(Math.round(v));
}

function drawQVPBars(ts) {
  if (!qvpData || !qvpData.bars.length || !lastCandles || !lastCandles.length) return;
  const baseX = ts.logicalToCoordinate(lastCandles.length - 1 + 55);
  if (baseX == null) return;
  const maxBarPx = 55;

  for (const bar of qvpData.bars) {
    const y1 = candleSeries.priceToCoordinate(bar.top);
    const y2 = candleSeries.priceToCoordinate(bar.bottom);
    if (y1 == null || y2 == null) continue;
    const yTop = Math.min(y1, y2), h = Math.max(1, Math.abs(y2 - y1));
    const leftColor  = bar.isUpper ? 'rgba(242,54,69,0.55)' : 'rgba(8,153,129,0.55)';
    const rightColor = bar.isUpper ? 'rgba(8,153,129,0.55)' : 'rgba(242,54,69,0.55)';
    const leftW = bar.leftVal * maxBarPx;
    const rightW = bar.rightVal * maxBarPx;
    fvgCtx.fillStyle = leftColor;
    fvgCtx.fillRect(baseX - leftW, yTop, leftW, h);
    fvgCtx.fillStyle = rightColor;
    fvgCtx.fillRect(baseX, yTop, rightW, h);
  }

  fvgCtx.strokeStyle = 'rgba(255,255,255,0.35)';
  fvgCtx.beginPath();
  fvgCtx.moveTo(baseX, 0);
  fvgCtx.lineTo(baseX, fvgCanvas.height);
  fvgCtx.stroke();

  // 4 nhãn tổng khối lượng + % — giống 4 nhãn góc của bản gốc, neo tại
  // mức giá đóng cửa hiện tại: 2 nhãn phía dưới (vùng gần giá), 2 nhãn
  // phía trên (vùng xa hơn theo góc phần tư dưới).
  const yMid = candleSeries.priceToCoordinate(qvpData.currentClose);
  if (yMid == null) return;
  fvgCtx.font = '11px Inter, sans-serif';
  fvgCtx.textBaseline = 'middle';

  fvgCtx.textAlign = 'right';
  fvgCtx.fillStyle = 'rgba(8,153,129,0.95)';
  fvgCtx.fillText(`BUY ${ktFmtVol(qvpData.totBuy1)} · ${qvpData.pctBuy1.toFixed(2)}%`, baseX - 6, yMid + 16);
  fvgCtx.textAlign = 'left';
  fvgCtx.fillStyle = 'rgba(242,54,69,0.95)';
  fvgCtx.fillText(`SELL ${ktFmtVol(qvpData.totSell1)} · ${qvpData.pctSell1.toFixed(2)}%`, baseX + 6, yMid + 16);

  fvgCtx.textAlign = 'right';
  fvgCtx.fillStyle = 'rgba(242,54,69,0.95)';
  fvgCtx.fillText(`SELL ${qvpData.pctSell2.toFixed(2)}% · ${ktFmtVol(qvpData.totSell2)}`, baseX - 6, yMid - 16);
  fvgCtx.textAlign = 'left';
  fvgCtx.fillStyle = 'rgba(8,153,129,0.95)';
  fvgCtx.fillText(`BUY ${qvpData.pctBuy2.toFixed(2)}% · ${ktFmtVol(qvpData.totBuy2)}`, baseX + 6, yMid - 16);
}

function drawKT1Overlay() {
  if (!fvgCtx || !mainChart || !candleSeries) return;
  fvgCtx.clearRect(0, 0, fvgCanvas.width, fvgCanvas.height);
  if (!kt1On) return;
  const ts = mainChart.timeScale();

  for (const box of fvgBoxes) {
    const x1 = ts.logicalToCoordinate(box.leftLogical);
    const x2 = ts.logicalToCoordinate(box.rightLogical);
    const y1 = candleSeries.priceToCoordinate(box.top);
    const y2 = candleSeries.priceToCoordinate(box.bottom);
    if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
    fvgCtx.fillStyle = box.bull ? 'rgba(8,153,129,0.25)' : 'rgba(242,54,69,0.25)';
    fvgCtx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }

  drawQVPBars(ts);
}

/* ══════════════════════════════════════════════════════════════════
   KT2 chart pane (mirrors the vol-chart pattern already in index.html)
   ══════════════════════════════════════════════════════════════════ */
function ensureKT2Chart() {
  if (kt2Chart) return;
  const el = document.getElementById('kt2-chart');
  kt2Chart = LightweightCharts.createChart(el, {
    layout: { background: { type: 'solid', color: '#0d1117' }, textColor: '#8b949e' },
    grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
    timeScale: { visible: false, borderColor: '#21262d' },
    rightPriceScale: { borderColor: '#21262d' },
    leftPriceScale: { visible: true, borderColor: '#21262d' },
    crosshair: { vertLine: { visible: true }, horzLine: { visible: true } },
    handleScale: { mouseWheel: true, pinch: true },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    autoSize: true,
  });

  vortexHistSeries = kt2Chart.addHistogramSeries({
    priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
    priceLineVisible: false,
  });
  arsiLineSeries = kt2Chart.addLineSeries({
    color: '#c0c0c0', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
  });

  // KVO gets its own (left-side) price scale since its values are on a
  // completely different scale (volume-weighted) than Vortex/ARSI (0-100).
  kvoBullSeries = kt2Chart.addLineSeries({
    color: '#ff9800', lineWidth: 1, priceScaleId: 'left',
    priceLineVisible: false, lastValueVisible: false,
  });
  kvoBearSeries = kt2Chart.addLineSeries({
    color: '#2962ff', lineWidth: 1, priceScaleId: 'left',
    priceLineVisible: false, lastValueVisible: false,
  });
  kvoSignalSeries = kt2Chart.addLineSeries({
    color: 'rgba(200,200,200,0.6)', lineWidth: 1, priceScaleId: 'left',
    priceLineVisible: false, lastValueVisible: false,
  });
  kvoDcUpSeries = kt2Chart.addLineSeries({
    color: 'rgba(239,83,80,0.5)', lineWidth: 1, priceScaleId: 'left',
    lineStyle: LightweightCharts.LineStyle.Dashed,
    priceLineVisible: false, lastValueVisible: false,
  });
  kvoDcLoSeries = kt2Chart.addLineSeries({
    color: 'rgba(33,150,243,0.5)', lineWidth: 1, priceScaleId: 'left',
    lineStyle: LightweightCharts.LineStyle.Dashed,
    priceLineVisible: false, lastValueVisible: false,
  });
  kvoSignalSeries.createPriceLine({
    price: 0, color: 'rgba(255,255,255,0.25)',
    lineStyle: LightweightCharts.LineStyle.Dotted, lineWidth: 1,
    axisLabelVisible: false, title: '',
  });

  vortexHistSeries.createPriceLine({
    price: 20, color: 'rgba(255,255,255,0.3)',
    lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1,
    axisLabelVisible: true, title: 'Ngưỡng Vortex',
  });
  arsiLineSeries.createPriceLine({
    price: 80, color: 'rgba(8,153,129,0.6)',
    lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1,
    axisLabelVisible: true, title: 'Quá mua',
  });
  arsiLineSeries.createPriceLine({
    price: 20, color: 'rgba(242,54,69,0.6)',
    lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1,
    axisLabelVisible: true, title: 'Quá bán',
  });

  const syncFromMain = r => {
    if (!kt2On || kt2SyncGuard || !r) return;
    kt2SyncGuard = true; kt2Chart.timeScale().setVisibleLogicalRange(r); kt2SyncGuard = false;
  };
  const syncFromKt2 = r => {
    if (!kt2On || kt2SyncGuard || !r) return;
    kt2SyncGuard = true; mainChart.timeScale().setVisibleLogicalRange(r); kt2SyncGuard = false;
  };
  mainChart.timeScale().subscribeVisibleLogicalRangeChange(syncFromMain);
  kt2Chart.timeScale().subscribeVisibleLogicalRangeChange(syncFromKt2);

  window.addEventListener('resize', () => {
    if (kt2Chart) kt2Chart.applyOptions({ width: el.offsetWidth });
  });
}

/* Copy the main chart's current visible range onto KT2 right away —
   subscribeVisibleLogicalRangeChange only fires on *future* changes,
   so without this the two panes stay misaligned until the user pans. */
function syncKT2ToMain() {
  if (!kt2Chart || !mainChart) return;
  const range = mainChart.timeScale().getVisibleLogicalRange();
  if (range) {
    kt2SyncGuard = true;
    kt2Chart.timeScale().setVisibleLogicalRange(range);
    kt2SyncGuard = false;
  }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════ */
function ensureKT1Series() {
  if (!sslBullSeries) {
    sslBullSeries = mainChart.addLineSeries({
      color: '#00c3ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
  }
  if (!sslBearSeries) {
    sslBearSeries = mainChart.addLineSeries({
      color: '#ff0062', lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
  }
}

function renderKT1(candles) {
  if (!candles || !candles.length || !mainChart) return;
  ensureKT1Series();

  const { sslLine, trend } = computeSSL(candles, 60);
  const bullData = [], bearData = [];
  for (let i = 0; i < candles.length; i++) {
    if (sslLine[i] == null) continue;
    if (trend[i] === 1) bullData.push({ time: candles[i].time, value: sslLine[i] });
    else if (trend[i] === -1) bearData.push({ time: candles[i].time, value: sslLine[i] });
  }
  sslBullSeries.setData(bullData);
  sslBearSeries.setData(bearData);

  fvgBoxes = computeFVG(candles, 0).map(b => ({
    ...b,
    leftLogical: b.startIndex,
    rightLogical: b.mitigatedAt != null ? b.mitigatedAt : Math.min(b.startIndex + 200, candles.length - 1 + 20),
  }));

  qvpData = computeQVP(candles, { lookback: 200, bins: 60 });

  drawKT1Overlay();
}

function clearKT1() {
  if (sslBullSeries) sslBullSeries.setData([]);
  if (sslBearSeries) sslBearSeries.setData([]);
  fvgBoxes = [];
  qvpData = null;
  if (fvgCtx && fvgCanvas) fvgCtx.clearRect(0, 0, fvgCanvas.width, fvgCanvas.height);
}

function renderKT2(candles) {
  if (!candles || !candles.length) return;
  ensureKT2Chart();

  const { vortex, vortexPlus, vortexMinus } = computeVortex(candles, {
    length: 34, smoothing: 9, atrMult: 1.0, pipMult: 0.25, spacerChop: 17,
  });
  const arsi = computeARSI(candles, 14);
  const rsiArr = ktRsi(candles.map(c => c.close), 14);
  const threshold = 0.2;

  const histData = [], arsiData = [];
  const vortexMarkers = [], arsiMarkers = [];
  let prevArsi = null;

  for (let i = 0; i < candles.length; i++) {
    const time = candles[i].time;

    if (vortex[i] == null) {
      histData.push({ time }); // whitespace — keeps KT2's time axis aligned with the candles
    } else {
      const v = vortex[i] * 100, vp = vortexPlus[i], vm = vortexMinus[i];
      const aboveUp = vortex[i] > threshold && vp > vm;
      const aboveDn = vortex[i] > threshold && vp < vm;
      const rsiCond = rsiArr[i] != null && (rsiArr[i] > 56 || rsiArr[i] < 44);
      const buy = vp > vm && vp > vortex[i] && aboveUp && rsiCond;
      const sell = vm > vp && vm > vortex[i] && aboveDn && rsiCond;
      const selfCancel = vp < threshold && vm < threshold;
      const vtxOb = !selfCancel && !buy && !sell && vp > vm && rsiCond;
      const vtxOs = !selfCancel && !buy && !sell && vm > vp && rsiCond;

      // Matches the original script: mostly transparent (self-cancel / no
      // clear signal), only clearly colored on confirmed buy/sell or a
      // strong overbought/oversold lean — not a constant gray fill.
      let color = 'rgba(120,120,120,0.12)';
      if (selfCancel) color = 'rgba(120,120,120,0)';
      if (buy) color = '#57d132';
      else if (sell) color = '#e42626';
      else if (vtxOb) color = 'rgba(87,209,50,0.65)';
      else if (vtxOs) color = 'rgba(228,38,38,0.65)';

      histData.push({ time, value: v, color });
      if (buy) vortexMarkers.push({ time, position: 'belowBar', color: '#57d132', shape: 'arrowUp', text: 'Mua' });
      if (sell) vortexMarkers.push({ time, position: 'aboveBar', color: '#e42626', shape: 'arrowDown', text: 'Bán' });
    }

    if (arsi[i] == null) {
      arsiData.push({ time }); // whitespace
    } else {
      arsiData.push({ time, value: arsi[i] });
      if (prevArsi != null) {
        if (prevArsi <= 80 && arsi[i] > 80) {
          arsiMarkers.push({ time, position: 'aboveBar', color: '#ffd600', shape: 'arrowDown', text: 'Quá mua >80' });
        }
        if (prevArsi >= 20 && arsi[i] < 20) {
          arsiMarkers.push({ time, position: 'belowBar', color: '#00bcd4', shape: 'arrowUp', text: 'Quá bán <20' });
        }
      }
      prevArsi = arsi[i];
    }
  }

  const { kvo, signal } = computeKVO(candles, 34, 55, 13);
  const { dcUp, dcLo } = computeKVODonchian(kvo, 55);
  const kvoBullData = [], kvoBearData = [], kvoSignalData = [];
  const kvoDcUpData = [], kvoDcLoData = [];
  for (let i = 0; i < candles.length; i++) {
    const time = candles[i].time;
    if (kvo[i] == null) {
      kvoBullData.push({ time });
      kvoBearData.push({ time });
    } else if (kvo[i] >= 0) {
      kvoBullData.push({ time, value: kvo[i] });
      kvoBearData.push({ time });
    } else {
      kvoBullData.push({ time });
      kvoBearData.push({ time, value: kvo[i] });
    }
    kvoSignalData.push(signal[i] == null ? { time } : { time, value: signal[i] });
    kvoDcUpData.push(dcUp[i] == null ? { time } : { time, value: dcUp[i] });
    kvoDcLoData.push(dcLo[i] == null ? { time } : { time, value: dcLo[i] });
  }
  kvoBullSeries.setData(kvoBullData);
  kvoBearSeries.setData(kvoBearData);
  kvoSignalSeries.setData(kvoSignalData);
  kvoDcUpSeries.setData(kvoDcUpData);
  kvoDcLoSeries.setData(kvoDcLoData);

  vortexHistSeries.setData(histData);
  vortexHistSeries.setMarkers(vortexMarkers);
  arsiLineSeries.setData(arsiData);
  arsiLineSeries.setMarkers(arsiMarkers);

  syncKT2ToMain();
}

function clearKT2() {
  if (vortexHistSeries) { vortexHistSeries.setData([]); vortexHistSeries.setMarkers([]); }
  if (arsiLineSeries) { arsiLineSeries.setData([]); arsiLineSeries.setMarkers([]); }
  if (kvoBullSeries) kvoBullSeries.setData([]);
  if (kvoBearSeries) kvoBearSeries.setData([]);
  if (kvoSignalSeries) kvoSignalSeries.setData([]);
  if (kvoDcUpSeries) kvoDcUpSeries.setData([]);
  if (kvoDcLoSeries) kvoDcLoSeries.setData([]);
}

/* ══════════════════════════════════════════════════════════════════
   HOOK — called from loadChartData() in index.html after every load
   ══════════════════════════════════════════════════════════════════ */
function renderKTIndicators(candles) {
  if (kt1On) renderKT1(candles);
  if (kt2On) renderKT2(candles);
}

/* ══════════════════════════════════════════════════════════════════
   BOOT (runs after the main script's DOMContentLoaded handler, since
   this <script> tag is placed after it — mainChart/candleSeries etc.
   already exist by the time this listener fires)
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setupKTToggles();
  setupFVGCanvas();
});
