// 작품별 광고 계획: 고른 작품의 특성(팬덤, 신작, CP 추천, 장르 등)에 맞춰
// 광고 방법을 추천하고, 작품마다 진행 체크리스트를 만든다.
// 추천은 조사 자료에서 끌어낸 가설이다. 성과가 쌓이면 「분석·추천」 화면을 우선한다.
(function () {
  const P = window.PLAN;
  const { h, head, bar, copy } = window.UI;
  const S = () => Store.state;
  const CAST = window.CAST || {};
  const RELEASE = window.RELEASE || {};
  const FAN_LABELS = ['다음 팬카페', '네이버 팬카페', '팬카페', '위버스', '프롬', '패니콘', '공식 사이트'];
  const READY = ['검수 중', '집행 중', '꺼짐'];

  const keyOf = (w) => w.cp + '|' + w.title;
  const shortGroup = (g) => String(g).split(/[,(/]/)[0].replace(/^\(전\)\s*/, '').replace(/\s*(출신|전 멤버|멤버)$/, '').trim();

  // ---------- 작품 특성 ----------
  function profile(w) {
    const d = WORKS_DATA.find((x) => x.title === w.title && x.cp === w.cp) || {};
    const cast = (CAST[w.title] || {}).cast || [];
    const fans = cast.filter((c) => c.group || c.fanclub || (c.links || []).some((l) => FAN_LABELS.includes(l[0])));
    const rel = RELEASE[w.title] || null;
    const orig = !!rel && (rel.k || '').indexOf('원작') === 0;
    const genre = d.genre || '';
    return {
      d, cast, fans, rel, orig, genre,
      fandom: fans.length > 0,
      fresh: !!rel && !orig && rel.d >= '2026-09',          // 집행 석 달 안쪽에 공개된 신작
      year26: !!rel && !orig && rel.d.slice(0, 4) === '2026',
      cpRec: P.recommended[w.title] || '',
      trailer: !!d.trailer,
      lowFree: d.free != null && d.free < 3,
      romance: /로맨스|멜로|로코/.test(genre),
      revenge: /스릴러|복수|액션|범죄|미스터리/.test(genre),
      comedy: /코미디|코믹/.test(genre),
    };
  }

  function typeTags(p) {
    const t = [];
    if (p.cpRec) t.push(['accent', 'CP 추천']);
    if (p.fandom) t.push(['accent', '팬덤형']);
    if (p.fresh) t.push(['ok', '신작']);
    if (p.orig) t.push(['', '원작 재편집']);
    if (p.trailer) t.push(['ok', '예고편 있음']);
    if (p.lowFree) t.push(['warn', '3화 유료']);
    if (!p.cast.length) t.push(['warn', '출연진 미확인']);
    return t.map((x) => '<span class="tag ' + x[0] + '">' + x[1] + '</span>').join(' ');
  }

  // 소재 「내용」 추천
  function contentTags(p) {
    const t = [];
    if (p.fandom) t.push('배우 중심');
    if (p.romance) t.push('설렘·로맨스');
    if (p.revenge) t.push('갈등·반전', '복수·사이다');
    if (p.comedy) t.push('코믹');
    if (p.trailer) t.push('예고편');
    if (/챌린지/.test(p.cpRec)) t.push('챌린지');
    if (/비하인드/.test(p.cpRec)) t.push('비하인드');
    if (t.length < 2) t.push('갈등·반전');
    return [...new Set(t)].slice(0, 4);
  }

  // 검색광고 키워드 추천
  function keywords(w, p) {
    const k = [w.title, w.title + ' 드라마', w.title + ' 숏드라마', w.title + ' 다시보기'];
    p.cast.filter((c) => c.role !== '조연').slice(0, 3).forEach((c) => {
      const name = c.name.replace(/\s*\(.*\)$/, '');
      k.push(name + ' 드라마', name + ' ' + w.title);
    });
    [...new Set(p.fans.filter((c) => c.group).map((c) => shortGroup(c.group)))].slice(0, 2).forEach((g) => { if (g) k.push(g + ' 드라마'); });
    return [...new Set(k)];
  }

  // ---------- 광고 방법 추천 ----------
  // [어디에, 무엇을, 왜]
  function recs(w, p) {
    const r = [];
    const tags = contentTags(p);
    const leads = p.cast.slice(0, 2).map((c) => c.name.replace(/\s*\(.*\)$/, '')).join(', ');

    if (p.fandom) {
      const who = p.fans.slice(0, 3).map((c) => c.name.replace(/\s*\(.*\)$/, '') + (c.group ? '(' + shortGroup(c.group) + ')' : '')).join(', ');
      r.push(['검색광고', '배우·그룹 이름을 키워드에 넣기', who + ' 팬은 출연작을 직접 검색한다. 클릭 단가가 낮고 볼 의사가 분명하다.']);
      r.push(['메타 · 유튜브', '「배우 중심」 소재와 「내용」 소재를 하나씩 만들어 비교', '첫 3초에 얼굴과 이름 자막을 넣은 소재가 내용 위주 소재보다 나은지 시험 기간에 확인한다.']);
      r.push(['공유 요청', '배우·그룹 공식 계정에 원드라마 게시물 공유를 부탁', '팬카페에 직접 홍보 글을 올리면 역효과가 난다. CP나 소속사를 거쳐 요청한다.']);
    }
    if (p.cpRec) r.push(['소재', 'CP가 준 소재부터 쓰기', p.cpRec]);
    if (p.fresh) r.push(['검색광고 · 문구', '「신작」을 문구에 넣고 작품명 키워드 입찰을 높게', (p.rel.d) + ' 공개작이라 검색 수요가 아직 살아 있다.' + (p.rel.c !== 'high' ? ' (공개일은 한 곳에서만 확인됨)' : '')]);
    if (p.orig) {
      r.push(['문구', '원작과 배우 인지도를 앞세우기' + (leads ? ' (' + leads + ')' : ''), '이미 알려진 작품이라 설명이 짧아도 된다. 「세로로 다시 보는」처럼 재편집본임을 밝힌다.']);
      r.push(['검색광고', '작품명 키워드는 낮은 입찰로 시작', '원작 영화·드라마를 찾는 검색과 섞여 전환이 낮을 수 있다. 시험 기간에 전환을 보고 올린다.']);
    }
    if (p.trailer) r.push(['유튜브', '예고편을 인스트림 30초 소재로', '받아 둔 예고편이 있어 제작 없이 바로 쓸 수 있다. 5초 안에 작품명이 나오는지 확인한다.']);
    if (p.romance) r.push(['메타 · 일정', '설렘 장면 소재, 크리스마스 기간(12/21~25)에 비중 높이기', '로맨스는 연말 분위기와 맞는다. 본 집행 때 반응이 좋으면 크리스마스 예산을 이 작품에 모은다.']);
    if (p.revenge) r.push(['메타 · 유튜브 쇼츠', '갈등이 터지는 장면으로 시작하는 15초 세로 영상', '소리 없이 넘겨 보는 지면이라 자막으로 상황이 바로 읽혀야 한다.']);
    if (p.comedy) r.push(['메타 릴스', '웃긴 장면 하나를 통째로 보여 주는 15초 영상', '코미디는 설명보다 장면이 먼저다. 과장된 문구는 피한다.']);
    if (!p.fandom && !p.orig) r.push(['타깃', '넓은 타깃에 내용으로 승부', '팬덤이 확인되지 않은 작품이다. 관심사를 좁히지 말고 소재 2종 이상을 돌려 반응 좋은 내용을 찾는다.']);
    if (p.lowFree) r.push(['주의', '무료 회차가 ' + p.d.free + '화뿐', '3화 시청이 곧 결제다. 3화 시청률이 낮게 나올 수 있어 결제당 비용으로 판단한다.']);
    if (!p.cast.length) r.push(['주의', '출연진을 확인하지 못함', '웹에 자료가 없다. CP에 출연진과 배우 계정을 요청하면 팬덤 활용 여부를 다시 판단할 수 있다.']);
    r.push(['소재 내용', '추천 내용: ' + tags.join(', '), '소재 화면에서 소재마다 「내용」을 이렇게 지정해 두면 분석·추천에서 비교된다.']);
    return r;
  }

  // ---------- 진행 체크리스트 ----------
  // auto 가 있으면 다른 화면의 입력 상태로 자동 판정한다.
  function checklist(w, p) {
    const s = S();
    const ids = Calc.creativeIds(w.code);
    const cr = ids.map((id) => s.creatives[w.code + '_' + id] || {});
    const tagged = cr.filter((c) => c.tag).length;
    const hasActorTag = cr.some((c) => c.tag === '배우 중심');
    const ready = cr.filter((c) => READY.includes(c.status)).length;
    const items = [
      { id: 'perm', text: 'CP에 홍보 허락 범위 확인' + (p.cast.length ? ' (무료 회차, 배우 이름·얼굴 사용 포함)' : ' (무료 회차 사용)'), owner: '총괄' },
      p.cast.length
        ? { id: 'cast', text: '출연진 정보가 맞는지 CP에 확인 (웹 조사 자료라 검증 필요)' }
        : { id: 'cast', text: 'CP에 출연진 목록과 배우 공식 계정 요청' },
      { id: 'url', text: '랜딩 주소 넣기', auto: !!w.url, link: '#/works' },
      { id: 'tag', text: '소재마다 「내용」 지정' + (p.fandom ? ' (「배우 중심」 1종 포함)' : '') + ' · ' + tagged + '/' + ids.length + '종', auto: tagged >= 2 && (!p.fandom || hasActorTag), link: '#/creatives' },
      { id: 'creative', text: '소재 받고 검수 끝내기 · ' + ready + '/' + ids.length + '종', auto: ids.length > 0 && ready === ids.length, link: '#/creatives', owner: '소재' },
      { id: 'kw', text: '검색광고 키워드에 작품명' + (p.cast.length ? '·배우명' : '') + ' 넣기', link: '#/register' },
      { id: 'reg', text: '매체에 광고 등록 (꺼진 상태로 올린 뒤 12/1에 켜기)', link: '#/register' },
    ];
    if (p.fandom) items.push({ id: 'share', text: '배우·그룹 공식 계정에 공유 요청 (CP·소속사 경유)' });
    items.push({ id: 'sns', text: '원드라마 SNS 게시물 올리기' + (p.cast.length ? ' (배우 태그)' : '') + ', 링크에 꼬리표 붙이기', link: '#/links' });
    items.push({ id: 'report', text: '시험 기간 성과 입력 시작', auto: s.reports.some((r) => r.work === w.code), link: '#/report' });
    items.push({ id: 'judge', text: '시험 결과로 계속할지 끌지 결정 (12/9)', link: '#/insights' });
    const saved = (s.planChecks || {})[keyOf(w)] || {};
    items.forEach((i) => { i.done = i.auto !== undefined ? i.auto : !!saved[i.id]; });
    return items;
  }

  function progress() {
    let done = 0, total = 0;
    S().works.forEach((w) => { const c = checklist(w, profile(w)); total += c.length; done += c.filter((i) => i.done).length; });
    return { done, total };
  }

  // ---------- 화면 ----------
  const chips = (c) => (c.links || []).map((l) => '<a class="chip' + (FAN_LABELS.includes(l[0]) ? ' fan' : '') + '" href="' + h(l[1]) + '" target="_blank" rel="noopener noreferrer" title="' + h(l[1]) + '">' + h(l[0]) + '</a>').join(' ');

  Views.playbook = function () {
    const works = S().works;
    if (!works.length) {
      return head('작품별 계획', '고른 작품의 특성에 맞춰 광고 방법을 추천하고, 작품마다 진행 상황을 체크한다.') +
        '<div class="card"><div class="empty">아직 고른 작품이 없습니다.<br><a class="btn primary" style="margin-top:12px" href="#/works">작품 고르기 →</a></div></div>';
    }
    const all = progress();
    const cards = works.map((w) => {
      const p = profile(w);
      const list = checklist(w, p);
      const done = list.filter((i) => i.done).length;
      const kws = keywords(w, p);
      const next = list.find((i) => !i.done);
      return '<div class="card" id="pb_' + h(w.code) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><h2><code>' + h(w.code) + '</code> ' + h(w.title) + ' <span class="muted small">' + h(w.cp) + ' · ' + h(p.genre) + (p.rel ? ' · ' + h(p.rel.d) + (p.orig ? ' 원작' : ' 공개') : '') + '</span></h2><span class="num">' + done + '/' + list.length + '</span></div>' +
        '<p style="margin:0 0 10px">' + typeTags(p) + '</p>' + bar(done / list.length, 'ok') +
        (next ? '<p class="small" style="margin:10px 0 0"><strong>다음 할 일:</strong> ' + h(next.text) + (next.link ? ' <a href="' + next.link + '">바로가기</a>' : '') + '</p>' : '<p class="small" style="margin:10px 0 0"><span class="tag ok">준비 끝</span></p>') +
        '<div class="grid g2" style="margin-top:14px;align-items:start">' +
          '<div><h3>광고 방법 추천</h3><ul class="recs">' + recs(w, p).map((r) => '<li><span class="tag">' + h(r[0]) + '</span> <strong>' + h(r[1]) + '</strong><br><span class="small muted">' + h(r[2]) + '</span></li>').join('') + '</ul>' +
            '<h3>검색광고 키워드 추천 <button class="link-btn" data-act="pbCopyKw" data-code="' + h(w.code) + '">복사</button></h3><p class="small" style="line-height:1.9">' + kws.map((k) => '<span class="tag">' + h(k) + '</span>').join(' ') + '</p>' +
            (p.fans.length ? '<h3>공유를 부탁할 계정</h3><table class="inner"><tbody>' + p.fans.map((c) => '<tr><td>' + h(c.name) + '</td><td class="wrap">' + h(c.group || '') + (c.fanclub ? '<br><span class="small muted">팬클럽 ' + h(c.fanclub) + '</span>' : '') + '</td><td class="wrap">' + (chips(c) || '<span class="muted small">확인 못 함</span>') + '</td></tr>').join('') + '</tbody></table>' : '') +
          '</div>' +
          '<div><h3>진행 체크리스트</h3>' + list.map((i) => '<label class="check' + (i.done ? ' done' : '') + '"><input type="checkbox" data-chg="pbToggle" data-key="' + h(keyOf(w)) + '" data-id="' + i.id + '"' + (i.done ? ' checked' : '') + (i.auto !== undefined ? ' disabled title="다른 화면의 입력 상태로 자동 판정됩니다"' : '') + '>' +
            '<span class="t">' + h(i.text) + (i.link ? ' <a class="small" href="' + i.link + '">바로가기</a>' : '') + '</span>' +
            (i.auto !== undefined ? '<span class="tag">자동</span>' : '') + (i.owner ? '<span class="tag">' + h(i.owner) + '</span>' : '') + '</label>').join('') + '</div>' +
        '</div></div>';
    }).join('');

    return head('작품별 계획', '고른 ' + works.length + '편 · 진행 ' + all.done + '/' + all.total, '<button data-act="printPage">인쇄</button>') +
      '<div class="notice info">추천은 출연진·공개일 조사와 CP 회신에서 끌어낸 가설입니다. 조사 자료는 검증되지 않았으니 배우 이름을 광고에 쓰기 전에 CP에 확인하세요. 성과가 쌓이면 <a href="#/insights">분석·추천</a>을 우선합니다.</div>' +
      (works.length < 3 ? '<div class="notice warn">작품을 3~5편 골라야 팬덤형과 내용형을 비교할 수 있습니다. <a href="#/works">작품 더 고르기</a></div>' : '') +
      cards;
  };

  Actions.pbToggle = (el) => Store.update((s) => {
    s.planChecks = s.planChecks || {};
    const m = s.planChecks[el.dataset.key] = s.planChecks[el.dataset.key] || {};
    if (el.checked) m[el.dataset.id] = true; else delete m[el.dataset.id];
  });
  Actions.pbCopyKw = (el) => {
    const w = S().works.find((x) => x.code === el.dataset.code);
    if (w) copy(keywords(w, profile(w)).join('\n'), '키워드를 복사했습니다');
    return false;
  };

  window.Playbook = { progress, profile, recs, checklist, keywords };
})();
