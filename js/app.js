// 주소(#/...)에 맞는 화면을 그리고, 클릭·입력을 Actions로 넘긴다.
// 화면 위쪽에 8단계를 가로로 늘어놓고, 단계 화면 아래에 이전·다음 버튼을 둔다.
(function () {
  // [주소, 이름, 화면]. 단계 화면의 순서는 Calc.flow() 를 따른다.
  const ROUTES = [
    ['', '홈', 'dashboard'],
    ['works', '작품 고르기', 'works'],
    ['playbook', '작품별 계획', 'playbook'],
    ['creatives', '소재 준비', 'creatives'],
    ['links', '링크 태그', 'links'],
    ['register', '광고 등록', 'register'],
    ['report', '성과 입력', 'report'],
    ['insights', '분석·추천', 'insights'],
    ['budget', '예산 조정', 'budget'],
    ['checklist', '할 일 목록', 'checklist'],
    ['guide', '운영 가이드', 'guide'],
    ['data', '데이터·계정', 'data'],
  ];
  const UTIL = ['checklist', 'guide', 'data'];
  const GROUP_NOTE = { 준비: '11/30까지', 집행: '12/1~31' };
  const $ = (id) => document.getElementById(id);
  const view = $('view');
  const nav = $('nav');
  const util = $('util');

  const current = () => {
    const path = location.hash.replace(/^#\/?/, '').split('?')[0];
    return ROUTES.find((r) => r[0] === path) || ROUTES[0];
  };

  // 읽기만 하면 되는 단계(작품별 계획, 링크 태그)는 화면을 열어 보면 끝난 것으로 본다.
  function markSeen(route) {
    if (route[0] !== 'playbook' && route[0] !== 'links') return;
    const s = Store.state;
    if (!s.works.length || (s.flowSeen || {})[route[0]]) return;
    s.flowSeen = Object.assign({}, s.flowSeen, { [route[0]]: true });
    Store.save();
  }

  function renderChrome(route, flow) {
    let group = null;
    nav.innerHTML = '<a class="hs hs-home' + (route[0] === '' ? ' on' : '') + '" href="#/"' + (route[0] === '' ? ' aria-current="page"' : '') + '><span class="hs-t">홈</span></a>' +
      flow.map((st) => {
        const g = st.group !== group ? '<span class="hs-group">' + st.group + ' <small>' + GROUP_NOTE[st.group] + '</small></span>' : '';
        group = st.group;
        const on = st.route === route[0];
        const cls = (on ? ' on' : '') + (st.done ? ' done' : '') + (st === flow.current ? ' cur' : '');
        const sr = '<span class="sr-only">' + st.n + '단계' + (st.done ? ', 끝남' : st === flow.current ? ', 지금 할 단계' : '') + '. </span>';
        return g + '<a class="hs' + cls + '" href="' + st.href + '"' + (on ? ' aria-current="step"' : '') + ' title="' + st.goal + '">' +
          '<span class="num-dot' + (st.done ? ' done' : st === flow.current ? ' cur' : '') + '" aria-hidden="true">' + (st.done ? '✓' : st.n) + '</span>' +
          '<span class="hs-t">' + sr + st.t + '<small>' + st.hint + '</small></span></a>';
      }).join('');
    const onEl = nav.querySelector('.on');
    if (onEl && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, onEl.offsetLeft - nav.clientWidth / 2 + onEl.offsetWidth / 2);

    util.innerHTML = UTIL.map((id) => { const r = ROUTES.find((x) => x[0] === id); return '<a href="#/' + id + '"' + (r === route ? ' class="on" aria-current="page"' : '') + '>' + r[1] + '</a>'; }).join('');

    const today = Calc.today();
    const ph = Calc.phaseOf(today);
    $('phaseChip').innerHTML = today < PLAN.start ? '<strong>D-' + Calc.daysBetween(today, PLAN.start) + '</strong> 12/1 시험 시작'
      : today > PLAN.end ? '<strong>집행 종료</strong> 결산 정리'
      : '<strong>' + ph.name + ' 기간</strong> ' + (Calc.daysBetween(ph.start, today) + 1) + '일째';
    document.title = route[1] + ' · 원드라마 광고 집행 관리';
  }

  // 단계 화면 위: 이 화면에서 할 일 한 줄과 실제 진행 상태.
  function goalLine(st) {
    const state = st.repeat ? '<span class="tag">' + st.repeat + ' 하는 일</span>'
      : st.done ? '<span class="tag ok">끝남</span>' : '<span class="tag warn">진행 중</span>';
    return '<div class="goal"><span class="goal-n">' + st.n + '단계</span> ' + state + ' <span class="goal-t">' + st.goal + '</span> <span class="muted">' + st.hint + '</span></div>';
  }
  // 단계 화면 아래: 이전·다음.
  function pager(flow, i) {
    const st = flow[i];
    const prev = flow[i - 1];
    const next = flow[i + 1];
    return '<div class="pager">' +
      (prev ? '<a class="btn" href="' + prev.href + '">← 이전: ' + prev.t + '</a>' : '<a class="btn" href="#/">← 홈</a>') +
      (next ? '<a class="btn' + (st.done || st.repeat ? ' primary' : '') + '" href="' + next.href + '">다음: ' + next.t + ' →</a>' : '<a class="btn" href="#/">홈으로</a>') + '</div>';
  }

  function render(keepScroll) {
    const route = current();
    markSeen(route);
    const flow = Calc.flow();
    renderChrome(route, flow);

    // 다시 그려도 입력 중이던 칸과 스크롤 위치를 지킨다.
    const active = document.activeElement;
    const focusId = active && view.contains(active) ? active.id : '';
    const caret = focusId && active.selectionStart != null ? active.selectionStart : null;
    const y = window.scrollY;
    const inner = [...view.querySelectorAll('[style*="overflow-y"]')].map((el) => el.scrollTop);

    const i = flow.findIndex((x) => x.route === route[0]);
    view.innerHTML = (i >= 0 ? goalLine(flow[i]) : '') + Views[route[2]]() + (i >= 0 ? pager(flow, i) : '');
    view.dataset.route = route[2];

    if (keepScroll) {
      window.scrollTo(0, y);
      [...view.querySelectorAll('[style*="overflow-y"]')].forEach((el, k) => { el.scrollTop = inner[k] || 0; });
      if (focusId) {
        const el = $(focusId);
        if (el) { el.focus(); if (caret != null) try { el.setSelectionRange(caret, caret); } catch (e) { /* 숫자 칸은 건너뜀 */ } }
      }
    } else {
      window.scrollTo(0, 0);
    }
  }

  function run(name, el, ev) {
    const fn = Actions[name];
    if (!fn) return;
    if (fn(el, ev) !== false) render(true);
  }

  view.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (el && !el.disabled) run(el.dataset.act, el, ev);
  });
  view.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-chg]');
    if (el) run(el.dataset.chg, el, ev);
  });
  // 한글 조합 중에는 다시 그리지 않는다 (글자가 끊긴다). 조합이 끝나면 한 번 반영한다.
  view.addEventListener('input', (ev) => {
    if (ev.isComposing) return;
    const el = ev.target.closest('[data-inp]');
    if (el) run(el.dataset.inp, el, ev);
  });
  view.addEventListener('compositionend', (ev) => {
    const el = ev.target.closest('[data-inp]');
    if (el) run(el.dataset.inp, el, ev);
  });
  view.addEventListener('submit', (ev) => {
    const form = ev.target.closest('[data-submit]');
    if (!form) return;
    ev.preventDefault();
    run(form.dataset.submit, form, ev);
  });

  // ---------- 화면 모드 (자동 → 밝게 → 어둡게) ----------
  const themeBtn = $('themeBtn');
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_NAME = { auto: '자동', light: '밝게', dark: '어둡게' };
  function getTheme() { try { return localStorage.getItem('onedrama-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function applyTheme(t) {
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    themeBtn.textContent = '화면 모드: ' + THEME_NAME[t];
  }
  themeBtn.addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
    try { localStorage.setItem('onedrama-theme', next); } catch (e) { /* 저장 못 해도 이번 화면에는 적용 */ }
    applyTheme(next);
  });
  applyTheme(getTheme());

  // ---------- 저장 표시 ----------
  const saveState = $('saveState');
  Store.listeners.push(() => {
    const d = new Date();
    saveState.textContent = '저장됨 · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    saveState.classList.remove('flash');
    void saveState.offsetWidth;
    saveState.classList.add('flash');
  });

  window.addEventListener('hashchange', () => { render(false); view.focus({ preventScroll: true }); });
  // 다른 탭에서 고치면 이 탭도 새 내용으로 맞춘다.
  window.addEventListener('storage', (ev) => {
    if (ev.key === 'onedrama-ads-v1') { Store.state = JSON.parse(ev.newValue || 'null') || Store.state; render(true); }
  });
  window.App = { render };

  // 이미 골라 둔 작품도 비어 있는 소재 내용을 추천대로 채운다 (정해 둔 것은 건드리지 않는다).
  if (Store.state.works.reduce((n, w) => n + window.Playbook.fillTags(Store.state, w), 0)) Store.save();

  render(false);
})();
