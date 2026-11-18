# 나스의 CP 납품 메타 파일(「00. 타이틀별 메타_all」의 *_META.xlsx)에서 작품 정보와 출연진을 읽어 JSON으로 만든다.
# 나스 파일은 읽기만 한다. 사용: python tools/read_meta.py <결과 JSON 경로> <숏드라마 공유폴더 경로>
# 결과에는 초상권 계약 정보처럼 사내 자료가 들어 있으므로 레포에 올리지 않는다.
import glob, json, os, re, sys
import openpyxl

ROOT = sys.argv[2]      # 공유폴더 주소는 사내 정보라 코드에 적지 않는다
out_path = sys.argv[1]


def clean(v):
    return re.sub(r'[ \t\r]+', ' ', str(v)).strip() if v is not None else ''


def date_of(v):
    """'24. 10. 04', '2025-03-01', datetime → 'YYYY-MM-DD' (못 읽으면 원문)."""
    if hasattr(v, 'strftime'):
        return v.strftime('%Y-%m-%d')
    s = clean(v)
    m = re.match(r'^(\d{2,4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})', s)
    if m:
        y = int(m.group(1))
        return '%04d-%02d-%02d' % (y + 2000 if y < 100 else y, int(m.group(2)), int(m.group(3)))
    m = re.match(r'^(\d{2,4})\s*[.\-/년]\s*(\d{1,2})\s*월?$', s)
    if m:
        y = int(m.group(1))
        return '%04d-%02d' % (y + 2000 if y < 100 else y, int(m.group(2)))
    return '' if s in ('-', '') else s


LABELS = {'제작사': 'producer', '장르': 'genre', '연출': 'director', '각본': 'writer', '작품명': 'title', '회차 수': 'episodes', '회차 수 / 총 RT': 'episodes',
          '최초 공개 플랫폼 / 누적 조회수': 'platform_views',
          '최초공개일': 'release', '서브타이틀': 'subtitle', '로그라인': 'logline', '마케팅 포인트': 'marketing',
          '영등위 관람등급': 'rating', '타이틀(영문)': 'title_en', '플랫폼 / 누적 조회수': 'platform_views'}


def read(path):
    with open(path, 'rb') as fh:
        if fh.read(4) != b'PK\x03\x04':
            return {'error': '암호화되었거나 xlsx가 아님'}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    # 납품 규격 안내 시트가 앞에 붙은 파일이 있다. 「타이틀 기본정보」로 시작하는 시트를 찾는다.
    rows = []
    for ws in wb.worksheets:
        cand = []
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            cand.append([c for c in row[:30]])
            if i > 60:
                break
        if any(clean(c) == '타이틀 기본정보' for r in cand[:6] for c in r if c is not None):
            rows = cand
            break
    wb.close()
    info, cast, section = {}, [], ''
    cols = {}
    for r in rows:
        cells = [(j, c) for j, c in enumerate(r) if c is not None and clean(c)]
        if not cells:
            continue
        first = clean(cells[0][1])
        if first in ('타이틀 기본정보', '출연진 정보', '시놉시스', '화별 트리트먼트'):
            section = first
            continue
        if section == '타이틀 기본정보':
            # 한 줄에 「이름, 값, 이름, 값」이 섞여 있다. 이름 칸 바로 다음에 나오는 칸을 값으로 본다.
            k = 0
            while k < len(cells):
                label = clean(cells[k][1]).rstrip(' ')
                if label in LABELS:
                    val = cells[k + 1][1] if k + 1 < len(cells) and clean(cells[k + 1][1]) not in LABELS else None
                    key = LABELS[label]
                    if val is not None and key not in info:
                        info[key] = date_of(val) if key == 'release' else clean(val)
                    k += 2 if val is not None else 1
                else:
                    if not info.get('logline') and len(label) > 40 and len(cells) == 1:
                        info['logline'] = label       # 이름 없이 줄 전체에 적힌 로그라인
                    k += 1
        elif section == '출연진 정보':
            if first == '구분':
                cols = {clean(c): j for j, c in cells}
                continue
            if not cols:
                continue
            get = lambda name: next((clean(r[j]) for n, j in cols.items() if n.startswith(name) and j < len(r) and r[j] is not None), '')
            name = get('배우명')
            if name and name != '-':
                cast.append({'kind': first, 'character': get('역할명'), 'name': name, 'sns': get('배우 SNS'), 'portrait': get('초상권')})
        elif section == '시놉시스' and 'synopsis' not in info:
            info['synopsis'] = clean(cells[0][1])[:600]
    info['cast'] = cast
    return info


files = sorted(f for f in glob.glob(os.path.join(ROOT, '*', '00. 타이틀별 메타_all', '*.xlsx')) if not os.path.basename(f).startswith('~$'))
out = []
for f in files:
    cp = os.path.basename(os.path.dirname(os.path.dirname(f)))
    base = os.path.basename(f)
    try:
        d = read(f)
    except Exception as e:
        d = {'error': str(e)[:120]}
    d.update({'cp': cp, 'file': base, 'file_title': re.sub(r'_META\.xlsx$', '', base, flags=re.I).split('_', 1)[-1]})
    out.append(d)

json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.stdout.reconfigure(encoding='utf-8')
ok = [d for d in out if 'error' not in d]
print('files', len(out), 'read', len(ok), 'errors', [(d['file'], d['error']) for d in out if 'error' in d][:8])
print('with cast', sum(1 for d in ok if d['cast']), 'actors', sum(len(d['cast']) for d in ok),
      'sns', sum(1 for d in ok for c in d['cast'] if c['sns']), 'portrait', sum(1 for d in ok for c in d['cast'] if c['portrait']),
      'release', sum(1 for d in ok if d.get('release')), 'marketing', sum(1 for d in ok if d.get('marketing')))
