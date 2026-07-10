import os
import json
import time
import requests

# Cấu hình chung
TIMEOUT = 15
SLEEP_SEC = 0.3
RESOLUTION = "D"

# Danh sách các mã cổ phiếu (HOSE, HNX, UPCOM)
STOCKS = [
    # HOSE
    ("AAA","An Phát Bioplastics","HOSE"),("ACB","Á Châu","HOSE"),("ADG","Clever Group","HOSE"),("AGG","An Gia","HOSE"),
    ("AGR","Agribank Securities","HOSE"),("ANV","Nam Việt","HOSE"),("APC","Chiếu xạ An Phú"),("ASM","Sao Mai","HOSE"),
    ("ASP","Dầu khí An Pha","HOSE"),("AST","Taseco Airs","HOSE"),("BCE","Xây dựng Bình Dương","HOSE"),("BCG","Bamboo Capital","HOSE"),
    ("BCM","Becamex","HOSE"),("BFC","Phân bón Bình Điền","HOSE"),("BHN","Habeco","HOSE"),("BIC","Bảo hiểm BIDV","HOSE"),
    ("BID","BIDV","HOSE"),("BMC","Khoáng sản Bình Định","HOSE"),("BMI","Bảo Minh","HOSE"),("BMP","Nhựa Bình Minh","HOSE"),
    ("BRC","Cao su Bến Thành","HOSE"),("BSI","BSC Securities","HOSE"),("BSR","Lọc hóa dầu Bình Sơn","HOSE"),("BTP","Nhiệt điện Bà Rịa","HOSE"),
    ("BWE","Biwase","HOSE"),("C32","Đầu tư Xây dựng 3-2","HOSE"),("C47","Xây dựng 47","HOSE"),("CAV","Cadivi","HOSE"),
    ("CCI","Đầu tư Phát triển Củ Chi","HOSE"),("CCL","Dầu khí Cửu Long","HOSE"),("CDC","Chương Dương","HOSE"),("CEE","Xây dựng hạ tầng CII","HOSE"),
    ("CHM","Chợ Lớn M&E","HOSE"),("CIG","COMA 18","HOSE"),("CII","Hạ tầng TP.HCM","HOSE"),("CKG","Xây dựng Kiên Giang","HOSE"),
    ("CLC","Thuốc lá Cát Lợi","HOSE"),("CLL","Cảng Cát Lái","HOSE"),("CMG","Công nghệ CMC","HOSE"),("CMP","Cảng Chân Mây","HOSE"),
    ("CMV","Thương nghiệp Cà Mau","HOSE"),("CNG","CNG Việt Nam","HOSE"),("COM","Vật tư Xăng dầu","HOSE"),("CRE","Cen Land","HOSE"),
    ("CSM","Cao su Miền Nam","HOSE"),("CSV","Hóa chất Cơ bản miền Nam","HOSE"),("CTD","Coteccons","HOSE"),("CTF","City Auto","HOSE"),
    ("CTG","VietinBank","HOSE"),("CTI","Cường Thuận IDICO","HOSE"),("CTR","Công trình Viettel","HOSE"),("CTS","VietinBank Securities","HOSE"),
    ("CVT","CMC Tiles","HOSE"),("D2D","Phát triển Đô thị công nghiệp số 2","HOSE"),("DAG","Nhựa Đông Á","HOSE"),("DAH","Đông Á Hotel","HOSE"),
    ("DAT","Đầu tư Du lịch Phát triển Thủy sản","HOSE"),("DBC","Dabaco","HOSE"),("DBD","Dược - Trang thiết bị Y tế Bình Định","HOSE"),
    ("DBT","Dược phẩm Bến Tre","HOSE"),("DC4","DIC số 4","HOSE"),("DCL","Dược phẩm Cửu Long","HOSE"),("DCM","Phân bón Dầu khí Cà Mau","HOSE"),
    ("DGC","Hóa chất Đức Giang","HOSE"),("DGW","Digiworld","HOSE"),("DHA","Hóa An","HOSE"),("DHC","Đông Hải Bến Tre","HOSE"),
    ("DHG","Dược Hậu Giang","HOSE"),("DHM","Thương mại và Khai thác Khoáng sản Dương Hiếu","HOSE"),("DIG","DIC Corp","HOSE"),
    ("DLG","Đức Long Gia Lai","HOSE"),("DMC","Dược phẩm Domesco","HOSE"),("DPG","Đạt Phương","HOSE"),("DPM","Phân bón Hóa chất Dầu khí","HOSE"),
    ("DPR","Cao su Đồng Phú","HOSE"),("DQC","Bóng đèn Điện Quang","HOSE"),("DRC","Cao su Đà Nẵng","HOSE"),("DTD","Đầu tư Phát triển Thành Đạt","HOSE"),
    ("DTL","Đại Thiên Lộc","HOSE"),("DTT","Thương mại Thành Tài","HOSE"),("DVP","Cảng Đình Vũ","HOSE"),("DXG","Đất Xanh Group","HOSE"),
    ("EIB","Eximbank","HOSE"),("ELC","Công nghệ Elcom","HOSE"),("EMC","Cơ điện Thủ Đức","HOSE"),("EVE","Everpia","HOSE"),
    ("EVG","Tập đoàn Everland","HOSE"),("EVF","Tài chính Điện lực","HOSE"),("FCM","Khoáng sản Fecon","HOSE"),("FCN","Fecon","HOSE"),
    ("FDC","Ngoại thương Ngoại doanh HCM","HOSE"),("FIR","Địa ốc First Real","HOSE"),("FIT","Tập đoàn F.I.T","HOSE"),("FLC","Tập đoàn FLC","HOSE"),
    ("FMC","Thực phẩm Sao Ta","HOSE"),("FTS","FPT Securities","HOSE"),("FPT","Tập đoàn FPT","HOSE"),("FRT","FPT Retail","HOSE"),
    ("GAS","PV Gas","HOSE"),("GDT","Gỗ Đức Thành","HOSE"),("GEG","Điện Gia Lai","HOSE"),("GEX","Tập đoàn GELEX","HOSE"),
    ("GIL","Sản xuất Kinh doanh Xuất nhập khẩu Bình Thạnh","HOSE"),("GMC","Garmex Sài Gòn","HOSE"),("GMD","Gemasubt","HOSE"),
    ("GMH","Minh Hưng Quảng Trị","HOSE"),("GSP","Vận tải Dầu khí Quảng Ngãi","HOSE"),("GTA","Gỗ Thuận An","HOSE"),
    ("GVR","Tập đoàn Công nghiệp Cao su Việt Nam","HOSE"),("HAG","Hoàng Anh Gia Lai","HOSE"),("HAH","Vận tải và Xếp dỡ Hải An","HOSE"),
    ("HAM","Vật tư và Xây dựng Giao thông","HOSE"),("HAN","Xây dựng Hà Nội","HOSE"),("HAP","Tập đoàn Hapaco","HOSE"),
    ("HAR","Bất động sản An Dương Thảo Điền","HOSE"),("HAS","Haseco","HOSE"),("HAX","Ô tô Hàng Xanh","HOSE"),("HBC","Xây dựng Hòa Bình","HOSE"),
    ("HCD","Đầu tư Sản xuất và Thương mại HCD","HOSE"),("HCM","HSC Securities","HOSE"),("HDB","HDBank","HOSE"),("HDC","Phát triển Nhà Bà Rịa - Vũng Tàu","HOSE"),
    ("HDG","Tập đoàn Hà Đô","HOSE"),("HHP","Giấy Hải Phòng","HOSE"),("HHS","Hoàng Huy Đầu tư Dịch vụ","HOSE"),("HHV","Đầu tư Hạ tầng Giao thông Đèo Cả","HOSE"),
    ("HID","Halcom Việt Nam","HOSE"),("HII","An Tiến Industries","HOSE"),("HMC","Kim khí TP.HCM","HOSE"),("HNG","HAGL Agrico","HOSE"),
    ("Hố","Bất động sản Hồ","HOSE"),("HOT","Du lịch Dịch vụ Hội An","HOSE"),("HPG","Tập đoàn Hòa Phát","HOSE"),("HPX","Hải Phát Investment","HOSE"),
    ("HQC","Địa ốc Hoàng Quân","HOSE"),("HRC","Cao su Hòa Bình","HOSE"),("HSG","Tập đoàn Hoa Sen","HOSE"),("HSL","Đầu tư Phát triển Thực phẩm Sao Vàng","HOSE"),
    ("HT1","Xi măng Hà Tiên 1","HOSE"),("HT9","Xây lắp Thành An 96","HOSE"),("HTG","May Hòa Thọ","HOSE"),("HTI","Đầu tư Phát triển Hạ tầng IDICO","HOSE"),
    ("HTL","Kỹ thuật và Ô tô Trường Long","HOSE"),("HTN","Hưng Thịnh Incons","HOSE"),("HTV","Vận tải Hà Tiên","HOSE"),("HU1","HUD1","HOSE"),
    ("HU3","HUD3","HOSE"),("HUB","Xây lắp Thừa Thiên Huế","HOSE"),("HU4","HUD4","HOSE"),("HUT","Tập đoàn Tasco","HOSE"),
    ("HVH","Đầu tư và Công nghệ HVC","HOSE"),("HVN","Vietnam Airlines","HOSE"),("IBC","Apax Holdings","HOSE"),("IDI","Đầu tư và Phát triển Đa Quốc Gia","HOSE"),
    ("IDJ","Đầu tư Chợ Lớn","HOSE"),("IJC","Phát triển Hạ tầng Becamex IJC","HOSE"),("ILB","Cảng ICD Tân Cảng Long Bình","HOSE"),
    ("IMP","Dược phẩm Imexpharm","HOSE"),("ITA","Tân Tạo","HOSE"),("ITC","Đầu tư và Kinh doanh Nhà","HOSE"),("ITD","Công nghệ Tiên Phong","HOSE"),
    ("KBC","Đô thị Kinh Bắc","HOSE"),("KDC","Tập đoàn KIDO","HOSE"),("KDH","Nhà Khang Điền","HOSE"),("KHG","Kải Hoàn Land","HOSE"),
    ("KHP","Điện lực Khánh Hòa","HOSE"),("KMR","Mirae","HOSE"),("KOS","KOSY","HOSE"),("KPF","Đầu tư Tài chính KPF","HOSE"),
    ("KSB","Khoáng sản và Xây dựng Bình Dương","HOSE"),("L10","LILAMA 10","HOSE"),("L14","Licogi 14","HOSE"),("L18","Licogi 18","HOSE"),
    # HNX
    ("PHP","Cảng Hải Phòng","HNX"),("PME","Pymepharco","HNX"),("PVC","PV Coating","HNX"),
    ("PVI","PVI Holdings","HNX"),("PVS","PV Technical","HNX"),
    ("SHS","SHS Sec","HNX"),("SLS","Mía đường Sơn La","HNX"),
    ("TBC","Thủy điện Thác Bà","HNX"),("TDN","Thép Đà Nẵng","HNX"),
    ("TMT","Ô tô TMT","HNX"),("TNG","TNG Invest","HNX"),("TVB","Than Vàng Danh","HNX"),
    ("VCC","Vicostone","HNX"),("VCG","Vinaconex","HNX"),("VGS","Thép VGS","HNX"),
    ("VNA","Vinalines","HNX"),("VNR","Tái BH VN","HNX"),("VTC","VTC Media","HNX"),
    # UPCOM
    ("ACV","ACV","UPCOM"),("BAB","Bắc Á Bank","UPCOM"),("BVB","Bản Việt Bank","UPCOM"),
    ("CTF","City Auto","UPCOM"),("KLB","Kiên Long Bank","UPCOM"),
    ("MCH","Masan Consumer","UPCOM"),("MSR","Masan Resources","UPCOM"),
    ("NAB","Nam Á Bank","UPCOM"),("NSC","Giống cây trồng VN","UPCOM"),
    ("NT2","NT2","UPCOM"),("OIL","PVOIL","UPCOM"),("RAL","Điện Quang","UPCOM"),
    ("SGB","Saigonbank","UPCOM"),("SNZ","Sonadezi","UPCOM"),
    ("TLG","Thiên Long","UPCOM"),("TRA","Traphaco","UPCOM"),
    ("TRC","Cao su Tây Ninh","UPCOM"),("VAB","Việt Á Bank","UPCOM"),
    ("VEA","VEAM","UPCOM"),("VGT","Vinatex","UPCOM"),("VMD","Vimedimex","UPCOM"),
    ("VPS","VPS Sec","UPCOM"),("VTB","Vietbank","UPCOM"),("WSS","WSS Sec","UPCOM"),
]

# --- SSI iBoard API --------------------------------------------------------
SSI_URL = "https://iboardquery.ssi.com.vn/v1/history/chart?symbol={ticker}&resolution={resolution}&from={from_ts}&to={to_ts}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://iboard.ssi.com.vn/",
}

def fetch_json(url: str) -> dict:
    try:
        response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        if response.status_code == 200:
            return response.json()
        print(f" -> Lỗi HTTP: {response.status_code}")
        return {}
    except Exception as e:
        print(f" -> Lỗi kết nối mạng: {e}")
        return {}

def fetch_ticker(ticker: str, from_ts: int, to_ts: int) -> list:
    # Resolution cho SSI: 1D thay vì D
    res = "1D" if RESOLUTION == "D" else RESOLUTION
    url = SSI_URL.format(ticker=ticker, resolution=res, from_ts=from_ts, to_ts=to_ts)
    
    data = fetch_json(url)
    
    # Check cấu trúc UDF tiêu chuẩn (t, o, h, l, c, v)
    if data.get("s") != "ok" or "t" not in data:
        return []
        
    timestamps = data["t"]
    opens = data["o"]
    highs = data["h"]
    lows = data["l"]
    closes = data["c"]
    volumes = data["v"]
    
    candles = []
    for i in range(len(timestamps)):
        # Chuyển đổi timestamp giây sang ngày định dạng YYYY-MM-DD
        t_sec = timestamps[i]
        date_str = time.strftime('%Y-%m-%d', time.localtime(t_sec))
        
        candles.append([
            date_str,
            float(opens[i]),
            float(highs[i]),
            float(lows[i]),
            float(closes[i]),
            int(volumes[i])
        ])
    return candles

def main():
    os.makedirs("data", exist_ok=True)
    
    # Tính khoảng thời gian: cào dữ liệu trong 1 năm qua
    now_ts = int(time.time())
    one_year_ago_ts = now_ts - (365 * 24 * 60 * 60)
    
    success_count = 0
    manifest = {}
    
    print(f"Bắt đầu tải dữ liệu từ API SSI từ {time.strftime('%Y-%m-%d', time.localtime(one_year_ago_ts))} đến {time.strftime('%Y-%m-%d', time.localtime(now_ts))}...")
    
    for idx, item in enumerate(STOCKS, 1):
        ticker = item[0]
        name = item[1] if len(item) > 1 else ""
        exchange = item[2] if len(item) > 2 else ""
        
        print(f"[{idx}/{len(STOCKS)}] Đang tải {ticker}...", end="", flush=True)
        
        candles = fetch_ticker(ticker, one_year_ago_ts, now_ts)
        
        if candles:
            file_path = f"data/{ticker}.json"
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(candles, f, ensure_ascii=False)
            
            manifest[ticker] = {
                "name": name,
                "exchange": exchange,
                "last_updated": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime()),
                "candles_count": len(candles)
            }
            success_count += 1
            print(f" OK ({len(candles)} nến)")
        else:
            print(" Thất bại (Không có dữ liệu hoặc lỗi)")
            
        time.sleep(SLEEP_SEC)
        
    # Ghi file manifest tổng hợp
    with open("data/manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        
    print(f" Hoàn thành: {success_count}/{len(STOCKS)} mã thành công.")

if __name__ == "__main__":
    main()
