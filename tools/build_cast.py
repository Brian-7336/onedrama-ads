# 출연 배우·팬 채널 조사 결과(JSON)를 엑셀과 js/cast-data.js 로 만든다.
# 사용: python tools/build_cast.py <조사 결과 폴더>
import json, sys, os, glob
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
rows = [works[t] for t in order]


def fan(c):
    return ' / '.join(v for v in [c.get('fanclub'), c.get('fancafe'), c.get('other_fan_channels')] if v)


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
sheet(ws, ['CP', '작품', '배우 확인', '작품 확신도', '출연 배우', '팬덤 있는 출연자 (그룹)', '비고', '근거'],
      [[x['cp'], x['title'], 'O' if ok(x) else '', CONF.get(x.get('work_confidence'), '') if ok(x) else '',
        ', '.join(c['name'] for c in x.get('cast', [])),
        ', '.join(c['name'] + ' (' + c['group'] + ')' for c in x.get('cast', []) if c.get('group')),
        x.get('note', ''), '\n'.join(x.get('work_sources', [])[:3])] for x in rows],
      [14, 30, 9, 11, 40, 40, 60, 50])

ws = wb.create_sheet('배우별 상세')
sheet(ws, ['CP', '작품', '배우', '구분', '배역', '그룹', '소속사', '인스타그램', 'X', '유튜브', '틱톡',
           '팬클럽', '팬카페', '그 밖의 팬 채널', '팔로워 메모', '확신도', '근거'],
      [[x['cp'], x['title'], c.get('name', ''), c.get('role', ''), c.get('character', ''), c.get('group', ''), c.get('agency', ''),
        c.get('instagram', ''), c.get('x', ''), c.get('youtube', ''), c.get('tiktok', ''),
        c.get('fanclub', ''), c.get('fancafe', ''), c.get('other_fan_channels', ''), c.get('followers_note', ''),
        CONF.get(c.get('confidence'), ''), '\n'.join(c.get('sources', [])[:3])]
       for x in rows for c in x.get('cast', [])],
      [14, 28, 16, 7, 14, 24, 22, 36, 30, 36, 30, 18, 36, 36, 26, 8, 50])

ws = wb.create_sheet('팬 채널 있는 출연자')
sheet(ws, ['CP', '작품', '배우', '그룹', '팬클럽', '팬카페', '그 밖의 팬 채널', '인스타그램', 'X', '확신도'],
      [[x['cp'], x['title'], c.get('name', ''), c.get('group', ''), c.get('fanclub', ''), c.get('fancafe', ''),
        c.get('other_fan_channels', ''), c.get('instagram', ''), c.get('x', ''), CONF.get(c.get('confidence'), '')]
       for x in rows for c in x.get('cast', []) if c.get('group') or fan(c)],
      [14, 28, 16, 28, 18, 36, 40, 36, 30, 8])

ws = wb.create_sheet('미확인 작품')
sheet(ws, ['CP', '작품', '비고'], [[x['cp'], x['title'], x.get('note', '')] for x in rows if not ok(x)], [14, 34, 100])

ws = wb.create_sheet('읽어보기')
for line in [
    '광고 후보 129편의 출연 배우와 팬 채널을 웹에서 조사한 결과입니다. 사람이 하나씩 검증한 자료가 아닙니다.',
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
keys = ['name', 'role', 'group', 'agency', 'instagram', 'x', 'youtube', 'tiktok', 'fanclub', 'fancafe', 'confidence']
data = {x['title']: {'conf': x.get('work_confidence', ''), 'note': x.get('note', ''),
                     'cast': [{k: c.get(k, '') for k in keys if c.get(k)} for c in x.get('cast', [])]}
        for x in rows if ok(x)}
with open(os.path.join(root, 'js', 'cast-data.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// tools/build_cast.py 가 만든 파일. 직접 고치지 않는다.\nwindow.CAST = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')

cast = [c for x in rows for c in x.get('cast', [])]
print('작품', len(rows), '배우 확인', sum(ok(x) for x in rows), '배우', len(cast),
      '인스타', sum(1 for c in cast if c.get('instagram')), '팬채널', sum(1 for c in cast if fan(c)), '그룹', sum(1 for c in cast if c.get('group')))
