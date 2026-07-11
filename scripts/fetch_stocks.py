import os
import json
import time
import yfinance as yf

# Danh sách mã chứng khoán của bạn
STOCKS = [
    # HOSE
    ("AAA","An Phát Bioplastics","HOSE"),("ACB","Á Châu","HOSE"),("ADG","Clever Group","HOSE"),("AGG","An Gia","HOSE"),
    ("AGR","Agribank Securities","HOSE"),("ANV","Nam Việt","HOSE"),("APC","Chiếu xạ An Phú","HOSE"),("ASM","Sao Mai","HOSE"),
    ("ASP","Dầu khí An Pha","HOSE"),("AST","Taseco Airs","HOSE"),("BCE","Xây dựng Bình Dương","HOSE"),("BCG","Bamboo Capital","HOSE"),
    ("BCM","Becamex","HOSE"),("BFC","Phân bón Bình Điền","HOSE"),("BHN","Habeco","HOSE"),("BIC","Bảo hiểm BIDV","HOSE"),
    ("BID","BIDV","HOSE"),("BMC","Khoáng sản Bình Định","HOSE"),("BMI","Bảo Minh","HOSE"),("BMP","Nhựa Bình Minh","HOSE"),
    ("BRC","Cao su Bến Thành","HOSE"),("BSI","BSC Securities","HOSE"),("BSR","Lọc hóa dầu Bình Sơn","HOSE"),("BTP","Nhiệt điện Bà Rịa","HOSE"),
    ("BVH","Bảo Việt","HOSE"),("BWE","Biwase","HOSE"),("C32","Đầu tư Xây dựng 3-2","HOSE"),("C47","Xây dựng 47","HOSE"),
    ("CAV","Cadivi","HOSE"),("CCI","Đầu tư Phát triển Củ Chi","HOSE"),("CCL","Dầu khí Cửu Long","HOSE"),("CDC","Chương Dương","HOSE"),
    ("CEE","Xây dựng hạ tầng CII","HOSE"),("CHM","Chợ Lớn M&E","HOSE"),("CIG","COMA 18","HOSE"),("CII","Hạ tầng TP.HCM","HOSE"),
    ("CKG","Xây dựng Kiên Giang","HOSE"),("CLC","Thuốc lá Cát Lợi","HOSE"),("CLL","Cảng Cát Lái","HOSE"),("CMG","Công nghệ CMC","HOSE"),
    ("CMP","Cảng Chân Mây","HOSE"),("CMV","Thương nghiệp Cà Mau","HOSE"),("CNG","CNG Việt Nam","HOSE"),("COM","Vật tư Xăng dầu","HOSE"),
    ("CRE","Cen Land","HOSE"),("CSM","Cao su Miền Nam","HOSE"),("CSV","Hóa chất Cơ bản miền Nam","HOSE"),("CTD","Coteccons","HOSE"),
    ("CTF","City Auto","HOSE"),("CTG","VietinBank","HOSE"),("CTI","Cường Thuận IDICO","HOSE"),("CTR","Công trình Viettel","HOSE"),
    ("CTS","VietinBank Securities","HOSE"),("CVT","CMC Tiles","HOSE"),("D2D","Phát triển Đô thị công nghiệp số 2","HOSE"),("DAG","Nhựa Đông Á","HOSE"),
    ("DAH","Đông Á Hotel","HOSE"),("DAT","Đầu tư Du lịch Phát triển Thủy sản","HOSE"),("DBC","Dabaco","HOSE"),("DBD","Dược - Trang thiết bị Y tế Bình Định","HOSE"),
    ("DBT","Dược phẩm Bến Tre","HOSE"),("DC4","DIC số 4","HOSE"),("DCL","Dược phẩm Cửu Long","HOSE"),("DCM","Phân bón Dầu khí Cà Mau","HOSE"),
    ("DGC","Hóa chất Đức Giang","HOSE"),("DGW","Digiworld","HOSE"),("DHA","Hóa An","HOSE"),("DHC","Đông Hải Bến Tre","HOSE"),
    ("DHG","Dược Hậu Giang","HOSE"),("DHM","Thương mại và Khai thác Khoáng sản Dương Hiếu","HOSE"),("DIG","DIC Corp","HOSE"),("DLG","Đức Long Gia Lai","HOSE"),
    ("DMC","Dược phẩm Domesco","HOSE"),("DPG","Đạt Phương","HOSE"),("DPM","Phân bón Hóa chất Dầu khí","HOSE"),("DPR","Cao su Đồng Phú","HOSE"),
    ("DQC","Bóng đèn Điện Quang","HOSE"),("DRC","Cao su Đà Nẵng","HOSE"),("DTD","Đầu tư Phát triển Thành Đạt","HOSE"),("DTL","Đại Thiên Lộc","HOSE"),
    ("DTT","Thương mại Thành Tài","HOSE"),("DVP","Cảng Đình Vũ","HOSE"),("DXG","Đất Xanh Group","HOSE"),("DXS","Đất Xanh Services","HOSE"),
    ("EIB","Eximbank","HOSE"),("ELC","Công nghệ Elcom","HOSE"),("EMC","Cơ điện Thủ Đức","HOSE"),("EVE","Everpia","HOSE"),
    ("EVF","Tài chính Điện lực","HOSE"),("EVG","Tập đoàn Everland","HOSE"),("FCM","Khoáng sản Fecon","HOSE"),("FCN","Fecon","HOSE"),
    ("FDC","Ngoại thương Ngoại doanh HCM","HOSE"),("FIR","Địa ốc First Real","HOSE"),("FIT","Tập đoàn F.I.T","HOSE"),("FLC","Tập đoàn FLC","HOSE"),
    ("FMC","Thực phẩm Sao Ta","HOSE"),("FPT","Tập đoàn FPT","HOSE"),("FRT","FPT Retail","HOSE"),("FTS","FPT Securities","HOSE"),
    ("GAS","PV Gas","HOSE"),("GDT","Gỗ Đức Thành","HOSE"),("GEG","Điện Gia Lai","HOSE"),("GEX","Tập đoàn GELEX","HOSE"),
    ("GIL","Sản xuất Kinh doanh Xuất nhập khẩu Bình Thạnh","HOSE"),("GMC","Garmex Sài Gòn","HOSE"),("GMD","Gemasubt","HOSE"),("GMH","Minh Hưng Quảng Trị","HOSE"),
    ("GSP","Vận tải Dầu khí Quảng Ngãi","HOSE"),("GTA","Gỗ Thuận An","HOSE"),("GVR","Tập đoàn Công nghiệp Cao su Việt Nam","HOSE"),("HAG","Hoàng Anh Gia Lai","HOSE"),
    ("HAH","Vận tải và Xếp dỡ Hải An","HOSE"),("HAM","Vật tư và Xây dựng Giao thông","HOSE"),("HAN","Xây dựng Hà Nội","HOSE"),("HAP","Tập đoàn Hapaco","HOSE"),
    ("HAR","Bất động sản An Dương Thảo Điền","HOSE"),("HAS","Haseco","HOSE"),("HAX","Ô tô Hàng Xanh","HOSE"),("HBC","Xây dựng Hòa Bình","HOSE"),
    ("HCD","Đầu tư Sản xuất và Thương mại HCD","HOSE"),("HCM","HSC Securities","HOSE"),("HDB","HDBank","HOSE"),("HDC","Phát triển Nhà Bà Rịa - Vũng Tàu","HOSE"),
    ("HDG","Tập đoàn Hà Đô","HOSE"),("HHP","Giấy Hải Phòng","HOSE"),("HHS","Hoàng Huy Đầu tư Dịch vụ","HOSE"),("HHV","Đầu tư Hạ tầng Giao thông Đèo Cả","HOSE"),
    ("HID","Halcom Việt Nam","HOSE"),("HII","An Tiến Industries","HOSE"),("HMC","Kim khí TP.HCM","HOSE"),("HNG","HAGL Agrico","HOSE"),
    ("HOT","Du lịch Dịch vụ Hội An","HOSE"),("HPG","Tập đoàn Hòa Phát","HOSE"),("HPX","Hải Phát Investment","HOSE"),("HQC","Địa ốc Hoàng Quân","HOSE"),
    ("HRC","Cao su Hòa Bình","HOSE"),("HSG","Tập đoàn Hoa Sen","HOSE"),("HSL","Đầu tư Phát triển Thực phẩm Sao Vàng","HOSE"),("HT1","Xi măng Hà Tiên 1","HOSE"),
    ("HT9","Xây lắp Thành An 96","HOSE"),("HTG","May Hòa Thọ","HOSE"),("HTI","Đầu tư Phát triển Hạ tầng IDICO","HOSE"),("HTL","Kỹ thuật và Ô tô Trường Long","HOSE"),
    ("HTN","Hưng Thịnh Incons","HOSE"),("HTV","Vận tải Hà Tiên","HOSE"),("HU1","HUD1","HOSE"),("HU3","HUD3","HOSE"),
    ("HU4","HUD4","HOSE"),("HUB","Xây lắp Thừa Thiên Huế","HOSE"),("HUT","Tập đoàn Tasco","HOSE"),("HVH","Đầu tư và Công nghệ HVC","HOSE"),
    ("HVN","Vietnam Airlines","HOSE"),("IBC","Apax Holdings","HOSE"),("IDI","Đầu tư và Phát triển Đa Quốc Gia","HOSE"),("IDJ","Đầu tư Chợ Lớn","HOSE"),
    ("IJC","Phát triển Hạ tầng Becamex IJC","HOSE"),("ILB","Cảng ICD Tân Cảng Long Bình","HOSE"),("IMP","Dược phẩm Imexpharm","HOSE"),("ITA","Tân Tạo","HOSE"),
    ("ITC","Đầu tư và Kinh doanh Nhà","HOSE"),("ITD","Công nghệ Tiên Phong","HOSE"),("KBC","Đô thị Kinh Bắc","HOSE"),("KDC","Tập đoàn KIDO","HOSE"),
    ("KDH","Nhà Khang Điền","HOSE"),("KHG","Kải Hoàn Land","HOSE"),("KHP","Điện lực Khánh Hòa","HOSE"),("KMR","Mirae","HOSE"),
    ("KOS","KOSY","HOSE"),("KPF","Đầu tư Tài chính KPF","HOSE"),("KSB","Khoáng sản và Xây dựng Bình Dương","HOSE"),("L10","LILAMA 10","HOSE"),
    ("L14","Licogi 14","HOSE"),("L18","Licogi 18","HOSE"),("LPB","LienVietPostBank","HOSE"),("LSS","Lam Sơn Sugar","HOSE"),
    ("MBB","MB Bank","HOSE"),("MSN","Masan Group","HOSE"),("MWG","Mobile World","HOSE"),("NAF","Nafoods","HOSE"),
    ("NKG","Nam Kim Steel","HOSE"),("NLG","Nam Long","HOSE"),("NVL","Novaland","HOSE"),("OCB","OCB","HOSE"),
    ("OGC","Ocean Group","HOSE"),("PAN","PAN Group","HOSE"),("PDR","Phát Đạt","HOSE"),("PHR","Phước Hòa Rubber","HOSE"),
    ("PLX","Petrolimex","HOSE"),("PNJ","PNJ","HOSE"),("POW","PV Power","HOSE"),("PPC","Phả Lại Power","HOSE"),
    ("PTB","Phú Tài","HOSE"),("PVD","PV Drilling","HOSE"),("PVT","PVTrans","HOSE"),("QNS","Quảng Ngãi Sugar","HOSE"),
    ("REE","REE Corp","HOSE"),("SAB","Sabeco","HOSE"),("SBT","SBT Sugar","HOSE"),("SCS","SCS Airport","HOSE"),
    ("SGN","Sài Gòn Ground","HOSE"),("SHB","SHBank","HOSE"),("SJS","Sudico","HOSE"),("SMC","SMC Steel","HOSE"),
    ("SSB","SeABank","HOSE"),("SSI","SSI","HOSE"),("STB","Sacombank","HOSE"),("STG","Steraplast","HOSE"),
    ("TAC","Tường An Oil","HOSE"),("TCB","Techcombank","HOSE"),("TCH","Toàn Cầu","HOSE"),("THD","Thaiholdings","HOSE"),
    ("TLH","TLH Steel","HOSE"),("TMS","Transimex","HOSE"),("TPB","TPBank","HOSE"),("TVS","Thiên Việt Sec","HOSE"),
    ("UDC","Urban Dev","HOSE"),("VCB","Vietcombank","HOSE"),("VCI","Viet Capital Sec","HOSE"),("VDS","Rồng Việt Sec","HOSE"),
    ("VGC","Viglacera","HOSE"),("VGI","Viettel Global","HOSE"),("VHC","Vĩnh Hoàn","HOSE"),("VHM","Vinhomes","HOSE"),
    ("VIB","VIB","HOSE"),("VIC","Vingroup","HOSE"),("VIX","VIX Sec","HOSE"),("VJC","Vietjet","HOSE"),
    ("VND","VNDirect Sec","HOSE"),("VNM","Vinamilk","HOSE"),("VOS","Vosco","HOSE"),("VPB","VPBank","HOSE"),
    ("VPI","Văn Phú Invest","HOSE"),("VRE","Vincom Retail","HOSE"),("VSC","Container VN","HOSE"),("VSH","Vĩnh Sơn–Sông Hinh","HOSE"),
    ("VTP","Viettel Post","HOSE"),("YEG","Yeah1 Group","HOSE"),
    # HNX
    ("ACE","ACE Life","HNX"),("APS","AP Securities","HNX"),("BBS","Vicem Bút Sơn","HNX"),("BCC","Xi măng Bỉm Sơn","HNX"),
    ("BVS","Bảo Việt Sec","HNX"),("CDN","Cảng Đà Nẵng","HNX"),("CLH","Xi măng La Hiên","HNX"),("DNM","Dệt Nam Định","HNX"),
    ("DPC","Nhựa Đà Nẵng","HNX"),("GDW","Cấp nước Gò Dầu","HNX"),("HAI","Nông dược HAI","HNX"),("HBS","HBS Sec","HNX"),
    ("HHC","Bánh kẹo Hải Hà","HNX"),("HLC","TH Hà Nội","HNX"),("HPT","HPT IT Services","HNX"),("HVT","Hóa chất Việt Trì","HNX"),
    ("IDC","IDICO","HNX"),("KLF","KLF Land","HNX"),("LAS","LASCO","HNX"),("LIG","Licogi 13","HNX"),
    ("MBS","MB Sec","HNX"),("MIC","Bảo hiểm Quân đội","HNX"),("NTP","Nhựa Tiền Phong","HNX"),("NVB","NCB","HNX"),
    ("OCH","Ocean Hospitality","HNX"),("ONE","Truyền thông ONE","HNX"),("PHP","Cảng Hải Phòng","HNX"),("PMC","Dược PMC","HNX"),
    ("PME","Pymepharco","HNX"),("POT","Thiết bị Bưu điện","HNX"),("PVC","PV Coating","HNX"),("PVI","PVI Holdings","HNX"),
    ("PVS","PV Technical","HNX"),("QBS","Sách Giáo dục","HNX"),("QNC","Xi măng Quảng Ninh","HNX"),("S55","S55","HNX"),
    ("SHS","SHS Sec","HNX"),("SLS","Mía đường Sơn La","HNX"),("TBC","Thủy điện Thác Bà","HNX"),("TDN","Thép Đà Nẵng","HNX"),
    ("THB","Bia Thanh Hóa","HNX"),("TMT","Ô tô TMT","HNX"),("TNG","TNG Invest","HNX"),("TVD","Than Vàng Danh","HNX"),
    ("TVN","Thép Việt","HNX"),("VCC","Vicostone","HNX"),("VCG","Vinaconex","HNX"),("VGS","Thép VGS","HNX"),
    ("VMI","Máy thiết bị VN","HNX"),("VNA","Vinalines","HNX"),("VNR","Tái BH VN","HNX"),("VSE","Ứng dụng CN","HNX"),
    ("VTC","VTC Media","HNX"),
    # UPCOM
    ("ACV","ACV","UPCOM"),("BAB","Bắc Á Bank","UPCOM"),("BVB","Bản Việt Bank","UPCOM"),("KLB","Kiên Long Bank","UPCOM"),
    ("MCH","Masan Consumer","UPCOM"),("MML","Masan MEATLife","UPCOM"),("MSR","Masan Resources","UPCOM"),("NAB","Nam Á Bank","UPCOM"),
    ("NSC","Giống cây trồng VN","UPCOM"),("NT2","NT2","UPCOM"),("OIL","PVOIL","UPCOM"),("PGB","Petrolimex Insurance","UPCOM"),
    ("QTP","Quảng Ninh Thermal","UPCOM"),("RAL","Điện Quang","UPCOM"),("SGB","Saigonbank","UPCOM"),("SNZ","Sonadezi","UPCOM"),
    ("SVB","Viet A Bank","UPCOM"),("TLG","Thiên Long","UPCOM"),("TRA","Traphaco","UPCOM"),("TRC","Cao su Tây Ninh","UPCOM"),
    ("TYA","Dệt Thành Công","UPCOM"),("VAB","Việt Á Bank","UPCOM"),("VBB","VBB","UPCOM"),("VEA","VEAM","UPCOM"),
    ("VGT","Vinatex","UPCOM"),("VMD","Vimedimex","UPCOM"),("VNL","Logistics VN","UPCOM"),("VPS","VPS Sec","UPCOM"),
    ("VTB","Vietbank","UPCOM"),("WSS","WSS Sec","UPCOM"),
]

def main():
    os.makedirs("data", exist_ok=True)

    success_count = 0
    manifest = {}

    print("Bắt đầu tải dữ liệu lịch sử 1 năm từ Yahoo Finance...")

    for idx, item in enumerate(STOCKS, 1):
        ticker = item[0]
        name = item[1] if len(item) > 1 else ""
        exchange = item[2] if len(item) > 2 else ""

        yahoo_ticker = f"{ticker}.VN"
        print(f"[{idx}/{len(STOCKS)}] Đang tải {yahoo_ticker}...", end="", flush=True)

        try:
            stock_data = yf.download(yahoo_ticker, period="1y", interval="1d", progress=False)

            if stock_data.empty:
                print(" Thất bại (Không có dữ liệu trên Yahoo)")
                continue

            # Làm phẳng cấu trúc Đa chỉ mục (Multi-Index) từ yfinance mới
            if hasattr(stock_data.columns, 'levels'):
                stock_data.columns = stock_data.columns.get_level_values(0)

            candles = []
            for index, row in stock_data.iterrows():
                date_str = index.strftime('%Y-%m-%d')

                # Trích xuất giá trị float/int an toàn bằng .iloc nếu cột bị lặp cấu trúc Series
                o = float(row['Open'].iloc[0]) if hasattr(row['Open'], 'iloc') else float(row['Open'])
                h = float(row['High'].iloc[0]) if hasattr(row['High'], 'iloc') else float(row['High'])
                l = float(row['Low'].iloc[0]) if hasattr(row['Low'], 'iloc') else float(row['Low'])
                c = float(row['Close'].iloc[0]) if hasattr(row['Close'], 'iloc') else float(row['Close'])
                v = int(row['Volume'].iloc[0]) if hasattr(row['Volume'], 'iloc') else int(row['Volume'])

                if v <= 0 or o <= 0:
                    continue

                candles.append([date_str, o, h, l, c, v])

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
                print(f" OK ({len(candles)} ngày)")
            else:
                print(" Thất bại (Dữ liệu rỗng sau khi lọc)")

        except Exception as e:
            print(f" Thất bại (Lỗi: {e})")

        time.sleep(0.1)

    with open("data/manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\n Hoàn thành: {success_count}/{len(STOCKS)} mã thành công.")

if __name__ == "__main__":
    main()
