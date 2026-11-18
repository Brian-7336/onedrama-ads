# 원드라마 사이트의 공개 목록에서 작품별 주소를 받아 js/landing-data.js 로 만든다.
# 사용: python tools/build_landing.py
# 작품 주소는 https://drama.onestore.co.kr/<작품 ID> 이다 (작품 페이지의 canonical 주소와 같다).
import json, os, re, sys, urllib.parse, urllib.request

SITE = 'https://drama.onestore.co.kr'
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def norm(t):
    """제목 비교용: 공백·문장부호를 빼고 소문자로."""
    return re.sub(r'[\s,.!?:·\-~()\[\]「」\'"]+', '', t).lower()


# 콘텐츠 목록과 사이트에서 제목 표기가 다른 작품 (목록 제목 → 사이트 제목)
ALIAS = {
    '브라이덜샤워': '브라이덜 샤워: 사라진 신부',
    'Love Wave 내 여자친구는 남자': '러브웨이브',
    '러브앤데스': '러브&데스',
    '이혼전쟁 All or Nothing': 'All or Nothing',
    '코드네임 B': '코드네임B : 국밥집요원들',
    '폐교에서 백만 너튜버 되기': '폐교에서 백만 너튜버 되기 : 백수유혼',
}

items, cursor = [], ''
for _ in range(20):
    url = SITE + '/api/v1/catalog/top?limit=50' + ('&cursor=' + urllib.parse.quote(cursor) if cursor else '')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    data = json.load(urllib.request.urlopen(req, timeout=30))['data']
    items += data['items']
    cursor = data.get('nextCursor')
    if not cursor:
        break

site = {}
for x in items:
    site.setdefault(norm(x['title']), []).append(x)

# 콘텐츠 목록(js/works-data.js)의 제목과 맞춘다.
src = open(os.path.join(root, 'js', 'works-data.js'), encoding='utf-8').read()
works = json.loads(src[src.index('['):src.rindex(']') + 1])

out, dup, miss = {}, [], []
for w in works:
    hit = site.get(norm(ALIAS.get(w['title'], w['title'])), [])
    if len(hit) == 1:
        out[w['cp'] + '|' + w['title']] = SITE + '/' + hit[0]['chnlId']
    elif len(hit) > 1:
        dup.append(w['title'])       # 같은 제목이 둘 이상이면 자동으로 정하지 않는다
    else:
        miss.append(w['title'])

with open(os.path.join(root, 'js', 'landing-data.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// tools/build_landing.py 가 만든 파일. 직접 고치지 않는다.\n// 키는 「CP|작품명」, 값은 작품 페이지 주소.\nwindow.LANDING = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')

sys.stdout.reconfigure(encoding='utf-8')
cand = [w for w in works if w.get('cand')]
print('site', len(items), 'works', len(works), 'matched', len(out), 'cand matched', sum(1 for w in cand if w['cp'] + '|' + w['title'] in out), '/', len(cand))
print('dup', dup)
print('miss(cand)', [w['title'] for w in cand if w['title'] in miss])
print('site only', [x['title'] for x in items if norm(x['title']) not in {norm(ALIAS.get(w['title'], w['title'])) for w in works}])
