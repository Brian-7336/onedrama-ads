// 주소(#/...)에 맞는 화면을 그리고, 클릭·입력을 Actions로 넘긴다.
(function () {
  const ROUTES = [
    ['', '대시보드', 'dashboard'],
    ['checklist', '체크리스트', 'checklist'],
    ['budget', '예산', 'budget'],
    ['works', '작품', 'works'],
    ['creatives', '소재', 'creatives'],
    ['links', '링크 태그', 'links'],
    ['report', '성과 리포트', 'report'],
    ['guide', '운영 가이드', 'guide'],
    ['data', '데이터', 'data'],
  ];
  const view = document.getElementById('view');
  const nav = document.getElementById('nav');

  const current = () => {
    const path = location.hash.replace(/^#\/?/, '').split('?')[0];
    return ROUTES.find((r) => r[0] === path) || ROUTES[0];
  };

  function counts() {
    const s = Store.state;
    const prog = Calc.checklistProgress().reduce((a, p) => ({ d: a.d + p.done, t: a.t + p.total }), { d: 0, t: 0 });
    return { checklist: prog.d + '/' + prog.t, works: s.works.length + '편', report: s.reports.length ? s.reports.length + '줄' : '' };
  }

  function render(keepScroll) {
    const route = current();
    const c = counts();
    nav.innerHTML = ROUTES.filter((r) => r[2] !== 'data').map((r) =>
      '<a href="#/' + r[0] + '"' + (r === route ? ' class="on" aria-current="page"' : '') + '>' + r[1] + (c[r[2]] ? '<span class="count">' + c[r[2]] + '</span>' : '') + '</a>').join('');

    // 다시 그려도 입력 중이던 칸과 스크롤 위치를 지킨다.
    const active = document.activeElement;
    const focusId = active && view.contains(active) ? active.id : '';
    const caret = focusId && active.selectionStart != null ? active.selectionStart : null;
    const y = window.scrollY;
    const inner = [...view.querySelectorAll('[style*="overflow-y"]')].map((el) => el.scrollTop);

    view.innerHTML = Views[route[2]]();
    document.title = route[1] + ' · 원드라마 광고 집행 관리';

    if (keepScroll) {
      window.scrollTo(0, y);
      [...view.querySelectorAll('[style*="overflow-y"]')].forEach((el, i) => { el.scrollTop = inner[i] || 0; });
      if (focusId) {
        const el = document.getElementById(focusId);
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

  window.addEventListener('hashchange', () => render(false));
  // 다른 탭에서 고치면 이 탭도 새 내용으로 맞춘다.
  window.addEventListener('storage', (ev) => {
    if (ev.key === 'onedrama-ads-v1') { Store.state = JSON.parse(ev.newValue || 'null') || Store.state; render(true); }
  });

  render(false);
})();
