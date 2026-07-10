#!/usr/bin/env python3
"""
Fetch Vietnamese stock OHLCV data from TCBS API and save as JSON files.
Run by GitHub Actions daily after market close, or manually.

Usage:
    pip install requests
    python scripts/fetch_stocks.py

Output: data/{TICKER}.json for each stock
"""

import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR   = "data"
RESOLUTION = "D"           # D = daily
YEARS_BACK = 10            # keep 10 years of history
SLEEP_SEC  = 0.3           # politeness delay between requests
TIMEOUT    = 15

# ── Full ticker list (HOSE / HNX / UPCOM) ────────────────────────────────────
# These are the 200+ most actively traded stocks. Edit freely.
STOCKS = [
    # HOSE
    ("ACB","ACB","HOSE"),("AGR","Agribank Sec","HOSE"),("ANV","Nam Việt","HOSE"),
    ("BCG","Bamboo Capital","HOSE"),("BCM","Becamex","HOSE"),("BID","BIDV","HOSE"),
    ("BMP","Bình Minh Nhựa","HOSE"),("BSR","Lọc Hóa dầu Bình Sơn","HOSE"),
    ("BVH","Bảo Việt","HOSE"),("CII","CII","HOSE"),("CMG","CMC","HOSE"),
    ("CTD","Coteccons","HOSE"),("CTG","VietinBank","HOSE"),("DCM","Đạm Cà Mau","HOSE"),
    ("DGC","Hóa chất Đức Giang","HOSE"),("DGW","Digiworld","HOSE"),
    ("DPM","Đạm Phú Mỹ","HOSE"),("DRC","Cao su Đà Nẵng","HOSE"),
    ("EIB","Eximbank","HOSE"),("EVF","EVNFC","HOSE"),("FPT","FPT","HOSE"),
    ("FRT","FPT Retail","HOSE"),("GAS","PV Gas","HOSE"),("GEX","Gelex","HOSE"),
    ("GMD","Gemadept","HOSE"),("HAH","Hải An","HOSE"),("HAX","Haxaco","HOSE"),
    ("HCM","HSC","HOSE"),("HDC","HDC","HOSE"),("HDG","Hà Đô","HOSE"),
    ("HDB","HDBank","HOSE"),("HGM","Cao su Hà Giang","HOSE"),
    ("HPG","Hòa Phát","HOSE"),("HT1","Xi măng Hà Tiên 1","HOSE"),
    ("HVN","Vietnam Airlines","HOSE"),("IMP","Imexpharm","HOSE"),
    ("IPA","IPA","HOSE"),("KBC","Kinh Bắc","HOSE"),("KDC","Kido","HOSE"),
    ("KDH","Khang Điền","HOSE"),("KOS","Kosy","HOSE"),("LPB","LienViet Post Bank","HOSE"),
    ("MBB","MB Bank","HOSE"),("MCM","Mía đường Cao Bằng","HOSE"),
    ("MHC","MHC","HOSE"),("MSB","MSB","HOSE"),("MSN","Masan","HOSE"),
    ("MWG","Thế Giới Di Động","HOSE"),("NKG","Thép Nam Kim","HOSE"),
    ("NLG","Nam Long","HOSE"),("NVL","Novaland","HOSE"),("OCB","OCB","HOSE"),
    ("OCP","OCP","HOSE"),("PDR","Phát Đạt","HOSE"),("PHR","Cao su Phước Hòa","HOSE"),
    ("PLX","Petrolimex","HOSE"),("PNJ","PNJ","HOSE"),("POW","PV Power","HOSE"),
    ("PPC","Nhiệt điện Phả Lại","HOSE"),("PTB","Phú Tài","HOSE"),
    ("PVD","PV Drilling","HOSE"),("PVT","PV Trans","HOSE"),("REE","REE","HOSE"),
    ("SAB","Sabeco","HOSE"),("SBT","SBT","HOSE"),("SCR","Đất Xanh","HOSE"),
    ("SCS","Dịch vụ Hàng không Tân Sơn Nhất","HOSE"),("SHB","SHB","HOSE"),
    ("SIP","SIP","HOSE"),("SKG","Superdong","HOSE"),("SRC","Cao su Sao Vàng","HOSE"),
    ("SSB","SeABank","HOSE"),("SSI","SSI","HOSE"),("STB","Sacombank","HOSE"),
    ("SVC","Sài Gòn Cargo","HOSE"),("TCB","Techcombank","HOSE"),
    ("TCH","Hoàng Huy","HOSE"),("TDM","Nước Thủ Dầu Một","HOSE"),
    ("TIP","Khu CN Tín Nghĩa","HOSE"),("TLH","Thép Tiến Lên","HOSE"),
    ("TPB","TPBank","HOSE"),("UDC","Urban Dev","HOSE"),("VCB","Vietcombank","HOSE"),
    ("VCI","Viet Capital Sec","HOSE"),("VDS","Rồng Việt Sec","HOSE"),
    ("VGC","Viglacera","HOSE"),("VGI","Viettel Global","HOSE"),
    ("VHC","Vĩnh Hoàn","HOSE"),("VHM","Vinhomes","HOSE"),("VIB","VIB","HOSE"),
    ("VIC","Vingroup","HOSE"),("VIX","VIX Sec","HOSE"),("VJC","Vietjet","HOSE"),
    ("VND","VNDirect Sec","HOSE"),("VNM","Vinamilk","HOSE"),("VOS","Vosco","HOSE"),
    ("VPB","VPBank","HOSE"),("VPI","Văn Phú Invest","HOSE"),("VRE","Vincom Retail","HOSE"),
    ("VSC","Container VN","HOSE"),("VSH","Vĩnh Sơn–Sông Hinh","HOSE"),
    ("VTP","Viettel Post","HOSE"),("YEG","Yeah1 Group","HOSE"),
    # HNX
    ("ACE","ACE Life","HNX"),("APS","AP Securities","HNX"),("BBS","Vicem Bút Sơn","HNX"),
    ("BCC","Xi măng Bỉm Sơn","HNX"),("BSI","BIDV Securities","HNX"),
    ("BVS","Bảo Việt Sec","HNX"),("CDN","Cảng Đà Nẵng","HNX"),
    ("DBC","Dabaco","HNX"),("HAI","Nông dược HAI","HNX"),("HAN","Hà Nội Sec","HNX"),
    ("HBS","HBS Sec","HNX"),("HHC","Bánh kẹo Hải Hà","HNX"),
    ("HPT","HPT IT Services","HNX"),("HUT","Tasco","HNX"),("IDC","IDICO","HNX"),
    ("LAS","LASCO","HNX"),("MBS","MB Sec","HNX"),("MIC","Bảo hiểm Quân đội","HNX"),
    ("NTP","Nhựa Tiền Phong","HNX"),("NVB","NCB","HNX"),("ONE","Truyền thông ONE","HNX"),
    ("PHP","Cảng Hải Phòng","HNX"),("PME","Pymepharco","HNX"),("PVC","PV Coating","HNX"),
    ("PVI","PVI Holdings","HNX"),("PVS","PV Technical","HNX"),
    ("SHS","SHS Sec","HNX"),("SLS","Mía đường Sơn La","HNX"),
    ("TBC","Thủy điện Thác Bà","HNX"),("TDN","Thép Đà Nẵng","HNX"),
    ("TMT","ÔTô TMT","HNX"),("TNG","TNG Invest","HNX"),("TVB","Than Vàng Danh","HNX"),
    ("VCC","Vicostone","HNX"),("VCG","Vinaconex","HNX"),("VGS","Thép VGS","HNX"),
    ("VNA","Vinalines","HNX"),("VNR","Tái BH VN","HNX"),("VTC","VTC Media","HNX"),
    # UPCOM
    ("ACV","ACV","UPCOM"),("BAB","Bắc Á Bank","UPCOM"),("BVB","Bản Việt Bank","UPCOM"),
    ("CTF","City Auto","UPCOM"),("KLB","Kiên Long Bank","UPCOM"),
    ("MCH","Masan Consumer","UPCOM"),("MSR","Masan Resources","UPCOM"),
    ("NAB","Nam A Bank","UPCOM"),("NSC","Giống cây trồng VN","UPCOM"),
    ("NT2","NT2","UPCOM"),("OIL","PVOIL","UPCOM"),("RAL","Điện Quang","UPCOM"),
    ("SGB","Saigonbank","UPCOM"),("SNZ","Sonadezi","UPCOM"),
    ("TLG","Thiên Long","UPCOM"),("TRA","Traphaco","UPCOM"),
    ("TRC","Cao su Tây Ninh","UPCOM"),("VAB","Việt Á Bank","UPCOM"),
    ("VEA","VEAM","UPCOM"),("VGT","Vinatex","UPCOM"),("VMD","Vimedimex","UPCOM"),
    ("VPS","VPS Sec","UPCOM"),("VTB","Vietbank","UPCOM"),("WSS","WSS Sec","UPCOM"),
]

# ── API ───────────────────────────────────────────────────────────────────────
TCBS_URL = (
    "https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/his-price"
    "?ticker={ticker}&type=stock&resolution={resolution}&from={from_ts}&to={to_ts}"
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VNChartDataFetcher/1.0)",
    "Accept": "application/json",
}

def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode())

def fetch_ticker(ticker: str, from_ts: int, to_ts: int) -> list:
    url = TCBS_URL.format(
        ticker=ticker, resolution=RESOLUTION,
        from_ts=from_ts, to_ts=to_ts
    )
    data = fetch_json(url)
    rows = data.get("data") or data.get("stockPriceList") or []
    result = []
    for r in rows:
        date_str = r.get("tradingDate") or r.get("date") or ""
        if not date_str:
            continue
        ymd = str(date_str)[:10]
        ts = int(datetime.strptime(ymd, "%Y-%m-%d")
                 .replace(tzinfo=timezone.utc).timestamp())
        result.append([
            ts,
            float(r.get("open")  or r.get("priceOpen")  or 0),
            float(r.get("high")  or r.get("priceHigh")  or 0),
            float(r.get("low")   or r.get("priceLow")   or 0),
            float(r.get("close") or r.get("priceClose") or 0),
            int(r.get("volume")  or r.get("dealVolume") or 0),
        ])
    result.sort(key=lambda x: x[0])
    return result

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    now    = int(datetime.now(timezone.utc).timestamp())
    from_ts = now - YEARS_BACK * 366 * 86400

    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ok, fail = 0, 0

    for ticker, name, exchange in STOCKS:
        path = os.path.join(DATA_DIR, f"{ticker}.json")
        try:
            candles = fetch_ticker(ticker, from_ts, now)
            if not candles:
                raise ValueError("empty response")
            payload = {
                "ticker":      ticker,
                "name":        name,
                "exchange":    exchange,
                "updated":     updated,
                "resolution":  RESOLUTION,
                "candles":     candles,   # [[ts, o, h, l, c, v], ...]
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, separators=(",", ":"))
            print(f"  ✓  {ticker:6s}  {len(candles):4d} bars")
            ok += 1
        except Exception as e:
            print(f"  ✗  {ticker:6s}  {e}")
            fail += 1
        time.sleep(SLEEP_SEC)

    # Write manifest so index.html knows which tickers have local data
    manifest = {
        "updated": updated,
        "tickers": [t for t, _, _ in STOCKS],
    }
    with open(os.path.join(DATA_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f)

    print(f"\nDone: {ok} ok, {fail} failed.")

if __name__ == "__main__":
    main()
