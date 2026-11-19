# 원드라마 사이트의 작품 포스터를 posters/<작품 코드>.jpg 로 받아 둔다.
# 영상 만들기의 끝 화면에 쓴다. 포스터는 CP 자료라 깃에는 올리지 않는다 (.gitignore).
# 쓰는 법: python tools/fetch_posters.py
import json, os, re, urllib.parse, urllib.request

SITE = 'https://drama.onestore.co.kr'
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'posters')
os.makedirs(out, exist_ok=True)

src = open(os.path.join(root, 'js', 'landing-data.js'), encoding='utf-8').read()
m = re.search(r'window\.WORKID = (\{.*?\});', src, re.S)
want = set(json.loads(m.group(1)).values())          # 광고 후보 작품의 코드 (작품 ID 소문자)

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30)

items, cursor = [], ''
for _ in range(20):
    data = json.load(get(SITE + '/api/v1/catalog/top?limit=50' + ('&cursor=' + urllib.parse.quote(cursor) if cursor else '')))['data']
    items += data['items']
    cursor = data.get('nextCursor')
    if not cursor:
        break

new = kept = miss = 0
for x in items:
    code = x['chnlId'].lower()
    if code not in want:
        continue
    path = os.path.join(out, code + '.jpg')
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        kept += 1
        continue
    url = x.get('posterImage') or ''
    if not url.startswith(SITE + '/'):
        miss += 1
        continue
    try:
        data = get(url).read()
        if data[:2] != b'\xff\xd8':                  # JPEG만 받는다
            miss += 1
            continue
        with open(path, 'wb') as f:
            f.write(data)
        new += 1
    except Exception as e:
        print('fail', code, e)
        miss += 1
print('new', new, 'kept', kept, 'missing', miss, 'of', len(want))
