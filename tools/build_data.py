# 원드라마_콘텐츠_목록.xlsx → js/works-data.js (광고 후보 작품 목록)
# NAS 경로와 판권 기간은 사이트에 넣지 않는다.
import json, sys, io, openpyxl
src = sys.argv[1] if len(sys.argv) > 1 else '원드라마_콘텐츠_목록.xlsx'
ws = openpyxl.load_workbook(src, data_only=True)['콘텐츠 목록']
rows = []
for r in ws.iter_rows(min_row=2, values_only=True):
    if not any(r):
        continue
    cp, title, genre, rating, eps, free, trailer, status, cand = r[:9]
    rows.append({
        'cp': cp, 'title': title, 'genre': genre, 'rating': rating,
        'eps': eps, 'free': free, 'trailer': bool(trailer),
        'status': status, 'cand': bool(cand),
    })
with io.open('js/works-data.js', 'w', encoding='utf-8', newline='\n') as f:
    f.write('// tools/build_data.py 가 만든 파일. 직접 고치지 말 것.\n')
    f.write('window.WORKS_DATA = ' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(rows), 'works,', sum(r['cand'] for r in rows), 'candidates')
