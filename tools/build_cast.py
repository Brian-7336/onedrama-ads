# 출연 배우·팬 채널 자료를 엑셀과 js/cast-data.js 로 만든다.
# 기준은 CP 납품 메타(<폴더>/meta.json, tools/read_meta.py 가 만든다)이고, 메타에 없는 것만 웹 조사 결과로 채운다.
# 사용: python tools/build_cast.py <조사 결과 폴더>
import json, sys, os, glob, re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

src = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF = {'high': '높음', 'medium': '보통', 'low': '낮음'}


def load(pattern):
    out = []
    for p in sorted(glob.glob(os.path.join(src, pattern))):
        try:
            out += json.load(open(p, encoding='utf-8'))
        except Exception as e:
            print('읽기 실패', p, e)
    return out


def ok(x):
    return bool(x.get('found') and x.get('cast'))


works = {}
order = []
for x in load('result_*.json'):
    works[x['title']] = x
    order.append(x['title'])
for x in load('r2_result_*.json'):       # 2차 조사는 찾은 경우에만 덮어쓴다
    if x.get('title') in works and (ok(x) or not ok(works[x['title']])):
        works[x['title']] = x

# ---------- CP 납품 메타를 기준으로 덮어쓴다 ----------
def norm(t):
    return re.sub(r'[^0-9a-z가-힣]+', '', str(t).lower())


META_ALIAS = {'브라이덜샤워': '브라이덜샤워사라진신부', 'Love Wave 내 여자친구는 남자': 'lovewave내여자친구는남자', '코드네임 B': '코드네임b',
              '이혼전쟁 All or Nothing': '이혼전쟁allornothing', '전직 특수부대 요원, 괴물 순경이 되다': '전직특수부대요원괴물순경이되다'}
KIND = [('특별', '특별출연'), ('주연', '주연'), ('조연', '조연')]


def insta_urls(text):
    """메타의 「배우 SNS」 칸에서 인스타그램 주소를 뽑는다. '@아이디', 'insta : 아이디', 전체 주소를 모두 받는다."""
    out = []
    for u in re.findall(r'https?://\S+', text):
        out.append(u.rstrip('.,)'))
    rest = re.sub(r'https?://\S+', ' ', text)
    for h in re.findall(r'(?:@|insta(?:gram)?\s*[:：]\s*|인스타(?:그램)?\s*[:：]\s*)([A-Za-z0-9._]{2,30})', rest, flags=re.I):
        out.append('https://www.instagram.com/' + h.strip('.'))
    seen, uniq = set(), []
    for u in out:
        k = u.lower().rstrip('/')
        if k not in seen:
            seen.add(k)
            uniq.append(u)
    return uniq


meta = {}
meta_path = os.path.join(src, 'meta.json')
if os.path.exists(meta_path):
    for m in json.load(open(meta_path, encoding='utf-8')):
        if 'error' in m:
            continue
        for key in {norm(m.get('file_title', '')), norm(m.get('title', '').split('\n')[-1])}:
            if key:
                meta.setdefault((m['cp'], key), m)
                meta.setdefault(('*', key), m)


def meta_of(x):
    key = META_ALIAS.get(x['title'], norm(x['title']))
    hit = meta.get((x['cp'], key)) or meta.get(('*', key))
    if hit:
        return hit
    cands = [m for (cp, k), m in meta.items() if cp == x['cp'] and (k.startswith(key) or key.startswith(k)) and min(len(k), len(key)) >= 4]
    return cands[0] if cands else None


n_meta = n_meta_cast = 0
for t in order:
    x = works[t]
    m = meta_of(x)
    x['meta'] = m or {}
    if not m:
        continue
    n_meta += 1
    if not m.get('cast'):
        continue
    n_meta_cast += 1
    web = {norm(re.sub(r'\(.*?\)', '', c.get('name', ''))): c for c in x.get('cast', [])}
    cast, prev_portrait = [], ''
    for a in m['cast']:
        name = re.sub(r'\s*\n\s*', ' ', a['name']).strip()
        w = web.pop(norm(re.sub(r'\(.*?\)', '', name)), {})
        portrait = a.get('portrait', '').replace('\n', ' ').strip()
        if portrait.replace(' ', '') in ('상동', '"', '〃'):
            portrait = prev_portrait
        prev_portrait = portrait or prev_portrait
        urls = insta_urls(a.get('sns', ''))
        c = dict(w)                                   # 웹 조사에서 찾은 그룹·팬클럽·팬카페 등은 그대로 살린다
        c.update({'name': name, 'character': a.get('character', '') or w.get('character', ''),
                  'role': next((v for k, v in KIND if k in a.get('kind', '')), '출연'),
                  'confidence': 'high', 'source': 'CP 메타', 'portrait': portrait, 'sns_raw': a.get('sns', '').replace('\n', ' ')})
        if urls:
            c['instagram'] = ' '.join(urls)           # 메타의 계정을 우선한다
        c['sources'] = ['CP 납품 메타: ' + m['file']] + [u for u in w.get('sources', [])][:2]
        cast.append(c)
    extra = len(web)                                  # 웹 조사에만 있던 사람은 뺀다 (메타가 기준)
    # 웹 조사 출연진이 메타와 한 명도 안 겹치면 웹 조사가 다른 작품을 본 것이다. 그 작품의 웹 출시일도 믿지 않는다.
    x['web_mismatch'] = bool(x.get('cast')) and extra == len(x.get('cast', []))
    x['cast'] = cast
    x['found'] = True
    x['work_confidence'] = 'high'
    x['work_sources'] = ['CP 납품 메타: ' + m['file']]
    x['note'] = 'CP 메타 기준.' + (' 웹 조사에만 있던 ' + str(extra) + '명은 뺌.' if extra else '')
for t in order:
    for c in works[t].get('cast', []):
        c.setdefault('source', '웹 조사')
print('meta matched', n_meta, 'with cast', n_meta_cast, 'no meta', [t for t in order if not works[t]['meta']])

rows = [works[t] for t in order]

# 출시일 조사 결과 (작품명 → 날짜)
dates = {x['title']: x for x in load('date_result_*.json') if x.get('release_date')}


for t in order:
    if works[t].get('web_mismatch') and t in dates:
        print('웹 출시일 버림 (다른 작품을 조사함):', t, dates[t]['release_date'])
        del dates[t]
    r = str((works[t]['meta'] or {}).get('release', '')).strip()
    if re.fullmatch(r'\d{5}', r):                      # 엑셀 날짜 일련번호
        import datetime
        r = (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(r))).isoformat()
    if re.fullmatch(r'\d{4}(-\d{2}){1,2}', r):
        web_date = dates.get(t) or {}
        dates[t] = {'title': t, 'release_date': r, 'kind': '최초 공개일', 'platform': web_date.get('platform', ''), 'confidence': 'high',
                    'source': 'CP 납품 메타: ' + works[t]['meta']['file'],
                    'note': ('웹 조사 값은 ' + web_date['release_date'] if web_date.get('release_date') and web_date['release_date'] != r else '')}


def rel(t, k):
    return (dates.get(t) or {}).get(k, '')


def fan(c):
    return ' / '.join(v for v in [c.get('fanclub'), c.get('fancafe'), c.get('other_fan_channels')] if v)


URL_RE = re.compile(r'(?:https?://)?(?:[\w-]+\.)+(?:com|net|kr|io|me|tv|jp|org)(?:/[^\s,()\[\]<>"\']*)?')
LABELS = [('instagram.com', '인스타'), ('threads.net', '스레드'), ('x.com', 'X'), ('twitter.com', 'X'), ('youtube.com', '유튜브'), ('youtu.be', '유튜브'),
          ('tiktok.com', '틱톡'), ('cafe.daum.net', '다음 팬카페'), ('cafe.naver.com', '네이버 팬카페'), ('weverse.io', '위버스'),
          ('frommyarti.com', '프롬'), ('fanicon.net', '패니콘'), ('facebook.com', '페이스북'), ('weibo.com', '웨이보'),
          ('xiaohongshu.com', '샤오훙수'), ('chzzk.naver.com', '치지직'), ('blog.naver.com', '블로그'), ('brunch.co.kr', '브런치')]
FIELD_DEFAULT = {'fancafe': '팬카페', 'other_fan_channels': '공식 사이트'}


def links(c):
    """배우 한 명의 공개 채널을 [이름, 주소] 목록으로. 같은 주소는 한 번만."""
    out, seen = [], set()
    for field in ['instagram', 'x', 'youtube', 'tiktok', 'fancafe', 'other_fan_channels']:
        for u in URL_RE.findall(c.get(field) or ''):
            u = u.rstrip('.,;:')
            if '/' not in re.sub(r'^https?://', '', u).rstrip('/') and field != 'other_fan_channels':
                continue                      # 계정 없이 사이트 이름만 적힌 경우는 뺀다
            if not u.startswith('http'):
                u = 'https://' + u
            key = re.sub(r'^https?://(www\.|m\.)?', '', u).rstrip('/').lower()
            if key in seen:
                continue
            seen.add(key)
            label = next((name for dom, name in LABELS if dom in key), FIELD_DEFAULT.get(field, '링크'))
            out.append([label, u])
    return out


wb = Workbook()
head_font = Font(bold=True, color='FFFFFF')
head_fill = PatternFill('solid', fgColor='2F5597')


def sheet(ws, header, data, widths):
    ws.append(header)
    for r in data:
        ws.append(r)
    for c in ws[1]:
        c.font, c.fill = head_font, head_fill
        c.alignment = Alignment(vertical='center', wrap_text=True)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(vertical='top', wrap_text=True)
            if isinstance(c.value, str) and c.value.startswith('http') and ' ' not in c.value:
                c.hyperlink = c.value
                c.font = Font(color='0563C1', underline='single')
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions


ws = wb.active
ws.title = '작품별 요약'
sheet(ws, ['CP', '작품', '출시일', '출시일 구분', '공개 플랫폼', '출시일 확신도', '배우 확인', '작품 확신도', '출연 배우', '팬덤 있는 출연자 (그룹)', '비고', '근거'],
      [[x['cp'], x['title'], rel(x['title'], 'release_date'), rel(x['title'], 'kind'), rel(x['title'], 'platform'), CONF.get(rel(x['title'], 'confidence'), ''), 'O' if ok(x) else '', CONF.get(x.get('work_confidence'), '') if ok(x) else '',
        ', '.join(c['name'] for c in x.get('cast', [])),
        ', '.join(c['name'] + ' (' + c['group'] + ')' for c in x.get('cast', []) if c.get('group')),
        x.get('note', ''), '\n'.join(x.get('work_sources', [])[:3])] for x in rows],
      [14, 30, 12, 16, 22, 10, 9, 11, 40, 40, 60, 50])

ws = wb.create_sheet('배우별 상세')
sheet(ws, ['CP', '작품', '배우', '구분', '배역', '출처', '초상권 계약 정보 (CP 메타)', '그룹', '소속사', '인스타그램', 'X', '유튜브', '틱톡',
           '팬클럽', '팬카페', '그 밖의 팬 채널', '팔로워 메모', '확신도', '근거'],
      [[x['cp'], x['title'], c.get('name', ''), c.get('role', ''), c.get('character', ''), c.get('source', ''), c.get('portrait', ''), c.get('group', ''), c.get('agency', ''),
        c.get('instagram', ''), c.get('x', ''), c.get('youtube', ''), c.get('tiktok', ''),
        c.get('fanclub', ''), c.get('fancafe', ''), c.get('other_fan_channels', ''), c.get('followers_note', ''),
        CONF.get(c.get('confidence'), ''), '\n'.join(c.get('sources', [])[:3])]
       for x in rows for c in x.get('cast', [])],
      [14, 28, 16, 9, 14, 10, 40, 24, 22, 36, 30, 36, 30, 18, 36, 36, 26, 8, 50])

ws = wb.create_sheet('팬 채널 있는 출연자')
sheet(ws, ['CP', '작품', '배우', '그룹', '팬클럽', '팬카페', '그 밖의 팬 채널', '인스타그램', 'X', '확신도'],
      [[x['cp'], x['title'], c.get('name', ''), c.get('group', ''), c.get('fanclub', ''), c.get('fancafe', ''),
        c.get('other_fan_channels', ''), c.get('instagram', ''), c.get('x', ''), CONF.get(c.get('confidence'), '')]
       for x in rows for c in x.get('cast', []) if c.get('group') or fan(c)],
      [14, 28, 16, 28, 18, 36, 40, 36, 30, 8])

ws = wb.create_sheet('작품 메타 (CP 납품)')
sheet(ws, ['CP', '작품', '메타 파일', '제작사', '연출', '각본', '장르', '회차', '최초공개일', '서브타이틀', '로그라인', '마케팅 포인트', '플랫폼 / 누적 조회수'],
      [[x['cp'], x['title'], x['meta'].get('file', ''), x['meta'].get('producer', ''), x['meta'].get('director', ''), x['meta'].get('writer', ''),
        x['meta'].get('genre', ''), x['meta'].get('episodes', ''), x['meta'].get('release', ''), x['meta'].get('subtitle', ''),
        x['meta'].get('logline', ''), x['meta'].get('marketing', ''), x['meta'].get('platform_views', '')] for x in rows],
      [14, 30, 34, 22, 14, 14, 20, 14, 12, 24, 60, 70, 24])

ws = wb.create_sheet('출시일')
sheet(ws, ['CP', '작품', '출시일', '구분', '공개 플랫폼', '확신도', '비고', '근거'],
      sorted([[x['cp'], x['title'], rel(x['title'], 'release_date'), rel(x['title'], 'kind'), rel(x['title'], 'platform'),
               CONF.get(rel(x['title'], 'confidence'), ''), rel(x['title'], 'note'), rel(x['title'], 'source')] for x in rows],
             key=lambda r: r[2], reverse=True),
      [14, 30, 12, 16, 24, 8, 70, 50])

ws = wb.create_sheet('미확인 작품')
sheet(ws, ['CP', '작품', '비고'], [[x['cp'], x['title'], x.get('note', '')] for x in rows if not ok(x)], [14, 34, 100])

ws = wb.create_sheet('읽어보기')
for line in [
    '광고 후보 129편의 출연 배우와 팬 채널입니다. 기준은 CP가 납품한 메타 파일(나스 「00. 타이틀별 메타_all」)이고, 메타에 없는 항목(그룹, 팬클럽, 팬카페, 메타에 출연진이 없는 작품)만 웹 조사로 채웠습니다.',
    '「출처」 열: CP 메타 = 납품 메타 파일에 적힌 배우, 웹 조사 = 웹에서 찾은 배우(검증 안 됨). 초상권 계약 정보는 메타에 적힌 문구 그대로입니다.',
    '출시일: 작품이 처음 공개된 날입니다(원드라마 등록일이 아님). 세로본능 작품은 원작 영화·드라마의 개봉·방영일입니다. 연도나 월까지만 확인된 것은 그만큼만 적었습니다.',
    '확신도: 높음 = 기사·공식 자료로 확인, 보통 = 이용자 편집 DB(TMDB, 나무위키) 한 곳에만 근거, 낮음 = 동명 작품·동명이인 가능성 있음.',
    '세로본능 작품은 기존 영화·드라마를 세로형으로 재편집한 것이라 원작 출연진을 적었습니다. 원작이 맞는지 앱에서 확인이 필요합니다.',
    'SNS 주소는 계정에 직접 들어가 본인 계정인지 확인하지 않았습니다. 광고나 협업에 쓰기 전에 확인하세요.',
    '빈칸은 「없음」이 아니라 「확인하지 못함」입니다.',
    '개인 연락처 등 비공개 정보는 담지 않았습니다. 공개된 공식 채널만 담았습니다.',
]:
    ws.append([line])
ws.column_dimensions['A'].width = 130

out = os.path.join(root, '원드라마_출연배우_팬채널.xlsx')
wb.save(out)

# 사이트용: 작품명 → 배우 목록 (공개 채널만)
keys = ['name', 'role', 'character', 'group', 'agency', 'fanclub', 'confidence', 'source']
data = {x['title']: {'conf': x.get('work_confidence', ''), 'note': x.get('note', ''),
                     'cast': [dict({k: c.get(k, '') for k in keys if c.get(k)}, links=links(c)) for c in x.get('cast', [])]}
        for x in rows if ok(x)}
with open(os.path.join(root, 'js', 'cast-data.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// tools/build_cast.py 가 만든 파일. 직접 고치지 않는다.\nwindow.CAST = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    rdata = {t: {'d': v['release_date'], 'k': v.get('kind', ''), 'p': v.get('platform', ''), 'c': v.get('confidence', '')} for t, v in dates.items() if t in works}
    f.write('window.RELEASE = ' + json.dumps(rdata, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('date', sum(1 for t in order if t in dates), 'from meta', sum(1 for t in order if (dates.get(t) or {}).get('source', '').startswith('CP')))
# 초상권 계약 정보와 마케팅 포인트는 CP가 준 사내 자료다. 레포에 올리지 않는 파일(js/private-data.js)에 따로 둔다.
priv = {}
for x in rows:
    m = x['meta']
    pr = [[c['name'], c['portrait']] for c in x.get('cast', []) if c.get('portrait')]
    if pr or m.get('marketing') or m.get('logline'):
        priv[x['title']] = {'portrait': pr, 'marketing': m.get('marketing', ''), 'logline': m.get('logline', ''), 'producer': m.get('producer', '')}
with open(os.path.join(root, 'js', 'private-data.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// tools/build_cast.py 가 만든 파일. CP 납품 메타의 사내 자료라 레포에 올리지 않는다 (.gitignore).\nwindow.PRIVATE = ' + json.dumps(priv, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('private', len(priv))
print('links', sum(len(links(c)) for x in rows for c in x.get('cast', [])), 'cast with links', sum(1 for x in rows for c in x.get('cast', []) if links(c)))

cast = [c for x in rows for c in x.get('cast', [])]
print('작품', len(rows), '배우 확인', sum(ok(x) for x in rows), '배우', len(cast),
      '인스타', sum(1 for c in cast if c.get('instagram')), '팬채널', sum(1 for c in cast if fan(c)), '그룹', sum(1 for c in cast if c.get('group')))
