#!/usr/bin/env python3
"""Tạo data/screener.json từ data/<MÃ>.json + data/manifest.json (chạy sau fetch_data.py)."""
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
N = 14             # chu kỳ Williams %R
MIN_TICKERS = 50   # ít hơn mức này coi là lỗi, không ghi đè file cũ


def load(p):
    t = p.read_text(encoding="utf-8")
    t = re.sub(r"\bNaN\b", "null", t)
    t = re.sub(r"-?Infinity\b", "null", t)
    return json.loads(t)


def num(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def is_manifest(obj):
    return (isinstance(obj, dict) and len(obj) > 10 and
            all(isinstance(v, dict) and "exchange" in v for v in list(obj.values())[:10]))


def main():
    meta, tickers = {}, []
    for p in sorted(DATA.glob("*.json")):
        if p.name == "screener.json":
            continue
        try:
            obj = load(p)
        except Exception as e:  # noqa: BLE001
            print(f"[bỏ qua] {p.name}: {e}")
            continue
        if is_manifest(obj):
            meta.update(obj)
        else:
            tickers.append((p.stem.upper(), obj))

    out_rows = []
    for t, obj in tickers:
        raw = obj if isinstance(obj, list) else (obj or {}).get("candles")
        if not isinstance(raw, list):
            continue
        rows = []
        for r in raw:
            if not isinstance(r, (list, tuple)) or len(r) < 6:
                continue
            h, l, c, v = num(r[2]), num(r[3]), num(r[4]), num(r[5])
            if not (h and l and c) or min(h, l, c) <= 0:
                continue
            rows.append((r[0], h, l, c, v or 0.0))
        rows.sort(key=lambda x: str(x[0]))
        if len(rows) < 2:
            continue
        d, _, _, c, v = rows[-1]
        win = rows[-N:]
        hh, ll = max(x[1] for x in win), min(x[2] for x in win)
        wr = None if len(rows) < N or hh == ll else round((hh - c) / (hh - ll) * -100, 2)
        m = meta.get(t, {})
        out_rows.append({
            "t": t,
            "name": m.get("name", t),
            "ex": m.get("exchange", "HOSE"),
            "d": str(d)[:10],
            "c": c,
            "v": int(v),
            "chg": round((c / rows[-2][3] - 1) * 100, 2),
            "wr": wr,
        })

    if len(out_rows) < MIN_TICKERS:
        sys.exit(f"Chỉ có {len(out_rows)} mã hợp lệ (< {MIN_TICKERS}); dừng để không ghi đè dữ liệu cũ.")

    counts = {}
    for r in out_rows:
        counts[r["d"]] = counts.get(r["d"], 0) + 1
    latest = max(counts, key=lambda d: (counts[d], d))   # ngày có nhiều mã nhất
    for r in out_rows:
        r["stale"] = r["d"] != latest   # mã thiếu phiên mới nhất (tạm ngừng/thiếu dữ liệu)

    out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
           "latest_session": latest, "count": len(out_rows), "rows": out_rows}
    tmp = DATA / "screener.json.tmp"
    tmp.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(DATA / "screener.json")
    print(f"OK: {len(out_rows)} mã, phiên mới nhất {latest}")


if __name__ == "__main__":
    main()
