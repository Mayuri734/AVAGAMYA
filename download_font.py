import os
import urllib.request
import base64

os.makedirs("src/assets", exist_ok=True)
url = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = response.read()
    b64 = base64.b64encode(data).decode('utf-8')
    with open("src/assets/NotoSansDevanagari.ts", "w", encoding="utf-8") as f:
        f.write(f'export const notoSansDevanagariBase64 = "{b64}";\n')
    print("Success")
except Exception as e:
    print(f"Failed: {e}")
