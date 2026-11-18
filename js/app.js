// 주소(#/...)에 맞는 화면을 그리고, 클릭·입력을 Actions로 넘긴다.
(function () {
  const ICON = {
    dashboard: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z',
    checklist: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
    works: 'M4 5h16v14H4zM4 9h16M8 5v4M16 5v4',
    creatives: 'M4 5h16v14H4zM10 9l5 3-5 3z',
    playbook: 'M6 4h12v16H6zM9 9l1.5 1.5L13 8M9 15l1.5 1.5L13 14M15 9h1M15 15h1',
    links: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    register: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    budget: 'M4 7h16v11H4zM4 11h16M8 15h3',
    report: 'M5 20V10M12 20V4M19 20v-7',
    insights: 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z',
    guide: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
    data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  };
  // [주소, 이름, 화면, 묶음]
  const ROUTES = [
    ['', '대시보드', 'dashboard', ''],
    ['checklist', '체크리스트', 'checklist', '준비'],
    ['works', '작품', 'works', '준비'],
    ['playbook', '작품별 계획', 'playbook', '준비'],
    ['creatives', '소재', 'creatives', '준비'],
    ['links', '링크 태그', 'links', '준비'],
    ['register', '광고 등록', 'register', '준비'],
    ['budget', '예산', 'budget', '운영'],
    ['report', '성과 리포트', 'report', '운영'],
    ['insights', '분석·추천', 'insights', '운영'],
    ['guide', '운영 가이드', 'guide', '참고'],
    ['data', '데이터·계정', 'data', '참고'],
  ];
  const $ = (id) => document.getElementById(id);
  const view = $('view');
  const nav = $('nav');
  const icon = (name) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICON[name] + '"/></svg>';

  const current = () => {
    const path = location.hash.replace(/^#\/?/, '').split('?')[0];
    return ROUTES.find((r) => r[0] === path) || ROUTES[0];
  };

  function badges() {
    const s = Store.state;
    const prog = Calc.checklistProgress().reduce((a, p) => ({ d: a.d + p.done, t: a.t + p.total }), { d: 0, t: 0 });
    const flags = Calc.killFlags().length;
    return {
      checklist: [prog.d + '/' + prog.t, prog.d === prog.t ? 'ok' : ''],
      works: [s.works.length + '편', s.works.length >= 3 ? 'ok' : 'warn'],
      playbook: (() => { const p = window.Playbook.progress(); return p.total ? [p.done + '/' + p.total, p.done === p.total ? 'ok' : ''] : null; })(),
      report: s.reports.length ? [s.reports.length + '줄', ''] : null,
      insights: flags ? ['끄기 ' + flags, 'bad'] : null,
    };
  }

  function renderChrome(route) {
    const b = badges();
    let group = null;
    nav.innerHTML = ROUTES.map((r) => {
      const headHtml = r[3] !== group && r[3] ? '<div class="nav-group">' + r[3] + '</div>' : '';
      group = r[3];
      const bd = b[r[2]];
      return headHtml + '<a href="#/' + r[0] + '"' + (r === route ? ' class="on" aria-current="page"' : '') + '>' + icon(r[2]) + '<span>' + r[1] + '</span>' +
        (bd ? '<span class="count ' + bd[1] + '">' + bd[0] + '</span>' : '') + '</a>';
    }).join('');

    const today = Calc.today();
    const ph = Calc.phaseOf(today);
    $('phaseChip').innerHTML = today < PLAN.start ? '<strong>D-' + Calc.daysBetween(today, PLAN.start) + '</strong> 12/1 시험 시작'
      : today > PLAN.end ? '<strong>집행 종료</strong> 결산 정리'
      : '<strong>' + ph.name + ' 기간</strong> ' + (Calc.daysBetween(ph.start, today) + 1) + '일째';
    $('topTitle').textContent = route[1];
    document.title = route[1] + ' · 원드라마 광고 집행 관리';
  }

  function render(keepScroll) {
    const route = current();
    renderChrome(route);

    // 다시 그려도 입력 중이던 칸과 스크롤 위치를 지킨다.
    const active = document.activeElement;
    const focusId = active && view.contains(active) ? active.id : '';
    const caret = focusId && active.selectionStart != null ? active.selectionStart : null;
    const y = window.scrollY;
    const inner = [...view.querySelectorAll('[style*="overflow-y"]')].map((el) => el.scrollTop);

    view.innerHTML = Views[route[2]]();
    view.dataset.route = route[2];

    if (keepScroll) {
      window.scrollTo(0, y);
      [...view.querySelectorAll('[style*="overflow-y"]')].forEach((el, i) => { el.scrollTop = inner[i] || 0; });
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

  // ---------- 모바일 메뉴 ----------
  const menuBtn = $('menuBtn');
  const scrim = $('scrim');
  function setMenu(open) {
    document.body.classList.toggle('nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    scrim.hidden = !open;
  }
  menuBtn.addEventListener('click', () => setMenu(!document.body.classList.contains('nav-open')));
  scrim.addEventListener('click', () => setMenu(false));
  nav.addEventListener('click', (ev) => { if (ev.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') setMenu(false); });

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

  render(false);
})();
