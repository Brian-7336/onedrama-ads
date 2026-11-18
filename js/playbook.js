// 작품별 광고 계획: 고른 작품의 특성(팬덤, 신작, CP 추천, 장르 등)에 맞춰 광고 방법을 추천한다.
// 따로 체크하는 목록은 두지 않는다. 다른 화면에 입력한 내용에서 진행 상황을 읽어 보여 준다.
// 추천은 조사 자료에서 끌어낸 가설이다. 성과가 쌓이면 「분석·추천」 화면을 우선한다.
(function () {
  const P = window.PLAN;
  const { h, head, copy, toast } = window.UI;
  const S = () => Store.state;
  const CAST = window.CAST || {};
  const RELEASE = window.RELEASE || {};
  const FAN_LABELS = ['다음 팬카페', '네이버 팬카페', '팬카페', '위버스', '프롬', '패니콘', '공식 사이트'];
  const READY = ['검수 중', '집행 중', '꺼짐'];

  const shortGroup = (g) => String(g).split(/[,(/]/)[0].replace(/^\(전\)\s*/, '').replace(/\s*(출신|전 멤버|멤버)$/, '').trim();
  const plain = (name) => name.replace(/\s*\(.*\)$/, '');

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
    if (/챌린지/.test(p.cpRec)) t.push('챌린지');
    if (/비하인드/.test(p.cpRec)) t.push('비하인드');
    if (t.length < 2) t.push('갈등·반전');
    return [...new Set(t)].slice(0, 4);
  }

  // 소재 번호마다 어떤 내용으로 만들지. 15초 A/B는 서로 다른 내용으로 두어 비교가 되게 한다.
  function tagPlan(p) {
    const t = contentTags(p);
    const a = t[0];
    const b = t[1] || '갈등·반전';
    return { v06: a, v15a: a, v15b: b, v30a: p.trailer ? '예고편' : b, v60a: p.trailer ? '예고편' : a, im01: a, im02: '명대사', bn01: a };
  }
  // 비어 있는 소재의 「내용」을 추천대로 채운다. 이미 정한 것은 건드리지 않는다. 채운 수를 돌려준다.
  function fillTags(s, w) {
    const plan = tagPlan(profile(w));
    let nFilled = 0;
    Calc.creativeIds(w.code).forEach((id) => {
      const key = w.code + '_' + id;
      const c = (s.creatives[key] = s.creatives[key] || {});
      if (!c.tag && plan[id]) { c.tag = plan[id]; nFilled++; }
    });
    return nFilled;
  }

  // 검색광고 키워드 추천
  function keywords(w, p) {
    const k = [w.title, w.title + ' 드라마', w.title + ' 숏드라마', w.title + ' 다시보기'];
    (p.cast.some((c) => c.lead === '주연') ? p.cast.filter((c) => c.lead === '주연') : p.cast).slice(0, 3).forEach((c) => { k.push(plain(c.name) + ' 드라마', plain(c.name) + ' ' + w.title); });
    [...new Set(p.fans.filter((c) => c.group).map((c) => shortGroup(c.group)))].slice(0, 2).forEach((g) => { if (g) k.push(g + ' 드라마'); });
    return [...new Set(k)];
  }

  // ---------- 광고 방법 추천: [어디에, 무엇을, 왜] ----------
  function recs(w, p) {
    const r = [];
    const leads = p.cast.slice(0, 2).map((c) => plain(c.name)).join(', ');
    if (p.fandom) {
      const who = p.fans.slice(0, 3).map((c) => plain(c.name) + (c.group ? '(' + shortGroup(c.group) + ')' : '')).join(', ');
      r.push(['검색광고', '배우·그룹 이름을 키워드에 넣기', who + ' 팬은 출연작을 직접 검색한다. 클릭 단가가 낮고 볼 의사가 분명하다.']);
      r.push(['메타 · 유튜브', '「배우 중심」 소재와 「내용」 소재를 하나씩 만들어 비교', '첫 3초에 얼굴과 이름 자막을 넣은 소재가 내용 위주 소재보다 나은지 시험 기간에 확인한다.']);
      r.push(['공유 요청', '배우·그룹 공식 계정에 원드라마 게시물 공유를 부탁', '팬카페에 직접 홍보 글을 올리면 역효과가 난다. CP나 소속사를 거쳐 요청한다.']);
    }
    if (p.cpRec) r.push(['소재', 'CP가 준 소재부터 쓰기', p.cpRec]);
    if (p.fresh) r.push(['검색광고 · 문구', '「신작」을 문구에 넣고 작품명 키워드 입찰을 높게', p.rel.d + ' 공개작이라 검색 수요가 아직 살아 있다.' + (p.rel.c !== 'high' ? ' (공개일은 한 곳에서만 확인됨)' : '')]);
    if (p.orig) {
      r.push(['문구', '원작과 배우 인지도를 앞세우기' + (leads ? ' (' + leads + ')' : ''), '이미 알려진 작품이라 설명이 짧아도 된다. 「세로로 다시 보는」처럼 재편집본임을 밝힌다.']);
      r.push(['검색광고', '작품명 키워드는 낮은 입찰로 시작', '원작 영화·드라마를 찾는 검색과 섞여 전환이 낮을 수 있다. 시험 기간에 전환을 보고 올린다.']);
    }
    if (p.trailer) r.push(['유튜브', '예고편을 인스트림 30초 소재로', '받아 둔 예고편이 있어 제작 없이 바로 쓸 수 있다. 5초 안에 작품명이 나오는지 확인한다.']);
    if (p.romance) r.push(['메타 · 일정', '설렘 장면 소재, 크리스마스 기간(12/21~25)에 비중 높이기', '로맨스는 연말 분위기와 맞는다. 본 집행 때 반응이 좋으면 크리스마스 예산을 이 작품에 모은다.']);
    if (p.revenge) r.push(['메타 · 유튜브 쇼츠', '갈등이 터지는 장면으로 시작하는 15초 세로 영상', '소리 없이 넘겨 보는 지면이라 자막으로 상황이 바로 읽혀야 한다.']);
    if (p.comedy) r.push(['메타 릴스', '웃긴 장면 하나를 통째로 보여 주는 15초 영상', '코미디는 설명보다 장면이 먼저다. 과장된 문구는 피한다.']);
    if (!p.fandom && !p.orig) r.push(['타깃', '넓은 타깃에 내용으로 승부', '팬덤이 확인되지 않은 작품이다. 관심사를 좁히지 말고 소재 2종 이상을 돌려 반응 좋은 내용을 찾는다.']);
    return r;
  }

  // CP 납품 메타의 초상권 문구를 묶어서 보여 준다 (같은 문구끼리 배우 이름을 모은다).
  function portraitLines(w) {
    const pr = ((window.PRIVATE || {})[w.title] || {}).portrait || [];
    const by = {};
    pr.forEach((x) => { (by[x[1]] = by[x[1]] || []).push(x[0]); });
    return Object.keys(by).map((k) => ({ text: k, names: by[k], warn: /협의|불가|금지|필요/.test(k) }));
  }

  // 집행 전에 사람이 확인해야 하는 것. 체크 칸 없이 안내만 한다.
  function cautions(w, p) {
    const c = [];
    const meta = p.cast.length > 0 && p.cast.every((x) => x.source === 'CP 메타');
    if (meta) {
      c.push('출연진은 CP 납품 메타 기준이다.' + (portraitLines(w).length ? ' 초상권은 위 표의 문구를 따른다.' : ' 메타에 초상권 문구가 없어 CP에 사용 범위를 확인한다.'));
      if (p.lowFree) c.push('무료 회차가 ' + p.d.free + '화뿐이라 3화 시청이 곧 결제다. 결제당 비용으로 판단한다.');
      return c;
    }
    c.push(p.cast.length ? 'CP에 홍보 허락 범위를 확인한다 (무료 회차, 배우 이름·얼굴 사용).' : 'CP에 홍보 허락 범위(무료 회차 사용)를 확인한다.');
    c.push(p.cast.length ? '출연진은 웹 조사 자료다. 광고 문구에 이름을 쓰기 전에 CP에 맞는지 확인한다.' : '출연진을 확인하지 못했다. CP에 출연진과 배우 계정을 요청하면 팬덤 활용을 다시 판단할 수 있다.');
    if (p.lowFree) c.push('무료 회차가 ' + p.d.free + '화뿐이라 3화 시청이 곧 결제다. 결제당 비용으로 판단한다.');
    return c;
  }

  // ---------- 실제 진행 상황: 다른 화면에 입력한 내용에서 읽는다 ----------
  function status(w) {
    const s = S();
    const ids = Calc.creativeIds(w.code);
    const cr = ids.map((id) => s.creatives[w.code + '_' + id] || {});
    const tagged = cr.filter((c) => c.tag).length;
    const ready = cr.filter((c) => READY.includes(c.status)).length;
    const live = cr.filter((c) => c.status === '집행 중').length;
    const reps = s.reports.filter((r) => r.work === w.code).length;
    return [
      { t: '랜딩 주소', v: w.url ? '입력함' : '없음', done: !!w.url, href: '#/works' },
      { t: '소재 내용', v: tagged + '/' + ids.length + '종', done: tagged === ids.length, href: '#/creatives' },
      { t: '소재 검수', v: ready + '/' + ids.length + '종', done: ids.length > 0 && ready === ids.length, href: '#/creatives' },
      { t: '집행 중 소재', v: live + '종', done: live > 0, href: '#/creatives' },
      { t: '성과 기록', v: reps + '줄', done: reps > 0, href: '#/report' },
    ];
  }
  function progress() {
    let done = 0, total = 0;
    S().works.forEach((w) => { const st = status(w); total += st.length; done += st.filter((i) => i.done).length; });
    return { done, total };
  }

  // ---------- 작품 자동 추천: 받은 소재, 팬덤, 신작 여부로 점수를 매긴다 ----------
  function suggest(n) {
    const picked = new Set(S().works.map((w) => w.cp + '|' + w.title));
    return WORKS_DATA.filter((w) => w.cand && !picked.has(w.cp + '|' + w.title)).map((w) => {
      const p = profile(w);
      const score = (p.cpRec ? 4 : 0) + (p.fandom ? 3 : 0) + (p.fresh ? 3 : 0) + (p.trailer ? 1 : 0) + ((w.free || 0) >= 3 ? 1 : -2) + (p.orig ? -2 : 0);
      return { w, score, p };
    }).sort((a, b) => b.score - a.score || ((b.p.rel || {}).d || '').localeCompare((a.p.rel || {}).d || '')).slice(0, n);
  }

  // ---------- 화면 ----------
  const chips = (c) => (c.links || []).map((l) => '<a class="chip' + (FAN_LABELS.includes(l[0]) ? ' fan' : '') + '" href="' + h(l[1]) + '" target="_blank" rel="noopener noreferrer" title="' + h(l[1]) + '">' + h(l[0]) + '</a>').join(' ');

  Views.playbook = function () {
    const works = S().works;
    if (!works.length) {
      return head('작품별 계획', '고른 작품의 특성에 맞춰 광고 방법을 추천한다.') +
        '<div class="card"><div class="empty">아직 고른 작품이 없습니다.<br><a class="btn primary" style="margin-top:12px" href="#/works">작품 고르기 →</a></div></div>';
    }
    const cards = works.map((w) => {
      const p = profile(w);
      const st = status(w);
      const kws = keywords(w, p);
      const plan = tagPlan(p);
      return '<div class="card" id="pb_' + h(w.code) + '">' +
        '<h2><code>' + h(w.code) + '</code> ' + h(w.title) + ' <span class="muted small">' + h(w.cp) + ' · ' + h(p.genre) + (p.rel ? ' · ' + h(p.rel.d) + (p.orig ? ' 원작' : ' 공개') : '') + '</span></h2>' +
        '<p style="margin:0 0 12px">' + typeTags(p) + '</p>' +
        '<div class="statusrow" aria-label="진행 상황">' + st.map((i) => '<a class="st' + (i.done ? ' done' : '') + '" href="' + i.href + '"><span class="st-t">' + (i.done ? '✓ ' : '') + h(i.t) + '</span><span class="st-v">' + h(i.v) + '</span></a>').join('') + '</div>' +
        '<div class="grid g2" style="margin-top:16px;align-items:start">' +
          '<div><h3 style="margin-top:0">광고 방법 추천</h3><ul class="recs">' + recs(w, p).map((r) => '<li><span class="tag">' + h(r[0]) + '</span> <strong>' + h(r[1]) + '</strong><br><span class="small muted">' + h(r[2]) + '</span></li>').join('') + '</ul></div>' +
          '<div><h3 style="margin-top:0">소재 내용 계획 <span class="muted" style="font-weight:400">비어 있는 소재에 자동으로 들어갑니다</span></h3><p class="small" style="line-height:1.9;margin:0">' +
              P.creativeTypes.map((c) => '<span class="tag">' + h(c.name) + ' → ' + h(plan[c.id] || '–') + '</span>').join(' ') + '</p>' +
            '<h3>검색광고 키워드 <button class="link-btn" data-act="pbCopyKw" data-code="' + h(w.code) + '">복사</button></h3><p class="small" style="line-height:1.9;margin:0">' + kws.map((k) => '<span class="tag">' + h(k) + '</span>').join(' ') + '</p>' +
            (p.fans.length ? '<h3>공유를 부탁할 계정</h3><table class="inner"><tbody>' + p.fans.map((c) => '<tr><td>' + h(c.name) + '</td><td class="wrap">' + h(c.group || '') + (c.fanclub ? '<br><span class="small muted">팬클럽 ' + h(c.fanclub) + '</span>' : '') + '</td><td class="wrap">' + (chips(c) || '<span class="muted small">확인 못 함</span>') + '</td></tr>').join('') + '</tbody></table>' : '') +
            (() => { const pl = portraitLines(w); const pv = (window.WORKMETA || {})[w.title] || {};
              return (pl.length ? '<h3>초상권 (CP 메타)</h3><ul class="small" style="margin:0;padding-left:18px;line-height:1.7">' + pl.map((x) => '<li>' + (x.warn ? '<span class="tag warn">확인 필요</span> ' : '<span class="tag ok">사용 가능 문구</span> ') + h(x.text) + ' <span class="muted">(' + h(x.names.join(', ')) + ')</span></li>').join('') + '</ul>' : '') +
                (pv.marketing ? '<h3>CP가 적은 마케팅 포인트</h3><p class="small" style="margin:0;white-space:pre-line">' + h(pv.marketing) + '</p>' : '') +
                (pv.logline ? '<h3>로그라인</h3><p class="small" style="margin:0;white-space:pre-line">' + h(pv.logline) + '</p>' : ''); })() +
            '<h3>집행 전에 확인</h3><ul class="small" style="margin:0;padding-left:18px;line-height:1.7">' + cautions(w, p).map((c) => '<li>' + h(c) + '</li>').join('') + '</ul>' +
          '</div>' +
        '</div></div>';
    }).join('');

    return head('작품별 계획', '고른 ' + works.length + '편에 맞춘 광고 방법. 읽기만 하면 되고, 진행 상황은 다른 화면의 입력에서 자동으로 채워집니다.', '<button data-act="printPage">인쇄</button>') +
      '<div class="notice info">추천은 출연진·공개일 조사와 CP 회신에서 끌어낸 가설입니다. 성과가 쌓이면 <a href="#/insights">분석·추천</a>을 우선합니다.</div>' +
      (works.length < 3 ? '<div class="notice warn">작품을 3~5편 골라야 팬덤형과 내용형을 비교할 수 있습니다. <a href="#/works">작품 더 고르기</a></div>' : '') +
      cards;
  };

  Actions.pbCopyKw = (el) => {
    const w = S().works.find((x) => x.code === el.dataset.code);
    if (w) copy(keywords(w, profile(w)).join('\n'), '키워드를 복사했습니다');
    return false;
  };
  // 작품 화면의 「추천 조합으로 채우기」: 3편이 될 때까지(이미 3편 이상이면 1편) 점수 높은 작품을 고른다.
  Actions.autoPick = () => {
    const need = Math.max(1, 4 - S().works.length);
    const list = suggest(Math.min(need, 5 - S().works.length));
    if (!list.length) { toast('더 고를 수 있는 작품이 없습니다'); return false; }
    Store.update((s) => {
      list.forEach((x) => {
        const w = { code: Calc.newCode(s, x.w.cp, x.w.title), title: x.w.title, cp: x.w.cp, url: (window.LANDING || {})[x.w.cp + '|' + x.w.title] || '' };
        s.works.push(w);
        fillTags(s, w);
      });
    });
    toast(list.map((x) => x.w.title).join(', ') + ' 골랐습니다');
  };

  window.Playbook = { progress, profile, recs, status, keywords, fillTags, suggest };
})();
