/* screener.js – bộ lọc cổ phiếu: Volume & Williams %R(14), đọc data/screener.json.
   Gắn vào index.html bằng 1 dòng, đặt TRƯỚC <script src="kt-indicators.js">:
     <script src="screener.js"></script>
   File tự thêm CSS, nút "🔎 Lọc" trên header và panel 1/4 màn hình bên phải.
   Đồng thời thay nguồn danh sách mã: đọc từ data/screener.json (thay vì TCBS + proxy). */
(function () {
  'use strict';
  if (document.getElementById('scan')) return;   // tránh nhân đôi nếu đã dán bản cũ

  const $ = id => document.getElementById(id);

  /* ── CSS ── */
  const style = document.createElement('style');
  style.textContent = `
  :root{--scan-w:25vw}
  .app{width:100vw}
  body.scan-open .app{width:calc(100vw - var(--scan-w))}
  #scan{position:fixed;top:0;right:0;width:var(--scan-w);min-width:240px;height:100vh;
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
  .sc-row{display:grid;grid-template-columns:54px 1fr auto;gap:8px;padding:7px 12px;
    cursor:pointer;font-size:12px;border-bottom:1px solid var(--border)}
  .sc-row:hover,.sc-row.on{background:var(--surface2)}
  .sc-row b{font-size:13px}
  .sc-row span{text-align:right;color:var(--muted)}
  .sc-row .wr{color:var(--accent)}
  @media(max-width:768px){#scan{width:100vw}body.scan-open .app{width:100vw}}`;
  document.head.appendChild(style);

  /* ── Panel ── */
  const panel = document.createElement('aside');
  panel.id = 'scan';
  panel.innerHTML = `
    <div class="scan-h"><span>Lọc cổ phiếu</span><button class="scan-btn" id="scan-close">✕</button></div>
    <div class="scan-f">
      <label>Volume &gt;<input id="f-vol" type="number" value="500000" step="50000" min="0"></label>
      <label>Williams %R &gt;<input id="f-wr" type="number" value="-60" step="1" min="-100" max="0"></label>
      <label style="grid-column:1/3">Sàn
        <select id="f-ex"><option value="ALL">Tất cả</option><option>HOSE</option><option>HNX</option><option>UPCOM</option></select>
      </label>
    </div>
    <div id="scan-info">Đang tải bộ lọc…</div>
    <div id="scan-list"></div>`;
  document.body.appendChild(panel);

  /* ── Nút bật/tắt trên header ── */
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
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);  // để biểu đồ co giãn lại
  }
  btn.addEventListener('click', () => setOpen(!document.body.classList.contains('scan-open')));
  $('scan-close').addEventListener('click', () => setOpen(false));
  setOpen(window.innerWidth > 768);

  /* ── Dữ liệu + hiển thị ── */
  let SCREEN = [], SESSION = '';

  function render() {
    const minVol = parseFloat($('f-vol').value) || 0;
    const wrIn = parseFloat($('f-wr').value);
    const minWr = isNaN(wrIn) ? -100 : wrIn;
    const ex = $('f-ex').value;
    const out = SCREEN
      .filter(r => !r.stale && r.wr !== null && r.v > minVol && r.wr > minWr &&
                   (ex === 'ALL' || r.ex === ex))
      .sort((a, b) => b.v - a.v);
    $('scan-info').textContent =
      `${out.length}/${SCREEN.length} mã phù hợp · phiên ${SESSION || '—'} · %R(14)`;
    const box = $('scan-list');
    box.innerHTML = '';
    out.forEach(r => {
      const d = document.createElement('div');
      d.className = 'sc-row' + (r.t === curTicker ? ' on' : '');
      d.innerHTML = `<b>${r.t}</b><span>${FMT_PRICE(r.c)} · ${FMT_VOL(r.v)}</span>` +
                    `<span class="wr">%R ${r.wr.toFixed(1)}</span>`;
      d.addEventListener('click', () => { loadTicker(r.t); render(); });
      box.appendChild(d);
    });
  }

  async function loadScreener() {
    try {
      const res = await fetchWithTimeout('data/screener.json?t=' + Math.floor(Date.now() / 600000), 10000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!Array.isArray(j.rows) || j.rows.length < 20) throw new Error('screener.json rỗng');
      SCREEN = j.rows;
      SESSION = j.latest_session || '';
      STOCKS = SCREEN.map(r => [r.t, r.name, r.ex]);   // danh sách mã cho ô tìm kiếm
      buildMap();
      updateCount(`${STOCKS.length} mã`, true);
      $('empty-hint').textContent = `Hỗ trợ ${STOCKS.length} mã · phiên ${SESSION}`;
      render();
    } catch (e) {
      console.warn('[screener]', e);
      $('scan-info').innerHTML =
        'Không tải được data/screener.json <button class="scan-btn" id="scan-retry">Thử lại</button>';
      $('scan-retry').addEventListener('click', () => loadScreener().catch(() => {}));
      throw e;   // để index.html dùng danh sách dự phòng
    }
  }

  ['f-vol', 'f-wr', 'f-ex'].forEach(id => $(id).addEventListener('input', render));

  // index.html gọi fetchTickerList() khi khởi động: đổi sang đọc data/screener.json
  window.fetchTickerList = loadScreener;
})();
