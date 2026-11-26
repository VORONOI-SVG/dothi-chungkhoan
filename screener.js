/* screener.js – bộ lọc cổ phiếu: Volume & Williams %R(14).
   Gắn trong index.html (đã có sẵn dòng này, đặt TRƯỚC kt-indicators.js):
     <script src="screener.js"></script>

   Cách lấy dữ liệu (tự động, không cần bấm gì):
   1) Ưu tiên data/screener.json (nhanh nhất, do GitHub Actions tạo).
   2) Nếu chưa có: lấy danh sách mã từ data/manifest.json rồi tự quét từng file
      data/<MÃ>.json ngay khi mở trang, kết quả hiện dần trong bảng bên phải. */
(function () {
  'use strict';
  if (document.getElementById('scan')) return;

  const $ = id => document.getElementById(id);

  /* ── CSS ── */
  const style = document.createElement('style');
  style.textContent = `
  :root{--scan-w:25vw}
  @media(max-width:900px){:root{--scan-w:45vw}}
  .app{width:100vw}
  body.scan-open .app{width:calc(100vw - var(--scan-w))}
  #scan{position:fixed;top:0;right:0;width:var(--scan-w);min-width:220px;height:100vh;
    display:none;flex-direction:column;background:var(--surface);
    border-left:1px solid var(--border);z-index:150}
  body.scan-open #scan{display:flex}
  .scan-btn{padding:4px 10px;border-radius:5px;border:1px solid var(--border);
    background:transparent;color:var(--muted);font-size:11px;font-weight:700;cursor:pointer}
  .scan-btn:hover{color:var(--text);border-color:var(--muted)}
  .scan-btn.on{background:rgba(46,204,113,.15);border-color:var(--accent);color:var(--accent)}
  .scan-h{padding:10px 12px;border-bottom:1px solid var(--border);font-weight:700;
    display:flex;justify-content:space-between;align-items:center}
  .scan-f{padding:8px 12px;display:grid;grid-template-columns:1fr 1fr;gap:6px;
    border-bottom:1px solid var(--border);font-size:11px;color:var(--muted)}
  .scan-f label{display:flex;flex-direction:column;gap:3px}
  .scan-f input,.scan-f select{padding:5px 6px;background:var(--surface2);color:var(--text);
    border:1px solid var(--border);border-radius:5px;font-size:12px;width:100%;font-family:var(--font)}
  #scan-info{padding:6px 12px;font-size:11px;color:var(--muted);border-bottom:1px solid var(--border)}
  #scan-list{flex:1;overflow-y:auto}
  .sc-row{display:grid;grid-template-columns:50px 1fr auto;gap:8px;padding:7px 12px;
    cursor:pointer;font-size:12px;border-bottom:1px solid var(--border)}
  .sc-row:hover,.sc-row.on{background:var(--surface2)}
  .sc-row b{font-size:13px}
  .sc-row span{text-align:right;color:var(--muted)}
  .sc-row .wr{color:var(--accent)}
  .sc-empty{padding:16px 12px;font-size:12px;color:var(--muted)}

  /* ĐIỆN THOẠI: bảng lọc nằm ở đáy màn hình, cao 1/4 màn hình (đổi --scan-h để chỉnh), đồ thị co lại phía trên */
  @media(max-width:700px){
    :root{--scan-h:25vh}
    @supports (height:1dvh){:root{--scan-h:25dvh}}
    body.scan-open .app{width:100vw;height:calc(100vh - var(--scan-h));height:calc(100dvh - var(--scan-h))}
    #scan{top:auto;bottom:0;left:0;right:0;width:100vw;min-width:0;height:var(--scan-h);
      border-left:0;border-top:1px solid var(--border)}
    .scan-h{padding:2px 10px;font-size:11px}
    .scan-h .scan-btn{padding:0 7px;font-size:10px}
    #scan-toggle{padding:3px 8px;font-size:10px}
    .scan-f{grid-template-columns:1fr 1fr 1fr 1fr;gap:5px;padding:3px 10px;font-size:9px}
    .scan-f label{gap:0}
    .scan-f label[style]{grid-column:auto !important}
    .scan-f input,.scan-f select{padding:1px 4px;font-size:11px}
    #scan-info{padding:2px 10px;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sc-row{padding:3px 10px;gap:6px;font-size:10px;grid-template-columns:40px 1fr auto}
    .sc-row b{font-size:11px}
    .sc-empty{padding:6px 10px;font-size:10px}
  }`;
  document.head.appendChild(style);

  /* ── Panel ── */
  const panel = document.createElement('aside');
  panel.id = 'scan';
  panel.innerHTML = `
    <div class="scan-h"><span>Lọc cổ phiếu</span><button class="scan-btn" id="scan-close">✕</button></div>
    <div class="scan-f">
      <label>Volume &gt;<input id="f-vol" type="number" value="5000" step="1000" min="0"></label>
      <label>Williams %R &gt;<input id="f-wr" type="number" value="-60" step="1" min="-100" max="0"></label>
      <label>Sàn
        <select id="f-ex"><option value="ALL">Tất cả</option><option>HOSE</option><option>HNX</option><option>UPCOM</option></select>
      </label>
      <label>AIR Vortex ADX
        <select id="f-air"><option value="ALL">Tất cả</option><option value="G">Xanh</option></select>
      </label>
    </div>
    <div id="scan-info">Đang tải danh sách…</div>
    <div id="scan-list"></div>`;
  document.body.appendChild(panel);

  /* ── Nút bật/tắt trên header (panel mở sẵn khi vào trang) ── */
  const btn = document.createElement('button');
  btn.className = 'scan-btn';
  btn.id = 'scan-toggle';
  btn.textContent = '🔎 Lọc';
  const cnt = $('cnt');
  if (cnt) cnt.insertAdjacentElement('afterend', btn);
  else document.querySelector('header').appendChild(btn);

  function setOpen(open) {
    document.body.classList.toggle('scan-open', open);
    btn.classList.toggle('on', open);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }
  btn.addEventListener('click', () => setOpen(!document.body.classList.contains('scan-open')));
  $('scan-close').addEventListener('click', () => setOpen(false));
  setOpen(true);

  /* ── Dữ liệu ── */
  let SCREEN = [];            // [{t,name,ex,d,c,v,chg,wr}]
  let scanning = false, scanDone = 0, scanTotal = 0;
  const clean = t => t.replace(/\bNaN\b/g, 'null').replace(/-?Infinity\b/g, 'null');

  async function getJSON(url) {
    const res = await fetchWithTimeout(url + '?t=' + Math.floor(Date.now() / 600000), 10000);
    if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
    return JSON.parse(clean(await res.text()));
  }

  function applyList() {
    buildMap();
    updateCount(`${STOCKS.length} mã`, true);
    $('empty-hint').textContent = `Hỗ trợ ${STOCKS.length} mã`;
  }

  // Quét 1 file data/<MÃ>.json: lấy phiên mới nhất, volume, Williams %R(14)
  async function scanOne(t) {
    try {
      const res = await fetchWithTimeout(`data/${encodeURIComponent(t)}.json`, 8000);
      if (!res.ok) return null;
      const j = JSON.parse(clean(await res.text()));
      const raw = Array.isArray(j) ? j : (j && j.candles);
      if (!Array.isArray(raw)) return null;
      const rows = [];
      for (const r of raw) {
        if (!Array.isArray(r) || r.length < 6) continue;
        const h = +r[2], l = +r[3], c = +r[4], v = +r[5];
        if (!(h > 0 && l > 0 && c > 0)) continue;
        rows.push([r[0], h, l, c, isFinite(v) && v > 0 ? v : 0]);
      }
      rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      if (rows.length < 2) return null;
      const last = rows[rows.length - 1], win = rows.slice(-14);
      const hh = Math.max(...win.map(x => x[1])), ll = Math.min(...win.map(x => x[2]));
      return {
        d: String(last[0]).slice(0, 10), c: last[3], v: last[4],
        chg: (last[3] / rows[rows.length - 2][3] - 1) * 100,
        wr: rows.length < 14 || hh === ll ? null : (hh - last[3]) / (hh - ll) * -100,
      };
    } catch (e) { return null; }
  }

  async function startScan() {
    scanning = true; scanDone = 0; scanTotal = STOCKS.length; SCREEN = [];
    let i = 0;
    const worker = async () => {
      while (i < STOCKS.length) {
        const [t, n, ex] = STOCKS[i++];
        const r = await scanOne(t);
        if (r) SCREEN.push(Object.assign({ t, name: n, ex }, r));
        scanDone++;
        if (scanDone % 15 === 0) render();
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    scanning = false;
    render();
  }

  /* ── Điều kiện AIR Vortex ADX (cột xanh ở nến cuối) ──
     Cần toàn bộ lịch sử nên chỉ tải file của các mã đã qua các điều kiện khác, và chỉ khi bật lọc "Xanh". */
  const AIR = {};                         // mã → 'g' | 'r' | 'n' | 'x' (lỗi)
  const airQ = [], airSeen = new Set();
  let airRun = 0, airDone = 0;

  async function airOne(t) {
    try {
      if (typeof window.vnAirStatus !== 'function') return 'x';
      const res = await fetchWithTimeout(`data/${encodeURIComponent(t)}.json`, 10000);
      if (!res.ok) return 'x';
      const j = JSON.parse(clean(await res.text()));
      const raw = Array.isArray(j) ? j : (j && j.candles);
      if (!Array.isArray(raw)) return 'x';
      const rows = [];
      for (const r of raw) {
        if (!Array.isArray(r) || r.length < 5) continue;
        const o = +r[1], h = +r[2], l = +r[3], c = +r[4], v = +r[5];
        if (!(o > 0 && h > 0 && l > 0 && c > 0)) continue;
        rows.push([r[0], o, h, l, c, isFinite(v) && v > 0 ? v : 0]);
      }
      rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      const C = rows.map((r, i) => ({ time: i, open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] }));
      return window.vnAirStatus(C);
    } catch (e) { return 'x'; }
  }
  function pumpAir() {
    while (airRun < 6 && airQ.length) {
      const t = airQ.shift();
      airRun++;
      airOne(t).then(s => { AIR[t] = s; }).finally(() => {
        airRun--; airDone++;
        if ((!airQ.length && airRun === 0) || airDone % 10 === 0) render();
        pumpAir();
      });
    }
  }
  function queueAir(t) {
    if (airSeen.has(t)) return;
    airSeen.add(t); airQ.push(t); pumpAir();
  }

  /* ── Hiển thị: tự lọc theo điều kiện, không cần bấm gì ── */
  function render() {
    const minVol = parseFloat($('f-vol').value) || 0;
    const wrIn = parseFloat($('f-wr').value);
    const minWr = isNaN(wrIn) ? -100 : wrIn;
    const ex = $('f-ex').value;

    // Phiên mới nhất = ngày có nhiều mã nhất (vài mã lệch ngày sẽ bị loại, không làm mất cả danh sách)
    const cntD = {};
    SCREEN.forEach(r => { cntD[r.d] = (cntD[r.d] || 0) + 1; });
    const latest = Object.keys(cntD).sort((a, b) => cntD[b] - cntD[a] || (a < b ? 1 : -1))[0] || '';

    const base = SCREEN
      .filter(r => r.d === latest && r.wr !== null && r.v > minVol && r.wr > minWr &&
                   (ex === 'ALL' || r.ex === ex))
      .sort((a, b) => b.v - a.v);

    let out = base, airPending = 0;
    if ($('f-air').value === 'G') {
      base.forEach(r => { if (!(r.t in AIR)) queueAir(r.t); });
      airPending = base.filter(r => !(r.t in AIR)).length;
      out = base.filter(r => AIR[r.t] === 'g');
    }

    $('scan-info').textContent =
      `${out.length} mã phù hợp / ${SCREEN.length} mã có dữ liệu` +
      (scanning ? ` · đang quét ${scanDone}/${scanTotal}…` : '') +
      (airPending ? ` · đang tính AIR (còn ${airPending})…` : '') +
      (latest ? ` · phiên ${latest}` : '') + ' · %R(14)';

    const box = $('scan-list');
    box.innerHTML = '';
    if (!out.length) {
      const e = document.createElement('div');
      e.className = 'sc-empty';
      e.textContent = (scanning || airPending) ? 'Đang quét dữ liệu…' : 'Không có mã nào thỏa điều kiện.';
      box.appendChild(e);
      return;
    }
    out.forEach(r => {
      const d = document.createElement('div');
      d.className = 'sc-row' + (r.t === curTicker ? ' on' : '');
      d.innerHTML = `<b>${r.t}</b><span>${FMT_PRICE(r.c)} · ${FMT_VOL(r.v)}</span>` +
                    `<span class="wr">%R ${r.wr.toFixed(1)}</span>`;
      d.addEventListener('click', () => { loadTicker(r.t); render(); });
      box.appendChild(d);
    });
  }

  /* ── Khởi động: lấy danh sách mã + dữ liệu lọc ── */
  async function loadList() {
    try {
      // Cách 1: screener.json (nhanh)
      try {
        const j = await getJSON('data/screener.json');
        if (!Array.isArray(j.rows) || j.rows.length < 20) throw new Error('screener.json rỗng');
        SCREEN = j.rows;
        STOCKS = SCREEN.map(r => [r.t, r.name, r.ex]);
        applyList();
        render();
        return;
      } catch (e) {
        console.warn('[screener] bỏ qua screener.json:', e.message);
      }
      // Cách 2: danh sách từ manifest.json + tự quét từng file
      const m = await getJSON('data/manifest.json');
      STOCKS = Object.entries(m)
        .filter(([, v]) => v && (v.candles_count === undefined || v.candles_count > 0))
        .map(([t, v]) => [t, v.name || t, v.exchange || 'HOSE']);
      if (STOCKS.length < 20) throw new Error('manifest.json có quá ít mã');
      applyList();
      startScan();
    } catch (e) {
      console.warn('[screener]', e);
      $('scan-info').innerHTML =
        'Không tải được dữ liệu <button class="scan-btn" id="scan-retry">Thử lại</button>';
      $('scan-retry').addEventListener('click', () => loadList().catch(() => {}));
      throw e;   // để index.html dùng danh sách dự phòng
    }
  }

  ['f-vol', 'f-wr', 'f-ex', 'f-air'].forEach(id => $(id).addEventListener('input', render));

  // index.html gọi fetchTickerList() khi khởi động
  window.fetchTickerList = loadList;
})();
