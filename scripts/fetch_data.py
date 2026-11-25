#!/usr/bin/env python3
"""Tải giá từ Yahoo Finance -> data/<MÃ>.json và data/manifest.json.

Danh sách mã (STOCKS) lấy từ scripts/fetch_stocks.py: file cũ GIỮ NGUYÊN
(chỉ dùng làm nơi chứa danh sách), không cần sửa gì trong đó.
"""
import json
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fetch_stocks import STOCKS  # an toàn: file cũ chỉ chạy main() khi chạy trực tiếp

import yfinance as yf

DATA = HERE.parent / "data"
PERIOD = "5y"          # nút 3N/10N cần nhiều hơn 1y; đặt "3y" nếu muốn repo nhẹ hơn
RETRIES = 3
MIN_KEEP_RATIO = 0.9   # ít hơn 90% số mã của lần trước => báo lỗi, không commit
# Yahoo chủ yếu có hậu tố .VN; .HN thử thêm cho HNX/UPCOM (có thể không có dữ liệu)
SUFFIXES = {"HOSE": [".VN"], "HNX": [".VN", ".HN"], "UPCOM": [".VN", ".HN"]}
NAME_FIX = {"KHG": "Khải Hoàn Land", "GMD": "Gemadept"}
VN_TZ = timezone(timedelta(hours=7))
# Mã bổ sung (chưa có trong fetch_stocks.py). Muốn thêm mã mới thì thêm vào đây.
# Yahoo có thể không có dữ liệu một số mã; xem log của Actions để biết mã nào thất bại.
EXTRA_STOCKS = [
    ("MSB", "Hàng Hải MSB", "HOSE"), ("SHI", "Sơn Hà International", "HOSE"),
    ("BAF", "BAF Việt Nam", "HOSE"), ("TNI", "Thành Nam Group", "HOSE"),
    ("VC3", "Nam Mê Kông", "HNX"),
]


def unique_stocks():
    seen, out = set(), []
    for t, name, ex in list(STOCKS) + EXTRA_STOCKS:
        if t in seen:
            print(f"[cảnh báo] trùng mã {t}, bỏ qua")
            continue
        seen.add(t)
        out.append((t, NAME_FIX.get(t, name), ex))
    return out


def drop_unfinished_bar(candles):
    """Bỏ nến hôm nay nếu phiên chưa kết thúc (HOSE đóng cửa 14:45).
    Nến dở dang có volume rất nhỏ và giá chưa phải giá đóng cửa => lọc sai."""
    now = datetime.now(VN_TZ)
    if candles and candles[-1][0] == now.strftime("%Y-%m-%d") and (now.hour, now.minute) < (15, 30):
        candles.pop()
    return candles


def fetch_candles(ticker, exchange):
    """Trả về (candles, symbol) nếu được, hoặc (None, lý do lỗi)."""
    last_err = "không có dữ liệu"
    for suffix in SUFFIXES.get(exchange, [".VN"]):
        symbol = ticker + suffix
        df = None
        for attempt in range(1, RETRIES + 1):
            try:
                df = yf.Ticker(symbol).history(period=PERIOD, interval="1d", timeout=20)
                break
            except Exception as e:  # noqa: BLE001
                last_err = str(e)[:120]
                time.sleep(2 * attempt)
        if df is None or df.empty:
            continue
        candles = []
        for ts, r in df.iterrows():
            try:
                o, h, l, c, v = (float(r[k]) for k in ("Open", "High", "Low", "Close", "Volume"))
            except (TypeError, ValueError, KeyError):
                continue
            if not all(math.isfinite(x) for x in (o, h, l, c, v)):
                continue
            if min(o, h, l, c) <= 0 or v <= 0 or h < l:
                continue
            candles.append([ts.strftime("%Y-%m-%d"), round(o, 4), round(h, 4),
                            round(l, 4), round(c, 4), int(v)])
        candles = drop_unfinished_bar(candles)
        if len(candles) >= 2:
            return candles, symbol
        last_err = "dữ liệu rỗng sau khi lọc"
    return None, last_err


def write_json(path, obj, **kw):
    tmp = Path(str(path) + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, allow_nan=False, **kw)  # có NaN => lỗi ngay
    os.replace(tmp, path)


def main():
    DATA.mkdir(exist_ok=True)
    stocks = unique_stocks()
    try:
        manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        manifest = {}
    prev_ok = sum(1 for v in manifest.values() if v.get("candles_count", 0) > 0)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    ok, failed = 0, []
    for i, (ticker, name, ex) in enumerate(stocks, 1):
        print(f"[{i}/{len(stocks)}] {ticker}...", end=" ", flush=True)
        candles, info = fetch_candles(ticker, ex)
        if candles:
            write_json(DATA / f"{ticker}.json", candles, separators=(",", ":"))
            manifest[ticker] = {"name": name, "exchange": ex,
                                "last_updated": now, "candles_count": len(candles),
                                "last_bar": candles[-1][0]}
            ok += 1
            print(f"OK ({len(candles)} ngày, {info})")
        else:
            failed.append(ticker)
            manifest.setdefault(ticker, {"name": name, "exchange": ex, "candles_count": 0})
            print(f"THẤT BẠI ({info})")
        time.sleep(0.3)

    write_json(DATA / "manifest.json", manifest, indent=2)

    msg = f"Hoàn thành: {ok}/{len(stocks)} mã. Lỗi: {', '.join(failed) or 'không'}"
    print("\n" + msg)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(msg + "\n")

    if prev_ok and ok < prev_ok * MIN_KEEP_RATIO:
        sys.exit(f"Chỉ {ok} mã thành công, lần trước {prev_ok}. Dừng để không commit dữ liệu thiếu.")


if __name__ == "__main__":
    main()
