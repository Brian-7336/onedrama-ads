// 화면 9개. 각 화면은 HTML 문자열을 돌려주고, 동작은 Actions에 모아 둔다.
(function () {
  const P = window.PLAN;
  const S = () => Store.state;

  // ---------- 공통 도우미 ----------
  const h = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = (v) => (v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString('ko-KR'));
  const won = (v) => (v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString('ko-KR') + '원');
  const pct = (v, d) => (v == null || isNaN(v) ? '–' : (v * 100).toFixed(d == null ? 1 : d) + '%');
  const md = (s) => +s.slice(5, 7) + '/' + +s.slice(8);
  const bar = (ratio, cls) => '<div class="bar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, ratio * 100)).toFixed(1) + '%"></i></div>';
  const dot = (m) => '<span class="dot" style="background:var(--m-' + m.id + ')"></span>';
  const head = (title, sub, actions) => '<div class="head"><div><h1>' + h(title) + '</h1><p>' + sub + '</p></div><div class="actions">' + (actions || '') + '</div></div>';
  const ext = (url, label, cls) => '<a class="btn ' + (cls || '') + '" href="' + h(url) + '" target="_blank" rel="noopener noreferrer">' + h(label) + ' ↗</a>';
  const opt = (value, label, cur) => '<option value="' + h(value) + '"' + (String(cur) === String(value) ? ' selected' : '') + '>' + h(label) + '</option>';

  // 오래 걸리는 일을 하는 동안 화면 가운데에 돌아가는 원과 설명을 띄운다. 끝나면 done()을 부른다.
  // 대화창 위에도 보이도록 popover로 띄운다.
  let busyN = 0;
  function busy(text) {
    let el = document.getElementById('busy');
    if (!el) {
      el = document.createElement('div');
      el.id = 'busy';
      el.setAttribute('role', 'status');
      if (el.showPopover) el.setAttribute('popover', 'manual');
      el.innerHTML = '<span class="spin" aria-hidden="true"></span><span class="bt"></span>';
      document.body.appendChild(el);
    }
    const set = (t) => { el.querySelector('.bt').textContent = t; };
    set(text);
    busyN++;
    el.classList.add('on');
    try { if (el.showPopover) { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } } catch (e) { /* 무시 */ }
    let closed = false;
    return { set, done() { if (closed) return; closed = true; if (--busyN <= 0) { busyN = 0; el.classList.remove('on'); try { if (el.hidePopover && el.matches(':popover-open')) el.hidePopover(); } catch (e) { /* 무시 */ } } } };
  }
  // undo를 주면 「되돌리기」 버튼이 함께 뜬다.
  function toast(msg, undo) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '되돌리기';
      b.onclick = () => { undo(); el.classList.remove('on'); };
      el.appendChild(b);
    }
    el.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('on'), undo ? 6000 : 1800);
  }
  // 지우기 전에 상태를 찍어 두고, 되돌리기를 누르면 그대로 돌려놓는다.
  function withUndo(msg, change) {
    const snap = JSON.stringify(Store.state);
    Store.update(change);
    toast(msg, () => { Store.replace(JSON.parse(snap)); window.App.render(true); });
  }
  function download(name, text, type) {
    const blob = new Blob(['﻿' + text], { type: (type || 'text/csv') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvCell = (v) => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  function copy(text, msg) {
    const done = () => toast(msg || '복사했습니다');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('복사하지 못했습니다'); }
    ta.remove();
  }

  // 화면에만 쓰는 상태 (저장하지 않음)
  const ui = {
    works: { q: '', cp: '', genre: '', trailer: true, free3: false, rec: false, fan: true, new26: true, sort: '', open: '', recOpen: false },
    report: { tab: 'media', from: '', to: '', media: '' },
    form: { date: '', media: 'meta', work: '', creative: '', imp: '', clk: '', start: '', ep3: '', pay: '', cost: '' },
    links: { media: '' },
    openQc: {},
  };

  const Views = {};
  const Actions = {};

  // ---------- 1. 대시보드 ----------
  Views.dashboard = function () {
    const today = Calc.today();
    const phase = Calc.phaseOf(today);
    const total = Calc.sum(S().reports);
    const planned = Calc.plannedUntil(today);
    const flags = Calc.killFlags();
    const prog = Calc.checklistProgress();

    let status, statusSub;
    if (today < P.start) {
      status = 'D-' + Calc.daysBetween(today, P.start);
      statusSub = '12/1 시험 기간 시작';
    } else if (today > P.end) {
      status = '집행 종료';
      statusSub = '결산 리포트를 정리하세요';
    } else {
      status = phase.name + ' ' + (Calc.daysBetween(phase.start, today) + 1) + '일째';
      statusSub = md(phase.start) + ' ~ ' + md(phase.end) + ' · 전체 ' + (Calc.daysBetween(P.start, today) + 1) + '/31일';
    }

    // 알림
    const alerts = [];
    const works = S().works;
    if (works.length < 3) alerts.push(['warn', '광고할 작품이 ' + works.length + '편입니다. 3~5편을 골라 주세요. <a href="#/works">작품 고르기</a>']);
    const noUrl = works.filter((w) => !w.url);
    if (noUrl.length) alerts.push(['warn', '랜딩 주소가 없는 작품: ' + noUrl.map((w) => h(w.code)).join(', ') + '. <a href="#/works">주소 넣기</a>']);
    const tomorrow = Calc.addDays(today, 1);
    const np = P.phases.find((ph) => ph.start === tomorrow || ph.start === today);
    if (np && np.id !== 'test') alerts.push(['info', md(np.start) + '부터 ' + np.name + ' 기간입니다. 하루 예산을 바꿔 주세요. <a href="#/budget">예산 보기</a>']);
    if (today >= P.start && today <= P.end) {
      const y = Calc.addDays(today, -1);
      if (y >= P.start && !S().reports.some((r) => r.date === y)) alerts.push(['warn', '어제(' + md(y) + ') 성과가 아직 입력되지 않았습니다. <a href="#/report">입력하기</a>']);
    }
    flags.forEach((f) => alerts.push(['bad', '끄기 후보: ' + h(f.media.name) + ' <code>' + h(f.content) + '</code> — ' + h(f.reason)]));
    if (planned > 0 && total.cost > planned * 1.1) alerts.push(['bad', '집행액이 계획보다 ' + pct(total.cost / planned - 1, 0) + ' 많습니다.']);

    const showPhase = phase || (today < P.start ? P.phases[0] : null);

    // 준비 단계 안내: 끝나지 않은 첫 단계를 「지금 할 일」로 보여 준다.
    const steps = Calc.flow();
    const curStep = steps.current;
    const setupHtml = '<div class="card nextcard">' +
      (curStep
        ? '<div class="next"><div class="what"><span class="small muted">지금 할 일 · 광고준비 ' + steps.prepDone + '/' + steps.prepTotal + ' 끝남</span><strong>' + h(curStep.t) + '</strong><span class="muted">' + h(curStep.goal) + '</span></div><a class="btn primary" href="' + curStep.href + '">' + h(curStep.cta) + ' →</a></div>'
        : '<div class="next"><div class="what"><span class="small muted">광고준비 ' + steps.prepDone + '/' + steps.prepTotal + ' 끝남</span><strong>준비가 끝났습니다</strong><span class="muted">12/1에 매체에서 광고를 켜고, 12/2부터 전날 성과를 입력합니다.</span></div></div>') + '</div>';
    const showStats = S().reports.length > 0 || today >= P.start;   // 집행 전에는 0뿐인 숫자를 감춘다

    const timeline = Array.from({ length: 31 }, (_, i) => {
      const d = Calc.addDays(P.start, i);
      const ph = Calc.phaseOf(d);
      return '<div class="ph-' + ph.id + (d === today ? ' today' : '') + '" title="' + md(d) + ' ' + ph.name + '">' + (i + 1) + '</div>';
    }).join('');

    const todo = prog.flatMap((p) => p.items.filter((i) => !S().checks[i.id]).map((i) => ({ i, sec: p.sec }))).slice(0, 6);

    return head(P.title, '2026-12-01 ~ 12-31 · 판촉비 ' + won(P.budget) + ' (VAT 별도) · ' + P.team.map((t) => h(t.role) + ' ' + h(t.name)).join(', ')) +
      setupHtml +
      alerts.map((a) => '<div class="notice ' + a[0] + '">' + a[1] + '</div>').join('') +
      (!showStats ? '' : '<div class="grid g4">' +
        '<div class="card stat"><div class="label">지금</div><div class="value">' + h(status) + '</div><div class="sub">' + h(statusSub) + '</div></div>' +
        '<div class="card stat"><div class="label">집행액</div><div class="value">' + won(total.cost) + '</div>' + bar(total.cost / P.budget, total.cost > P.budget ? 'over' : '') + '<div class="sub">예산의 ' + pct(total.cost / P.budget) + ' · 오늘까지 계획 ' + won(planned) + '</div></div>' +
        '<div class="card stat"><div class="label">첫 재생</div><div class="value">' + n(total.start) + '</div>' + bar(total.start / P.forecast.starts, 'ok') + '<div class="sub">예상 ' + n(P.forecast.starts) + '회의 ' + pct(total.start / P.forecast.starts) + '</div></div>' +
        '<div class="card stat"><div class="label">첫 재생당 비용</div><div class="value">' + won(total.cps) + '</div><div class="sub">제안서 가정 ' + won(P.forecast.costPerStart) + (total.cps ? ' · ' + (total.cps <= P.forecast.costPerStart ? '<span class="tag ok">가정보다 낮음</span>' : '<span class="tag warn">가정보다 높음</span>') : '') + '</div></div>' +
      '</div>' +
      '<div class="grid g4">' +
        '<div class="card stat"><div class="label">노출</div><div class="value">' + n(total.imp) + '</div><div class="sub">CPM ' + won(total.cpm) + '</div></div>' +
        '<div class="card stat"><div class="label">3화 시청</div><div class="value">' + n(total.ep3) + '</div><div class="sub">첫 재생의 ' + pct(total.ep3Rate) + '</div></div>' +
        '<div class="card stat"><div class="label">결제</div><div class="value">' + n(total.pay) + '</div><div class="sub">첫 재생의 ' + pct(total.payRate, 2) + '</div></div>' +
        '<div class="card stat"><div class="label">결제당 비용</div><div class="value">' + won(total.cpp) + '</div><div class="sub">매체를 끌 때 함께 본다</div></div>' +
      '</div>') +
      '<div class="card"><h2>바로가기 <a class="small" href="#/data" style="font-weight:400">계정 설정</a></h2>' +
        (Object.values(Calc.accounts()).some(Boolean) ? '' : '<div class="notice info">계정을 설정하면 바로가기가 원드라마 계정으로 열립니다. <a href="#/data">계정 설정</a></div>') +
        '<h3 style="margin-top:0">광고 등록·관리</h3><div class="actions">' + P.media.map((m) => '<a class="btn" href="' + h(Calc.adUrl(m)) + '" target="_blank" rel="noopener noreferrer" title="' + h(Calc.adAccount(m) || '계정 미설정') + '">' + dot(m) + h(m.name) + ' <span class="muted small">' + h(Calc.adAccount(m) || m.ad.name) + '</span> ↗</a>').join('') + '</div>' +
        '<h3>측정·확인</h3><div class="actions">' + P.tools.map((t) => ext(Calc.toolUrl(t), t.name)).join('') + '</div></div>' +
      '<div class="card"><h2>12월 일정</h2><div class="timeline">' + timeline + '</div>' +
        '<div class="small muted">' + P.phases.map((ph) => h(ph.name) + ' ' + md(ph.start) + '~' + md(ph.end) + ' (' + pct(ph.share, 0) + ')').join(' · ') + '</div></div>' +
      '<div>' +
        '<div class="card"><h2>' + (showPhase ? h(showPhase.name) + ' 기간 하루 예산' : '하루 예산') + '</h2>' +
          (showPhase ? '<table><tbody>' + P.media.map((m) => '<tr><td>' + dot(m) + h(m.name) + '</td><td class="num">' + won(Calc.daily(m.id, showPhase.id)) + '</td><td class="num">' + ext(Calc.adUrl(m), m.ad.name, 'sm') + '</td></tr>').join('') +
            '<tr class="total"><td>합계</td><td class="num">' + won(P.media.reduce((s, m) => s + Calc.daily(m.id, showPhase.id), 0)) + '</td><td></td></tr></tbody></table>' : '<div class="empty">집행이 끝났습니다</div>') +
        '</div>' +
      '</div>' +
      (showStats ? Views.mediaTable('매체별 성과', Calc.groupBy(S().reports, (r) => r.media)) : '');
  };

  // 매체별 성과 표 (대시보드와 리포트에서 같이 쓴다)
  Views.mediaTable = function (title, groups) {
    const rows = P.media.map((m) => {
      const g = groups.find((x) => x.key === m.id) || Calc.sum([]);
      const plan = Calc.plannedSpend(m.id);
      return '<tr><td>' + dot(m) + h(m.name) + '</td><td class="num">' + won(g.cost) + '</td><td style="min-width:90px">' + bar(g.cost / plan, g.cost > plan ? 'over' : '') + '</td>' +
        '<td class="num">' + n(g.imp) + '</td><td class="num">' + n(g.clk) + '</td><td class="num">' + n(g.start) + '</td><td class="num">' + won(g.cps) + '</td>' +
        '<td class="num">' + n(g.ep3) + '</td><td class="num">' + n(g.pay) + '</td><td class="num">' + won(g.cpp) + '</td></tr>';
    }).join('');
    return '<div class="card"><h2>' + h(title) + '</h2><div class="tablewrap"><table><thead><tr><th>매체</th><th class="num">집행액</th><th>계획 대비</th><th class="num">노출</th><th class="num">클릭</th><th class="num">첫 재생</th><th class="num">첫 재생당</th><th class="num">3화 시청</th><th class="num">결제</th><th class="num">결제당</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  };

  // ---------- 2. 체크리스트 ----------
  Views.checklist = function () {
    const checks = S().checks;
    const item = (i, custom) => '<label class="check' + (checks[i.id] ? ' done' : '') + '"><input type="checkbox" data-chg="toggleCheck" data-id="' + h(i.id) + '"' + (checks[i.id] ? ' checked' : '') + '>' +
      '<span class="t">' + h(i.text) + (i.link ? ' <a class="small" href="' + h(i.link) + '">바로가기</a>' : '') + '</span>' +
      (i.owner ? '<span class="tag">' + h(i.owner) + '</span>' : '') +
      (custom ? '<button class="ghost sm" data-act="delCheck" data-id="' + h(i.id) + '" title="지우기">✕</button>' : '') + '</label>';
    const prog = Calc.checklistProgress();
    const all = prog.reduce((a, p) => ({ done: a.done + p.done, total: a.total + p.total }), { done: 0, total: 0 });
    return head('체크리스트', '전체 ' + all.done + '/' + all.total + ' 완료', '<button data-act="printPage">인쇄</button>') +
      prog.map((p) => {
        const custom = S().customChecks.filter((c) => c.section === p.sec.id);
        return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>' + h(p.sec.name) + ' <span class="muted small">' + h(p.sec.period) + '</span></h2><span class="num">' + p.done + '/' + p.total + '</span></div>' +
          bar(p.total ? p.done / p.total : 0, 'ok') +
          p.sec.groups.map((g) => '<h3>' + h(g.name) + '</h3>' + g.items.map((i) => item(i)).join('')).join('') +
          (custom.length ? '<h3>추가한 항목</h3>' + custom.map((i) => item(i, true)).join('') : '') +
          '<form class="filters" style="margin:12px 0 0" data-submit="addCheck" data-section="' + h(p.sec.id) + '"><input type="search" name="text" placeholder="할 일 추가" aria-label="할 일 추가"><button>추가</button></form></div>';
      }).join('');
  };
  Actions.toggleCheck = (el) => Store.update((s) => { if (el.checked) s.checks[el.dataset.id] = true; else delete s.checks[el.dataset.id]; });
  Actions.addCheck = (form) => {
    const text = form.elements.text.value.trim();
    if (!text) return false;
    Store.update((s) => s.customChecks.push({ id: 'c' + Store.uid(), section: form.dataset.section, text }));
  };
  Actions.delCheck = (el) => withUndo('항목을 지웠습니다', (s) => {
    s.customChecks = s.customChecks.filter((c) => c.id !== el.dataset.id);
    delete s.checks[el.dataset.id];
  });
  Actions.printPage = () => { window.print(); return false; };

  // ---------- 3. 예산 ----------
  Views.budget = function () {
    const today = Calc.today();
    const cur = Calc.phaseOf(today);
    const byMedia = Calc.groupBy(S().reports, (r) => r.media);
    const planTotal = Calc.plannedTotal();
    const diff = planTotal - P.budget;
    const edited = Object.keys(S().settings.daily).length > 0;

    const dailyRows = P.media.map((m) => '<tr><td>' + dot(m) + h(m.name) + '</td>' +
      P.phases.map((ph) => '<td class="num' + (cur && cur.id === ph.id ? ' now' : '') + '"><input type="number" min="0" step="1000" style="width:104px" value="' + Calc.daily(m.id, ph.id) + '" data-chg="setDaily" data-media="' + m.id + '" data-phase="' + ph.id + '" aria-label="' + h(m.name + ' ' + ph.name + ' 하루 예산') + '"></td>').join('') +
      '<td class="num">' + won(Calc.plannedSpend(m.id)) + '</td><td class="num">' + won(m.budget) + '</td><td class="num">' + (Calc.plannedSpend(m.id) - m.budget === 0 ? '<span class="tag ok">맞음</span>' : '<span class="tag warn">' + (Calc.plannedSpend(m.id) > m.budget ? '+' : '') + n(Calc.plannedSpend(m.id) - m.budget) + '</span>') + '</td></tr>').join('');
    const dailyTotal = '<tr class="total"><td>합계</td>' + P.phases.map((ph) => '<td class="num' + (cur && cur.id === ph.id ? ' now' : '') + '">' + won(P.media.reduce((s, m) => s + Calc.daily(m.id, ph.id), 0)) + '</td>').join('') +
      '<td class="num">' + won(planTotal) + '</td><td class="num">' + won(P.budget) + '</td><td class="num">' + (diff === 0 ? '<span class="tag ok">맞음</span>' : '<span class="tag warn">' + (diff > 0 ? '+' : '') + n(diff) + '</span>') + '</td></tr>';

    const actualRows = P.media.map((m) => {
      const g = byMedia.find((x) => x.key === m.id) || Calc.sum([]);
      const until = Calc.plannedUntil(today, m.id);
      const left = m.budget - g.cost;
      return '<tr><td>' + dot(m) + h(m.name) + '</td><td class="num">' + won(m.budget) + '</td><td class="num">' + pct(m.budget / P.budget, 0) + '</td><td class="num">' + won(until) + '</td><td class="num">' + won(g.cost) + '</td><td style="min-width:120px">' + bar(g.cost / m.budget, g.cost > m.budget ? 'over' : '') + '</td><td class="num">' + won(left) + '</td></tr>';
    }).join('');
    const tot = Calc.sum(S().reports);

    const byPhase = P.phases.map((ph) => {
      const rows = S().reports.filter((r) => r.date >= ph.start && r.date <= ph.end);
      const plan = P.media.reduce((s, m) => s + Calc.daily(m.id, ph.id), 0) * Calc.phaseDays(ph);
      const g = Calc.sum(rows);
      return '<tr><td>' + h(ph.name) + ' <span class="muted small">' + md(ph.start) + '~' + md(ph.end) + ' · ' + Calc.phaseDays(ph) + '일</span></td><td class="num">' + won(plan) + '</td><td class="num">' + won(g.cost) + '</td><td style="min-width:120px">' + bar(plan ? g.cost / plan : 0, g.cost > plan ? 'over' : '') + '</td><td class="num">' + n(g.start) + '</td><td class="num">' + won(g.cps) + '</td></tr>';
    }).join('');

    return head('예산', '판촉비 ' + won(P.budget) + ' (VAT 별도) · VAT 포함 ' + won(P.budget * 1.1), edited ? '<button data-act="resetDaily">하루 예산 원래대로</button>' : '') +
      (diff !== 0 ? '<div class="notice warn">하루 예산 × 날짜 수의 합계가 예산보다 ' + won(Math.abs(diff)) + (diff > 0 ? ' 많습니다' : ' 적습니다') + '. 1,000원 단위 반올림 때문입니다. 아래 표에서 값을 고치면 바로 다시 계산합니다.</div>' : '<div class="notice ok">하루 예산 합계가 예산과 맞습니다.</div>') +
      '<div class="card"><h2>하루 예산 (매체에 넣는 값)</h2><div class="tablewrap"><table><thead><tr><th>매체</th>' +
        P.phases.map((ph) => '<th class="num' + (cur && cur.id === ph.id ? ' now' : '') + '">' + h(ph.name) + ' ' + md(ph.start) + '~' + md(ph.end) + '<br>' + Calc.phaseDays(ph) + '일</th>').join('') +
        '<th class="num">한 달 합계</th><th class="num">월 예산</th><th class="num">차이</th></tr></thead><tbody>' + dailyRows + dailyTotal + '</tbody></table></div>' +
        '<p class="small muted" style="margin-top:10px">시험이 끝나면 잘 되는 매체로 옮긴다. 고친 값은 대시보드와 계획 대비 계산에 바로 반영된다.</p></div>' +
      '<div class="card"><h2>매체별 계획과 집행</h2><div class="tablewrap"><table><thead><tr><th>매체</th><th class="num">월 예산</th><th class="num">비중</th><th class="num">오늘까지 계획</th><th class="num">집행액</th><th>월 예산 대비</th><th class="num">남은 예산</th></tr></thead><tbody>' + actualRows +
        '<tr class="total"><td>합계</td><td class="num">' + won(P.budget) + '</td><td class="num">100%</td><td class="num">' + won(Calc.plannedUntil(today)) + '</td><td class="num">' + won(tot.cost) + '</td><td>' + bar(tot.cost / P.budget) + '</td><td class="num">' + won(P.budget - tot.cost) + '</td></tr></tbody></table></div></div>' +
      '<div class="card"><h2>시기별 계획과 집행</h2><div class="tablewrap"><table><thead><tr><th>시기</th><th class="num">계획</th><th class="num">집행액</th><th>계획 대비</th><th class="num">첫 재생</th><th class="num">첫 재생당</th></tr></thead><tbody>' + byPhase + '</tbody></table></div></div>' +
      '<div class="card"><h2>매체 구성</h2><div class="tablewrap"><table><thead><tr><th>매체</th><th>상품</th><th>목적</th><th>타깃</th><th>과금</th><th>원드라마 계정</th><th>광고 등록</th></tr></thead><tbody>' +
        P.media.map((m) => '<tr><td>' + dot(m) + h(m.name) + '</td><td class="wrap">' + h(m.product) + '</td><td>' + h(m.goal) + '</td><td class="wrap">' + h(m.target) + '</td><td>' + h(m.billing) + '</td><td>' + (m.accounts ? m.accounts.map(h).join('<br>') : '<span class="muted">계정 없이 집행</span>') + '</td><td>' + ext(Calc.adUrl(m), m.ad.name, 'sm') + '</td></tr>').join('') + '</tbody></table></div><p class="small muted" style="margin-top:8px">메타와 유튜브 광고는 원드라마 계정 이름으로 나간다. 검색과 디스플레이는 연결할 SNS 계정이 없다. X(@ONEstoreDrama)는 광고 매체가 아니라 공식 계정 공유에만 쓴다.</p></div>';
  };
  Actions.setDaily = (el) => Store.update((s) => {
    const v = Math.max(0, Math.round(+el.value || 0));
    const m = el.dataset.media, ph = el.dataset.phase;
    s.settings.daily[m] = s.settings.daily[m] || {};
    if (v === Calc.media(m).daily[ph]) delete s.settings.daily[m][ph]; else s.settings.daily[m][ph] = v;
    if (!Object.keys(s.settings.daily[m]).length) delete s.settings.daily[m];
  });
  Actions.resetDaily = () => Store.update((s) => { s.settings.daily = {}; });

  // ---------- 4. 작품 ----------
  // 출연 배우·팬 채널 (js/cast-data.js, 웹 조사 결과). 없으면 빈 값.
  const CAST = window.CAST || {};
  const castOf = (title) => (CAST[title] || {}).cast || [];
  const hasFandom = (title) => castOf(title).some((c) => c.group || c.fanclub || hasFanLink(c));
  const castName = (c) => h(c.name) + (/추정/.test(c.role || '') ? '<span class="muted" title="메타에 주연·조연 구분이 없어 적힌 순서로 추정">*</span>' : '') + (c.group ? ' <span class="tag accent" title="' + h(c.group) + '">' + h(c.group.split(/[,(]/)[0].replace(/^\(전\)\s*/, '').trim()) + '</span>' : '');
  // 후보 목록의 출연 칸: 주연만 보여 준다. 조연은 「채널 보기」를 펼치면 나온다.
  const castNames = (title) => {
    const cs = castOf(title);
    const lead = cs.filter((c) => c.lead === '주연');
    const rest = cs.length - lead.length;
    if (!cs.length) return '';
    return (lead.length ? lead.map(castName).join(', ') : '<span class="muted small">주연 정보 없음</span>') + (rest ? ' <span class="muted small" title="조연·특별출연">외 ' + rest + '명</span>' : '');
  };
  const FAN_LABELS = ['다음 팬카페', '네이버 팬카페', '팬카페', '위버스', '프롬', '패니콘', '공식 사이트'];
  const hasFanLink = (c) => (c.links || []).some((l) => FAN_LABELS.includes(l[0]));
  const castLinks = (c) => (c.links || []).filter((l) => /^https?:\/\//.test(l[1]))
    .map((l) => '<a class="chip' + (FAN_LABELS.includes(l[0]) ? ' fan' : '') + '" href="' + h(l[1]) + '" target="_blank" rel="noopener noreferrer" title="' + h(l[1]) + '">' + h(l[0]) + '</a>').join(' ');
  // 작품 하나의 배우·채널 표 (후보 목록에서 펼쳐 보는 용도)
  const castDetail = (title) => '<table class="inner"><thead><tr><th>배우</th><th>배역</th><th>구분</th><th>그룹</th><th>팬클럽</th><th>공식 채널 · 팬카페 · 공식 사이트</th><th>출처</th></tr></thead><tbody>' +
    castOf(title).map((c) => '<tr><td>' + h(c.name) + '</td><td>' + h(c.character || '') + '</td><td>' + h(c.role || '') + '</td><td class="wrap">' + h(c.group || '') + '</td><td class="wrap">' + h(c.fanclub || '') + '</td><td class="wrap">' + (castLinks(c) || '<span class="muted small">없음</span>') + '</td><td>' + (c.source === 'CP 메타' ? '<span class="tag ok">CP 메타</span>' : '<span class="tag warn">웹 조사</span>') + '</td></tr>').join('') + '</tbody></table>';
  const CONF_KO = { high: '높음', medium: '보통', low: '낮음' };
  // 출시일 (최초 공개일. 세로본능 작품은 원작 개봉·방영일)
  const RELEASE = window.RELEASE || {};
  const relOf = (title) => RELEASE[title] || null;
  const isOrig = (r) => (r.k || '').indexOf('원작') === 0;
  const relCell = (title) => {
    const r = relOf(title);
    if (!r) return '<span class="muted small">–</span>';
    return '<span title="' + h((r.k || '최초 공개일') + (r.p ? ' · ' + r.p : '') + ' · 확신도 ' + (CONF_KO[r.c] || '–')) + '">' + h(r.d) + (isOrig(r) ? ' <span class="tag">원작</span>' : '') + (r.c === 'low' ? ' <span class="tag warn">불확실</span>' : '') + '</span>';
  };
  const isNew26 = (title) => { const r = relOf(title); return !!r && r.d.slice(0, 4) === '2026' && !isOrig(r); };

  Views.works = function () {
    const f = ui.works;
    const picked = S().works;
    const pickedTitles = new Set(picked.map((w) => w.cp + '|' + w.title));
    const cands = WORKS_DATA.filter((w) => w.cand);
    const dupTitles = new Set(WORKS_DATA.map((w) => w.title).filter((t, i, a) => a.indexOf(t) !== i));
    const cps = [...new Set(cands.map((w) => w.cp))];
    const genres = [...new Set(cands.map((w) => w.genre))];
    const q = f.q.trim().toLowerCase();
    const list = cands.filter((w) => (!q || w.title.toLowerCase().includes(q) || castOf(w.title).some((c) => (c.name + ' ' + (c.group || '')).toLowerCase().includes(q))) && (!f.fan || hasFandom(w.title)) && (!f.new26 || isNew26(w.title)) && (!f.cp || w.cp === f.cp) && (!f.genre || w.genre === f.genre) && (!f.trailer || w.trailer) && (!f.free3 || (w.free || 0) >= 3) && (!f.rec || P.recommended[w.title]));
    if (f.sort === 'new') list.sort((a, b) => ((relOf(b.title) || {}).d || '').localeCompare((relOf(a.title) || {}).d || ''));
    const full = picked.length >= 5;
    const recRows = Object.keys(P.recommended).map((title) => {
      const w = WORKS_DATA.find((x) => x.title === title) || {};
      const on = picked.some((x) => x.title === title);
      return '<tr><td>' + h(title) + '</td><td>' + h(w.cp || '') + '</td><td class="wrap">' + h(P.recommended[title]) + '</td><td>' +
        (w.cand ? '<span class="tag ok">광고 가능</span>' : '<span class="tag bad">' + h(w.status || '목록에 없음') + '</span>') + '</td><td class="num">' +
        (on ? '<span class="tag accent">고름</span>' : w.cand ? '<button class="sm" data-act="pickWork" data-cp="' + h(w.cp) + '" data-title="' + h(title) + '"' + (full ? ' disabled' : '') + '>고르기</button>' : '<span class="small muted">공개 여부 확인 필요</span>') + '</td></tr>';
    }).join('');

    const pickedHtml = picked.length ? '<div class="tablewrap"><table><thead><tr><th>코드</th><th>작품</th><th>CP</th><th>출시일</th><th class="num">회차</th><th class="num">무료</th><th>랜딩 주소 (1화 재생 화면, 자동 입력)</th><th></th></tr></thead><tbody>' +
      picked.map((w) => {
        const d = WORKS_DATA.find((x) => x.title === w.title && x.cp === w.cp) || {};
        return '<tr><td><code>' + h(w.code) + '</code></td><td>' + h(w.title) + (dupTitles.has(w.title) ? ' <span class="tag warn" title="다른 CP에도 같은 제목이 있습니다. 권리 확인 필요">제목 중복</span>' : '') + '</td><td>' + h(w.cp) + '</td><td>' + relCell(w.title) + '</td><td class="num">' + n(d.eps) + '</td><td class="num">' + (d.free == null ? '<span class="tag warn">미정</span>' : d.free + ((d.free || 0) < 3 ? ' <span class="tag warn" title="3화 시청이 곧 결제입니다">3화 유료</span>' : '')) + '</td>' +
          '<td><input type="url" style="width:100%;min-width:260px" placeholder="' + P.site + '/..." value="' + h(w.url || '') + '" data-chg="setWorkUrl" data-code="' + h(w.code) + '" aria-label="' + h(w.title) + ' 랜딩 주소"></td>' +
          '<td><button class="ghost sm" data-act="unpickWork" data-code="' + h(w.code) + '">빼기</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">아직 고른 작품이 없습니다. 아래 목록에서 3~5편을 골라 주세요.</div>';

    // 고른 작품의 출연 배우와 팬 채널
    const castRows = picked.flatMap((w) => castOf(w.title).map((c) => '<tr><td><code>' + h(w.code) + '</code> ' + h(w.title) + '</td><td>' + h(c.name) + '</td><td>' + h(c.role || '') + '</td><td class="wrap">' + h(c.group || '') + '</td><td class="wrap">' + h(c.fanclub || '') + '</td><td class="wrap">' + (castLinks(c) || '<span class="muted small">없음</span>') + '</td><td>' + (c.source === 'CP 메타' ? '<span class="tag ok">CP 메타</span>' : '<span class="tag warn">웹 조사</span>') + '</td></tr>'));
    const castHtml = picked.length ? '<div class="card"><h2>고른 작품의 출연 배우·팬 채널</h2>' +
      (castRows.length ? '<div class="tablewrap"><table><thead><tr><th>작품</th><th>배우</th><th>구분</th><th>그룹</th><th>팬클럽</th><th>공식 채널 · 팬카페 · 공식 사이트</th><th>출처</th></tr></thead><tbody>' + castRows.join('') + '</tbody></table></div>' : '<div class="empty">고른 작품의 출연 배우를 아직 확인하지 못했습니다.</div>') +
      '<p class="small muted" style="margin-top:8px">「CP 메타」는 CP가 납품한 메타 파일의 출연진과 계정이다. 「웹 조사」는 웹에서 찾은 것이라 쓰기 전에 확인한다. 그룹·팬클럽·팬카페는 모두 웹 조사로 덧붙인 값이다. 전체 목록은 원드라마_출연배우_팬채널.xlsx 에 있다.</p></div>' : '';

    return head('작품', '광고 후보 ' + cands.length + '편 (상용 등록, 청불 제외) 중 3~5편을 고른다. CP 홍보 허락 범위는 따로 확인한다.') +
      '<div class="card"><h2>광고할 작품 <span class="tag ' + (picked.length >= 3 ? 'ok' : 'warn') + '">' + picked.length + ' / 3~5편</span></h2>' + pickedHtml +
        (picked.length < 5 ? '<p style="margin:12px 0 0"><button class="primary" data-act="autoPick">' + (picked.length < 3 ? '추천 조합으로 채우기' : '추천작 1편 더 고르기') + '</button> <span class="small muted">CP 추천, 팬덤, 신작, 예고편, 무료 3화 이상을 기준으로 자동으로 고릅니다. 마음에 안 들면 빼면 됩니다.</span></p>' : '') + '</div>' +
      castHtml +
      '<div class="card"><h2 style="margin:0"><button class="fold" data-act="toggleRec" aria-expanded="' + !!f.recOpen + '"><span class="fold-mark" aria-hidden="true">' + (f.recOpen ? '▾' : '▸') + '</span> CP 추천 작품 <span class="muted small">스튜디오지니 11/17, 쇼박스 11/19 회신 · ' + Object.keys(P.recommended).length + '편</span></button></h2>' +
        (!f.recOpen ? '</div>' : '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>작품</th><th>CP</th><th>추천 이유·쓸 소재</th><th>상태</th><th></th></tr></thead><tbody>' + recRows + '</tbody></table></div>' +
        '<p class="small muted" style="margin-top:8px">스튜디오지니 작품은 무료 회차를, 쇼박스 작품은 예고편과 스틸 이미지를 홍보에 써도 된다. 공개 보류 작품은 지금 광고할 수 없다.</p></div>') +
      '<div class="card"><h2>후보 목록 <span class="muted small" id="worksCount">' + list.length + '편</span></h2>' +
        '<div class="filters"><input type="search" id="worksQ" placeholder="작품명·배우 검색" value="' + h(f.q) + '" data-inp="filterWorks" data-key="q" aria-label="작품명·배우 검색">' +
          '<select data-chg="filterWorks" data-key="cp" aria-label="CP">' + opt('', 'CP 전체', f.cp) + cps.map((c) => opt(c, c, f.cp)).join('') + '</select>' +
          '<select data-chg="filterWorks" data-key="genre" aria-label="장르">' + opt('', '장르 전체', f.genre) + genres.map((c) => opt(c, c, f.genre)).join('') + '</select>' +
          '<label><input type="checkbox" data-chg="filterWorks" data-key="trailer"' + (f.trailer ? ' checked' : '') + '> 예고편 있음</label>' +
          '<label><input type="checkbox" data-chg="filterWorks" data-key="free3"' + (f.free3 ? ' checked' : '') + '> 무료 3화 이상</label>' +
          '<label><input type="checkbox" data-chg="filterWorks" data-key="rec"' + (f.rec ? ' checked' : '') + '> CP 추천</label>' +
          '<label><input type="checkbox" data-chg="filterWorks" data-key="fan"' + (f.fan ? ' checked' : '') + '> 팬덤 있는 출연자</label>' +
          '<label><input type="checkbox" data-chg="filterWorks" data-key="new26"' + (f.new26 ? ' checked' : '') + '> 2026년 신작</label>' +
          '<select data-chg="filterWorks" data-key="sort" aria-label="정렬">' + opt('', '목록 순서', f.sort) + opt('new', '출시일 최신순', f.sort) + '</select></div>' +
        '<div class="tablewrap" style="max-height:520px;overflow-y:auto"><table><thead style="position:sticky;top:0"><tr><th>작품</th><th>CP</th><th>장르</th><th>등급</th><th class="num">회차</th><th class="num">무료</th><th>예고편</th><th>출시일</th><th>주연</th><th></th></tr></thead><tbody>' +
          (list.length ? list.map((w) => {
            const on = pickedTitles.has(w.cp + '|' + w.title);
            return '<tr><td>' + h(w.title) + (P.recommended[w.title] ? ' <span class="tag accent" title="' + h(P.recommended[w.title]) + '">CP 추천</span>' : '') + '</td><td>' + h(w.cp) + '</td><td>' + h(w.genre) + '</td><td>' + h(w.rating) + '</td><td class="num">' + n(w.eps) + '</td><td class="num">' + (w.free == null ? '–' : w.free) + '</td><td>' + (w.trailer ? '<span class="tag ok">있음</span>' : '') + '</td><td>' + relCell(w.title) + '</td><td class="wrap" style="min-width:200px">' + (castNames(w.title) ? castNames(w.title) + ' <button class="link-btn" data-act="toggleCast" data-title="' + h(w.title) + '" aria-expanded="' + (f.open === w.title) + '">' + (f.open === w.title ? '접기' : '채널 보기') + '</button>' : '<span class="muted small">–</span>') + '</td>' +
              '<td class="num">' + (on ? '<span class="tag accent">고름</span>' : '<button class="sm" data-act="pickWork" data-cp="' + h(w.cp) + '" data-title="' + h(w.title) + '"' + (full ? ' disabled title="5편까지 고를 수 있습니다"' : '') + '>고르기</button>') + '</td></tr>' +
              (f.open === w.title ? '<tr class="detail-row"><td colspan="10">' + castDetail(w.title) + '</td></tr>' : '');
          }).join('') : '<tr><td colspan="10" class="empty">조건에 맞는 작품이 없습니다</td></tr>') +
        '</tbody></table></div></div>';
  };
  Actions.toggleRec = () => { ui.works.recOpen = !ui.works.recOpen; };
  Actions.toggleCast = (el) => { ui.works.open = ui.works.open === el.dataset.title ? '' : el.dataset.title; };
  Actions.filterWorks = (el) => { ui.works[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value; };
  Actions.pickWork = (el) => Store.update((s) => {
    if (s.works.length >= 5) return;
    const w = { code: Calc.newCode(s, el.dataset.cp, el.dataset.title), title: el.dataset.title, cp: el.dataset.cp, url: (window.LANDING || {})[el.dataset.cp + '|' + el.dataset.title] || '' };
    s.works.push(w);
    window.Playbook.fillTags(s, w);   // 소재 내용을 추천대로 미리 채운다
  });
  Actions.unpickWork = (el) => {
    const code = el.dataset.code;
    withUndo(code + ' 작품을 뺐습니다', (s) => { s.works = s.works.filter((w) => w.code !== code); });
  };
  Actions.setWorkUrl = (el) => {
    const v = el.value.trim();
    if (v && !/^https?:\/\//.test(v)) { toast('http:// 또는 https:// 로 시작하는 주소를 넣어 주세요'); return; }
    Store.update((s) => { s.works.find((w) => w.code === el.dataset.code).url = v; });
  };

  // ---------- 5. 소재 ----------
  Views.creatives = function () {
    const works = S().works;
    if (!works.length) return head('소재', '작품 1편당 8종') + '<div class="card empty">먼저 <a href="#/works">작품</a>을 골라 주세요.</div>';
    const all = works.flatMap((w) => Calc.creativeIds(w.code).map((id) => (S().creatives[w.code + '_' + id] || {}).status || P.creativeStatuses[0]));
    const counts = P.creativeStatuses.map((st) => [st, all.filter((x) => x === st).length]);
    const stCls = { '요청 전': '', '제작 중': 'warn', '검수 중': 'warn', '집행 중': 'ok', '꺼짐': 'bad' };

    const as = window.Assets.summary();
    return head('소재', '작품 ' + works.length + '편 · 소재 ' + all.length + '종 · 담당 마스. 매주 효율이 낮은 2종을 빼고 새 2종을 넣는다.') +
      '<div class="notice info">소재가 오면 작품 칸으로 끌어다 놓으세요. 길이·비율·크기를 자동으로 검사하고 상태를 「검수 중」으로 바꿉니다. 올린 파일 ' + as.n + '개 · ' + as.text + (as.bad ? ' · <strong>규격 확인 ' + as.bad + '개</strong>' : '') + '. 소재가 없으면 원본 영상(1화·예고편)을 넣고 「빈 칸 자동으로 만들기」를 누르세요. 원드라마 홍보영상 형식(위쪽 제목·로고, 끝 화면 문구)으로 잘라 넣습니다. 넣은 파일은 ▶로 재생하고 「수정」으로 고칩니다. 파일은 이 브라우저에만 보관됩니다.</div>' +
      '<div class="grid" style="grid-template-columns:repeat(' + counts.length + ',minmax(0,1fr))">' + counts.map((c) => '<div class="card stat"><div class="label">' + h(c[0]) + '</div><div class="value">' + c[1] + '</div></div>').join('') + '</div>' +
      works.map((w) => {
        const ids = Calc.creativeIds(w.code);
        return '<div class="card" data-dropwork="' + h(w.code) + '"><h2><code>' + h(w.code) + '</code> ' + h(w.title) + '</h2>' +
          '<p class="dropzone">이 작품의 소재 파일을 여기로 한꺼번에 끌어다 놓으세요. 파일 이름에 소재 번호(예: v15a)가 있으면 그 칸에, 없으면 길이·비율이 맞는 빈 칸에 넣습니다. 「작품 폴더 고르기」로 작품 폴더를 고르면 예고편·자막·포스터를 알아서 골라내고, 거기서 잘라 만듭니다. 특정 칸에 넣으려면 그 줄 위에 놓습니다.</p>' +
          window.Maker.sourceRow(w.code) +
          '<div class="tablewrap"><table><thead><tr><th>번호</th><th>종류</th><th>비율·크기</th><th>쓰는 곳</th><th>파일</th><th>내용</th><th>상태</th><th>검수</th><th>메모</th><th></th></tr></thead><tbody>' +
          ids.map((id) => {
            const t = P.creativeTypes.find((c) => c.id === id);
            const key = w.code + '_' + id;
            const c = S().creatives[key] || {};
            const qc = c.qc || [];
            const qcDone = P.qcItems.filter((_, i) => qc[i]).length;
            const open = ui.openQc[key];
            return '<tr data-drop="' + h(key) + '"><td><code>' + h(key) + '</code></td><td>' + h(t ? t.name : '추가 소재') + '</td><td>' + h(t ? t.spec : '–') + '</td><td>' + h(t ? t.use : '–') + '</td><td class="wrap" style="min-width:190px">' + window.Assets.cell(key) + '</td>' +
              '<td><select data-chg="setCreative" data-key="' + h(key) + '" data-field="tag" aria-label="' + h(key) + ' 내용">' + opt('', '(미정)', c.tag || '') + P.contentTags.map((t2) => opt(t2, t2, c.tag || '')).join('') + '</select></td>' +
              '<td><select data-chg="setCreative" data-key="' + h(key) + '" data-field="status" aria-label="' + h(key) + ' 상태">' + P.creativeStatuses.map((st) => opt(st, st, c.status || P.creativeStatuses[0])).join('') + '</select> <span class="tag ' + stCls[c.status || '요청 전'] + '">' + h(c.status || '요청 전') + '</span></td>' +
              '<td><button class="sm" data-act="toggleQc" data-key="' + h(key) + '">' + qcDone + '/' + P.qcItems.length + (qcDone === P.qcItems.length ? ' ✓' : '') + '</button></td>' +
              '<td><input type="text" style="width:100%;min-width:140px" value="' + h(c.note || '') + '" data-chg="setCreative" data-key="' + h(key) + '" data-field="note" placeholder="메모" aria-label="' + h(key) + ' 메모"></td>' +
              '<td>' + (t ? '' : '<button class="ghost sm" data-act="delCreative" data-code="' + h(w.code) + '" data-id="' + h(id) + '">✕</button>') + '</td></tr>' +
              (open ? '<tr><td></td><td colspan="9">' + P.qcItems.map((q, i) => '<label class="check"><input type="checkbox" data-chg="setQc" data-key="' + h(key) + '" data-i="' + i + '"' + (qc[i] ? ' checked' : '') + '><span class="t">' + h(q) + '</span></label>').join('') + '</td></tr>' : '');
          }).join('') + '</tbody></table></div>' +
          '<form class="filters" style="margin:12px 0 0" data-submit="addCreative" data-code="' + h(w.code) + '"><input name="id" placeholder="새 소재 번호 (예: v15c, im03, bn02)" pattern="(v|im|bn)[a-z0-9]{1,6}" style="flex:0 1 280px" aria-label="새 소재 번호"><button>소재 추가</button><span class="small muted">v=영상, im=이미지, bn=배너</span></form></div>';
      }).join('') +
      (window.Connect ? window.Connect.igPanel() : '') +
      '<div class="card"><h2>검수 기준</h2>' + P.qcItems.map((q) => '<div class="check"><span class="t">' + h(q) + '</span></div>').join('') + '<p class="small muted" style="margin-top:8px">NAS 원본은 옮기거나 지우지 않고 복사해서 작업한다. 예고편은 「04. 예고편」, 포스터는 「03. 포스터」 폴더.</p></div>';
  };
  Actions.setCreative = (el) => Store.update((s) => {
    const c = (s.creatives[el.dataset.key] = s.creatives[el.dataset.key] || {});
    c[el.dataset.field] = el.value;
  });
  Actions.setQc = (el) => Store.update((s) => {
    const c = (s.creatives[el.dataset.key] = s.creatives[el.dataset.key] || {});
    c.qc = c.qc || [];
    c.qc[+el.dataset.i] = el.checked;
  });
  Actions.toggleQc = (el) => { ui.openQc[el.dataset.key] = !ui.openQc[el.dataset.key]; };
  Actions.addCreative = (form) => {
    const id = form.elements.id.value.trim();
    const code = form.dataset.code;
    if (!/^(v|im|bn)[a-z0-9]{1,6}$/.test(id)) { toast('v, im, bn 으로 시작하는 영어 소문자·숫자로 넣어 주세요'); return false; }
    if (Calc.creativeIds(code).includes(id)) { toast('이미 있는 번호입니다'); return false; }
    Store.update((s) => { (s.extraCreatives[code] = s.extraCreatives[code] || []).push(id); });
  };
  Actions.delCreative = (el) => withUndo('소재를 지웠습니다', (s) => {
    const code = el.dataset.code;
    s.extraCreatives[code] = (s.extraCreatives[code] || []).filter((x) => x !== el.dataset.id);
    delete s.creatives[code + '_' + el.dataset.id];
  });

  // ---------- 6. 링크 ----------
  Views.links = function () {
    const works = S().works;
    const links = Calc.allLinks().filter((l) => !ui.links.media || l.media.id === ui.links.media);
    const noUrl = works.filter((w) => !w.url);
    const sameMedium = Calc.ytMedium() === 'paid_social';

    const nameRows = P.media.map((m) => '<tr><td>' + dot(m) + h(m.name) + '</td><td><code>' + P.campaign + '_' + m.id + '</code></td><td><code>' + P.campaign + '_' + m.id + '_' + m.placements[0] + '_작품ID</code></td><td><code>' + (m.search ? (m.creatives.includes('title') ? '작품ID_title' : m.creatives[0]) : '작품ID_' + m.creatives[0]) + '</code></td><td><code>' + m.source + '</code></td><td><code>' + Calc.mediumOf(m) + '</code></td></tr>').join('');

    return head('링크 태그 (utm)', '위키 「유입 링크 태그 규칙 — 숏드라마」(651924478)를 따른다. 영어 소문자, 숫자, 밑줄만 쓴다.',
      '<button data-act="copyAllLinks">전체 복사</button><button data-act="csvLinks">CSV 내려받기</button>') +
      (noUrl.length ? '<div class="notice warn">랜딩 주소가 없는 작품이 있어 링크를 만들지 못했습니다: ' + noUrl.map((w) => h(w.code + ' ' + w.title)).join(', ') + '. <a href="#/works">주소 넣기</a></div>' : '') +
      (!works.length ? '<div class="notice warn">작품을 고르면 작품별 링크가 만들어집니다. <a href="#/works">작품 고르기</a></div>' : '') +
      '<div class="card"><h2>규칙</h2><dl class="kv">' +
        '<dt>campaign</dt><dd><code>' + P.campaign + '</code> 하나로 둔다. 시기가 바뀌어도 그대로 두고 소재로 나눠 본다.</dd>' +
        '<dt>content</dt><dd>영상·이미지·배너는 <code>작품코드_소재번호</code> (예: <code>작품ID_v15a</code>). 작품코드는 원드라마 작품 ID를 소문자로 쓴다. 화면에는 끝 4글자만 보인다. 검색은 키워드 묶음 (<code>brand</code>, <code>genre</code>, <code>w01_title</code>).</dd>' +
        '<dt>유튜브 medium</dt><dd><select data-chg="setYtMedium" aria-label="유튜브 medium">' + opt('paid_video', 'paid_video (메타와 분리, 기본)', Calc.ytMedium()) + opt('paid_social', 'paid_social (메타와 합쳐 보기)', Calc.ytMedium()) + '</select> ' +
          (sameMedium ? '<span class="small muted">메타와 같은 값이라 GA4에서는 source로만 나뉜다.</span>' : '<span class="tag warn">위키 표에 없는 값. 쓰기 전에 표에 추가하고 GA4 담당에게 알린다.</span>') + '</dd>' +
        '<dt>위키에 없는 값</dt><dd><code>paid_search</code>, <code>display</code>는 위키 표에 한 줄 더하고 GA4 담당(윤현정 님)께 알린 뒤 쓴다.</dd>' +
      '</dl></div>' +
      '<div class="card"><h2>이름 규칙</h2><div class="tablewrap"><table><thead><tr><th>매체</th><th>캠페인 이름</th><th>광고 세트·그룹 이름 (예)</th><th>광고 이름 = content (예)</th><th>source</th><th>medium</th></tr></thead><tbody>' + nameRows + '</tbody></table></div>' +
        '<p class="small muted" style="margin-top:8px">광고 이름을 utm content와 똑같이 두면 매체 리포트와 GA4를 소재 단위로 바로 맞춰 볼 수 있다.</p></div>' +
      '<div class="card"><h2>링크 목록 <span class="muted small">' + links.length + '개</span></h2>' +
        '<div class="filters"><select data-chg="filterLinks" aria-label="매체">' + opt('', '매체 전체', ui.links.media) + P.media.map((m) => opt(m.id, m.name, ui.links.media)).join('') + '</select>' +
        '<span class="small muted">메타 「URL 매개변수」와 구글 애즈 「최종 URL 접미사」에는 꼬리표만, 네이버 「연결 URL」에는 전체 링크를 넣는다.</span></div>' +
        '<div class="tablewrap"><table><thead><tr><th>매체</th><th>작품</th><th>content</th><th>소재</th><th>링크</th><th></th></tr></thead><tbody>' +
        (links.length ? links.map((l, i) => '<tr><td>' + dot(l.media) + h(l.media.name) + '</td><td>' + (l.work ? '<code>' + h(l.work.code) + '</code> ' + h(l.work.title) : '<span class="muted">공통</span>') + '</td><td><code>' + h(l.content) + '</code></td><td>' + h(l.label) + '</td>' +
          '<td class="linkcell mono" title="' + h(l.url) + '">' + (l.url ? h(l.url) : '<span class="tag warn">랜딩 주소 없음</span>') + '</td>' +
          '<td style="white-space:nowrap">' + (l.url ? '<button class="sm" data-act="copyLink" data-i="' + i + '" data-kind="url">링크</button> ' : '') + '<button class="sm" data-act="copyLink" data-i="' + i + '" data-kind="suffix">꼬리표</button></td></tr>').join('') : '<tr><td colspan="6" class="empty">만들 링크가 없습니다</td></tr>') +
        '</tbody></table></div></div>';
  };
  const visibleLinks = () => Calc.allLinks().filter((l) => !ui.links.media || l.media.id === ui.links.media);
  Actions.filterLinks = (el) => { ui.links.media = el.value; };
  Actions.setYtMedium = (el) => Store.update((s) => { s.settings.ytMedium = el.value; s.settings.ytMediumSet = true; });
  Actions.copyLink = (el) => { const l = visibleLinks()[+el.dataset.i]; copy(l[el.dataset.kind], l.content + ' 복사했습니다'); return false; };
  Actions.copyAllLinks = () => { const ls = visibleLinks().filter((l) => l.url); if (!ls.length) { toast('복사할 링크가 없습니다'); return false; } copy(ls.map((l) => l.url).join('\n'), ls.length + '개 링크를 복사했습니다'); return false; };
  Actions.csvLinks = () => {
    const rows = [['매체', '작품코드', '작품', 'source', 'medium', 'campaign', 'content', '소재', '링크', '꼬리표']]
      .concat(visibleLinks().map((l) => [l.media.name, l.work ? l.work.code : '', l.work ? l.work.title : '', l.media.source, Calc.mediumOf(l.media), P.campaign, l.content, l.label, l.url, l.suffix]));
    download('원드라마_utm_링크.csv', toCsv(rows));
    return false;
  };

  // ---------- 7. 성과 리포트 ----------
  const metricHead = '<th class="num">집행액</th><th class="num">노출</th><th class="num">클릭</th><th class="num">CTR</th><th class="num">첫 재생</th><th class="num">첫 재생당</th><th class="num">3화 시청</th><th class="num">결제</th><th class="num">결제당</th>';
  const metricCells = (g) => '<td class="num">' + won(g.cost) + '</td><td class="num">' + n(g.imp) + '</td><td class="num">' + n(g.clk) + '</td><td class="num">' + pct(g.ctr, 2) + '</td><td class="num">' + n(g.start) + '</td><td class="num">' + won(g.cps) + '</td><td class="num">' + n(g.ep3) + '</td><td class="num">' + n(g.pay) + '</td><td class="num">' + won(g.cpp) + '</td>';

  function formCreativeOptions() {
    const f = ui.form;
    const m = Calc.media(f.media);
    if (m.search) return m.creatives.map((id) => [id, P.keywordGroups.find((k) => k.id === id).name]);
    const ids = f.work ? Calc.mediaCreatives(m, f.work) : m.creatives;
    return ids.map((id) => { const t = P.creativeTypes.find((c) => c.id === id); return [id, id + (t ? ' ' + t.name : '')]; });
  }

  Views.report = function () {
    const f = ui.form;
    const r = ui.report;
    const today = Calc.today();
    if (!f.date) f.date = today > P.end ? P.end : (today < P.start ? P.start : Calc.addDays(today, -1) < P.start ? P.start : Calc.addDays(today, -1));
    const m = Calc.media(f.media);
    const cOpts = formCreativeOptions();
    if (!cOpts.some((o) => o[0] === f.creative)) f.creative = cOpts[0] ? cOpts[0][0] : '';
    const works = S().works;
    const needWork = !m.search || f.creative === 'title';
    const numField = (key, label) => '<label class="field">' + label + '<input type="number" inputmode="numeric" id="f_' + key + '" min="0" step="1" value="' + h(f[key]) + '" data-inp="formField" data-key="' + key + '"></label>';

    const rows = S().reports.filter((x) => (!r.from || x.date >= r.from) && (!r.to || x.date <= r.to) && (!r.media || x.media === r.media));
    const total = Calc.sum(rows);
    const flags = Calc.killFlags();
    const flagKeys = new Set(flags.map((x) => x.media.id + '|' + x.content));

    const tabs = [['media', '매체별'], ['creative', '소재별'], ['work', '작품별'], ['date', '날짜별'], ['week', '주간'], ['raw', '입력 기록']];
    let table = '';
    if (r.tab === 'media') {
      const gs = Calc.groupBy(rows, (x) => x.media);
      table = '<table><thead><tr><th>매체</th>' + metricHead + '</tr></thead><tbody>' + P.media.map((mm) => '<tr><td>' + dot(mm) + h(mm.name) + '</td>' + metricCells(gs.find((g) => g.key === mm.id) || Calc.sum([])) + '</tr>').join('') + '<tr class="total"><td>합계</td>' + metricCells(total) + '</tr></tbody></table>';
    } else if (r.tab === 'creative') {
      const gs = Calc.groupBy(rows, (x) => x.media + '|' + Calc.contentOf(x)).sort((a, b) => (a.cps == null) - (b.cps == null) || a.cps - b.cps);
      table = '<table><thead><tr><th>매체</th><th>소재 (content)</th>' + metricHead + '<th></th></tr></thead><tbody>' + (gs.length ? gs.map((g) => { const k = g.key.split('|'); const mm = Calc.media(k[0]); return '<tr><td>' + dot(mm) + h(mm.name) + '</td><td><code>' + h(k[1]) + '</code></td>' + metricCells(g) + '<td>' + (flagKeys.has(g.key) ? '<span class="tag bad">끄기 후보</span>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="12" class="empty">기록이 없습니다</td></tr>') + '</tbody></table>';
    } else if (r.tab === 'work') {
      const gs = Calc.groupBy(rows.filter((x) => x.work), (x) => x.work);
      table = '<table><thead><tr><th>작품</th>' + metricHead + '</tr></thead><tbody>' + (gs.length ? gs.map((g) => { const w = works.find((x) => x.code === g.key); return '<tr><td><code>' + h(g.key) + '</code> ' + h(w ? w.title : '') + '</td>' + metricCells(g) + '</tr>'; }).join('') : '<tr><td colspan="10" class="empty">기록이 없습니다</td></tr>') + '</tbody></table>';
    } else if (r.tab === 'date' || r.tab === 'week') {
      const gs = Calc.groupBy(rows, (x) => (r.tab === 'date' ? x.date : Calc.weekOf(x.date))).sort((a, b) => (a.rows[0].date < b.rows[0].date ? -1 : 1));
      table = '<table><thead><tr><th>' + (r.tab === 'date' ? '날짜' : '주') + '</th>' + metricHead + '</tr></thead><tbody>' + (gs.length ? gs.map((g) => '<tr><td>' + h(r.tab === 'date' ? g.key + ' ' + (Calc.phaseOf(g.key) ? Calc.phaseOf(g.key).name : '') : g.key) + '</td>' + metricCells(g) + '</tr>').join('') + '<tr class="total"><td>합계</td>' + metricCells(total) + '</tr>' : '<tr><td colspan="10" class="empty">기록이 없습니다</td></tr>') + '</tbody></table>';
    } else {
      const sorted = rows.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      table = '<table><thead><tr><th>날짜</th><th>매체</th><th>소재</th><th class="num">집행액</th><th class="num">노출</th><th class="num">클릭</th><th class="num">첫 재생</th><th class="num">3화 시청</th><th class="num">결제</th><th></th></tr></thead><tbody>' + (sorted.length ? sorted.map((x) => { const mm = Calc.media(x.media); return '<tr><td>' + h(x.date) + '</td><td>' + dot(mm) + h(mm.name) + '</td><td><code>' + h(Calc.contentOf(x)) + '</code></td><td class="num">' + won(x.cost) + '</td><td class="num">' + n(x.imp) + '</td><td class="num">' + n(x.clk) + '</td><td class="num">' + n(x.start) + '</td><td class="num">' + n(x.ep3) + '</td><td class="num">' + n(x.pay) + '</td><td><button class="ghost sm" data-act="delReport" data-id="' + h(x.id) + '" title="지우기">✕</button></td></tr>'; }).join('') : '<tr><td colspan="10" class="empty">기록이 없습니다</td></tr>') + '</tbody></table>';
    }

    return head('성과 리포트', '매일 전날 매체·소재별 성과를 넣는다. 노출·클릭·비용은 매체 화면에서, 첫 재생·3화 시청·결제는 GA4에서 가져온다.',
      '<button data-act="csvReport">CSV 내려받기</button><button data-act="printPage">인쇄</button>') +
      flags.map((x) => '<div class="notice bad">끄기 후보: ' + h(x.media.name) + ' <code>' + h(x.content) + '</code> — ' + h(x.reason) + '</div>').join('') +
      '<div class="card"><h2>성과 입력</h2><form data-submit="addReport"><div class="form">' +
        '<label class="field">날짜<input type="date" min="' + P.start + '" max="' + P.end + '" value="' + h(f.date) + '" data-inp="formField" data-key="date" required></label>' +
        '<label class="field">매체<select data-chg="formSelect" data-key="media">' + P.media.map((mm) => opt(mm.id, mm.name, f.media)).join('') + '</select></label>' +
        '<label class="field">작품<select data-chg="formSelect" data-key="work"' + (needWork ? '' : ' disabled') + '>' + (needWork ? '' : opt('', '공통', '')) + (works.length ? works.map((w) => opt(w.code, w.code + ' ' + w.title, f.work)).join('') : opt('', '작품을 먼저 고르세요', '')) + '</select></label>' +
        '<label class="field">' + (m.search ? '키워드 묶음' : '소재') + '<select data-chg="formSelect" data-key="creative">' + cOpts.map((o) => opt(o[0], o[1], f.creative)).join('') + '</select></label>' +
        numField('cost', '집행액(원)') + numField('imp', '노출') + numField('clk', '클릭') + numField('start', '첫 재생') + numField('ep3', '3화 시청') + numField('pay', '결제') +
        '<button class="primary">기록 추가</button></div></form>' +
        '<div class="actions" style="margin-top:12px"><span class="small muted">숫자 가져올 곳</span>' + ext(Calc.adUrl(m), m.name + ' · ' + m.ad.name, 'sm') + ext(Calc.toolUrl(P.tools[0]), 'GA4', 'sm') + '</div>' +
        '<details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">여러 줄 한꺼번에 붙여 넣기 (CSV)</summary><p class="small muted" style="margin-top:8px">한 줄에 <code>날짜,매체,작품코드,소재,집행액,노출,클릭,첫재생,3화시청,결제</code> 순서. 매체는 meta, youtube, naver, gsearch, gdn. 엑셀에서 복사한 탭 구분도 된다.</p>' +
        '<form data-submit="importCsv"><textarea name="csv" rows="4" style="width:100%" placeholder="2026-12-01,meta,작품코드,v15a,22000,5200,140,96,31,2" aria-label="CSV 붙여 넣기"></textarea><div style="margin-top:6px"><button>붙여 넣은 줄 추가</button></div></form></details></div>' +
      '<div class="card"><div class="filters">' +
        '<div class="seg" role="tablist" aria-label="집계 기준">' + tabs.map((t) => '<button role="tab" aria-selected="' + (r.tab === t[0]) + '" class="' + (r.tab === t[0] ? 'on' : '') + '" data-act="reportTab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
        '<span style="flex:1"></span>' +
        '<input type="date" value="' + h(r.from) + '" data-chg="reportFilter" data-key="from" aria-label="시작일"> ~ <input type="date" value="' + h(r.to) + '" data-chg="reportFilter" data-key="to" aria-label="종료일">' +
        '<select data-chg="reportFilter" data-key="media" aria-label="매체">' + opt('', '매체 전체', r.media) + P.media.map((mm) => opt(mm.id, mm.name, r.media)).join('') + '</select></div>' +
        '<div class="tablewrap">' + table + '</div>' +
        '<p class="small muted" style="margin-top:10px">끄는 기준(잠정): ' + P.killRule.zeroDays + '일 동안 첫 재생 없음, 또는 첫 재생당 비용이 검색을 뺀 평균의 ' + P.killRule.costMultiple + '배 초과(첫 재생 10회 이상일 때). 검색 광고에는 2배 기준을 쓰지 않는다.</p></div>';
  };
  Actions.formField = (el) => { ui.form[el.dataset.key] = el.value; return false; };
  Actions.formSelect = (el) => { ui.form[el.dataset.key] = el.value; };
  Actions.reportTab = (el) => { ui.report.tab = el.dataset.tab; };
  Actions.reportFilter = (el) => { ui.report[el.dataset.key] = el.value; };
  Actions.addReport = () => {
    const f = ui.form;
    const m = Calc.media(f.media);
    const needWork = !m.search || f.creative === 'title';
    const work = needWork ? (f.work || (S().works[0] || {}).code || '') : '';
    if (needWork && !work) { toast('작품을 먼저 골라 주세요'); return false; }
    if (!f.date || f.date < P.start || f.date > P.end) { toast('12월 1일~31일 사이 날짜를 넣어 주세요'); return false; }
    if (!f.creative) { toast('소재를 골라 주세요'); return false; }
    const num = (k) => Math.max(0, Math.round(+f[k] || 0));
    if (!num('cost') && !num('imp')) { toast('집행액이나 노출을 넣어 주세요'); return false; }
    Store.update((s) => s.reports.push({ id: Store.uid(), date: f.date, media: f.media, work, creative: f.creative, imp: num('imp'), clk: num('clk'), start: num('start'), ep3: num('ep3'), pay: num('pay'), cost: num('cost') }));
    ['imp', 'clk', 'start', 'ep3', 'pay', 'cost'].forEach((k) => { f[k] = ''; });
    toast('기록을 추가했습니다');
    setTimeout(() => { const el = document.getElementById('f_cost'); if (el) el.focus(); }, 0);
  };
  Actions.importCsv = (form) => {
    const lines = form.elements.csv.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const add = [];
    const bad = [];
    lines.forEach((line, i) => {
      const c = line.split(/[\t,]/).map((x) => x.trim());
      if (i === 0 && !/^\d{4}-\d{2}-\d{2}$/.test(c[0])) return; // 제목 줄
      const m = P.media.find((x) => x.id === c[1] || x.name === c[1]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0]) || c[0] < P.start || c[0] > P.end || !m || !/^[a-z0-9_]+$/.test(c[3] || '') || (c[2] && !/^w\d{2}$/.test(c[2]))) { bad.push(i + 1); return; }
      const num = (j) => Math.max(0, Math.round(+String(c[j] || '').replace(/[^\d.]/g, '') || 0));
      add.push({ id: Store.uid(), date: c[0], media: m.id, work: c[2] || '', creative: c[3], cost: num(4), imp: num(5), clk: num(6), start: num(7), ep3: num(8), pay: num(9) });
    });
    if (!add.length) { toast(bad.length ? '읽을 수 있는 줄이 없습니다 (' + bad.join(', ') + '번째 줄 확인)' : '붙여 넣은 내용이 없습니다'); return false; }
    Store.update((s) => { s.reports = s.reports.concat(add); });
    toast(add.length + '줄 추가' + (bad.length ? ', ' + bad.length + '줄 건너뜀 (' + bad.join(', ') + '번째)' : ''));
  };
  Actions.delReport = (el) => withUndo('기록을 지웠습니다', (s) => { s.reports = s.reports.filter((x) => x.id !== el.dataset.id); });
  Actions.csvReport = () => {
    const rows = [['날짜', '시기', '매체', '작품코드', '소재', 'content', '집행액', '노출', '클릭', '첫재생', '3화시청', '결제']]
      .concat(S().reports.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) => [x.date, (Calc.phaseOf(x.date) || {}).name || '', Calc.media(x.media).name, x.work, x.creative, Calc.contentOf(x), x.cost, x.imp, x.clk, x.start, x.ep3, x.pay]));
    download('원드라마_성과_' + Calc.today() + '.csv', toCsv(rows));
    return false;
  };

  // ---------- 8. 운영 가이드 ----------
  Views.guide = function () {
    const kv = (rows) => '<dl class="kv">' + rows.map((r) => '<dt>' + h(r[0]) + '</dt><dd>' + h(r[1]) + '</dd>').join('') + '</dl>';
    return head('운영 가이드', '운영 기준, 매체별 메모, 용어') +
      '<div class="grid g2"><div class="card"><h2>운영 기준</h2>' + kv(P.rules) + '</div>' +
      '<div class="card"><h2>담당</h2>' + kv(P.team.map((t) => [t.role, t.name])) +
        '<h3>예상 성과 (참고)</h3>' + kv([['노출', n(P.forecast.impressions) + '회'], ['첫 재생', n(P.forecast.starts) + '회 (노출의 3%)'], ['첫 재생당 비용', won(P.forecast.costPerStart)]]) +
        '<p class="small muted" style="margin-top:8px">대행사 제안서 가정에서 낸 값이라 실제와 다를 수 있다. 목표는 시험 기간 결과를 보고 정한다.</p></div></div>' +
      '<div class="card"><h2>매체별 메모</h2>' + kv(P.mediaNotes) + '</div>' +
      '<div class="grid g2"><div class="card"><h2>CP별 소재 사용 범위</h2>' + kv(P.cpNotes) + '</div>' +
      '<div class="card"><h2>공식 SNS 연계 (사업TF)</h2>' + kv(P.sns.support) + '<h3>원드라마 계정</h3><div class="actions">' + P.sns.accounts.map((a) => ext(a[2], a[0] + ' ' + a[1])).join('') + '</div><h3>원스토어 공식 계정</h3><div class="actions">' + P.sns.onestore.map((a) => ext(a[2], a[0] + ' ' + a[1])).join('') + '</div>' + '</div></div>' +
      '<div class="card"><h2>아직 정하지 않은 것</h2>' + P.openQuestions.map((q) => '<div class="check"><span class="t">' + h(q) + '</span></div>').join('') + '</div>' +
      '<div class="card"><h2>용어</h2>' + kv(P.glossary) + '</div>';
  };

  // ---------- 9. 데이터 ----------
  Views.data = function () {
    const s = S();
    return head('데이터', '모든 내용은 이 브라우저에만 저장된다. 다른 사람과 나누거나 다른 컴퓨터로 옮기려면 파일로 내보낸다.') +
      '<div class="card"><h2>지금 저장된 내용</h2>' +
        '<dl class="kv"><dt>체크한 항목</dt><dd>' + Object.keys(s.checks).length + '개</dd><dt>고른 작품</dt><dd>' + s.works.length + '편</dd><dt>성과 기록</dt><dd>' + s.reports.length + '줄</dd></dl></div>' +
      '<div class="card"><h2>바로가기 계정</h2><p class="small muted">여기에 넣은 계정으로 바로가기가 열린다. 이 브라우저에만 저장되고 GitHub에는 올라가지 않는다. 비밀번호는 넣지 않는다. 로그인은 각 사이트에서 하고, 비밀번호는 브라우저의 비밀번호 저장 기능에 맡긴다.</p>' +
        '<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">' +
        [['googleEmail', '구글 로그인 이메일 (구글 애즈, GA4)', 'email', 'name@example.com'], ['ga4Prop', 'GA4 속성 ID (숫자)', 'text', '123456789'], ['metaAct', '메타 광고 계정 ID (숫자)', 'text', '1234567890'], ['metaBiz', '메타 비즈니스 ID (숫자, 선택)', 'text', ''], ['naverId', '네이버 광고 로그인 아이디 (표시용)', 'text', '']]
          .map((f) => '<label class="field">' + f[1] + '<input type="' + f[2] + '" value="' + h(Calc.accounts()[f[0]] || '') + '" placeholder="' + f[3] + '" data-chg="setAccount" data-key="' + f[0] + '" autocomplete="off"></label>').join('') + '</div>' +
        '<h3>지금 연결되는 주소</h3><div class="tablewrap"><table><tbody>' + P.media.map((m) => '<tr><td>' + dot(m) + h(m.name) + '</td><td>' + (Calc.adAccount(m) ? h(Calc.adAccount(m)) : '<span class="tag warn">계정 미설정</span>') + '</td><td class="linkcell mono">' + h(Calc.adUrl(m)) + '</td></tr>').join('') +
          '<tr><td>GA4</td><td>' + (Calc.accounts().googleEmail ? h(Calc.accounts().googleEmail) : '<span class="tag warn">계정 미설정</span>') + '</td><td class="linkcell mono">' + h(Calc.toolUrl(P.tools[0])) + '</td></tr></tbody></table></div>' +
        '<p class="small muted" style="margin-top:8px">구글은 그 이메일로 로그인되어 있으면 바로 열리고, 아니면 이메일이 채워진 로그인 화면이 뜬다. 메타는 지정한 광고 계정이 선택된 채로 열린다(로그인은 권한 있는 개인 페이스북 계정). 네이버는 주소로 계정을 지정할 수 없어 아이디만 버튼에 보여 준다.</p></div>' +
      '<div class="card"><h2>내보내기·가져오기</h2><div class="actions">' +
        '<button class="primary" data-act="exportJson">백업 파일 내려받기</button>' +
        '<label class="btn">백업 파일 가져오기<input type="file" accept="application/json,.json" data-chg="importJson" hidden></label></div>' +
        '<p class="small muted" style="margin-top:10px">가져오면 지금 내용을 덮어쓴다.</p></div>' +
      '<div class="card"><h2>연습용</h2><div class="actions"><button data-act="loadSample">예시 데이터 넣기</button><button data-act="resetAll">전부 지우기</button></div>' +
        '<p class="small muted" style="margin-top:10px">예시 데이터는 작품 3편과 12/1~5 가상 성과를 넣는다. 지금 내용을 덮어쓴다.</p></div>';
  };
  Actions.setAccount = (el) => {
    const key = el.dataset.key;
    let v = el.value.trim();
    if (key === 'googleEmail' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast('이메일 형식이 아닙니다'); return; }
    if (['ga4Prop', 'metaAct', 'metaBiz'].includes(key)) {
      v = v.replace(/^act_/, '');
      if (v && !/^\d+$/.test(v)) { toast('숫자만 넣어 주세요'); return; }
    }
    Store.update((s) => { s.settings.accounts = s.settings.accounts || {}; if (v) s.settings.accounts[key] = v; else delete s.settings.accounts[key]; });
    toast('저장했습니다');
  };
  Actions.exportJson = () => { download('원드라마_광고집행_백업_' + Calc.today() + '.json', JSON.stringify(S(), null, 2), 'application/json'); return false; };
  Actions.importJson = (el) => {
    const file = el.files[0];
    if (!file) return false;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result).replace(/^﻿/, ''));
        if (!data || data.v !== 1 || !Array.isArray(data.reports)) throw new Error('형식');
        if (!confirm('지금 내용을 덮어쓸까요?')) return;
        Store.replace(data);
        toast('가져왔습니다');
      } catch (e) { toast('백업 파일을 읽지 못했습니다'); }
    };
    reader.readAsText(file);
    return false;
  };
  Actions.resetAll = () => { if (!confirm('저장된 내용을 전부 지울까요? 되돌릴 수 없습니다.')) return false; Store.reset(); toast('지웠습니다'); };
  Actions.loadSample = () => {
    if (S().reports.length + S().works.length && !confirm('지금 내용을 예시 데이터로 덮어쓸까요?')) return false;
    const cands = WORKS_DATA.filter((w) => w.cand && w.trailer && (w.free || 0) >= 3).slice(0, 3);
    const works = cands.map((w, i) => ({ code: 'w0' + (i + 1), title: w.title, cp: w.cp, url: P.site + '/series/' + (1001 + i) }));
    const reports = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let d = 0; d < 5; d++) {
      const date = Calc.addDays(P.start, d);
      P.media.forEach((m) => {
        const ids = m.search ? m.creatives : m.creatives.slice(0, 2);
        const targets = m.search ? ids.map((id) => [id === 'title' ? 'w01' : '', id]) : works.flatMap((w) => ids.map((id) => [w.code, id]));
        const each = m.daily.test / targets.length;
        targets.forEach(([work, id], k) => {
          const cost = Math.round(each * (0.85 + rnd() * 0.3));
          const cpm = m.search ? 40000 : m.id === 'gdn' ? 3500 : 9000 + rnd() * 5000;
          const imp = Math.round((cost / cpm) * 1000);
          const dud = m.id === 'meta' && work === 'w03' && id === 'v15b';
          const start = dud ? 0 : Math.round(cost / ((m.search ? 250 : 380) * (0.7 + rnd() * 0.9 + (k % 3 === 2 ? 0.9 : 0))));
          reports.push({ id: Store.uid(), date, media: m.id, work, creative: id, imp, clk: Math.round(start * (1.3 + rnd())), start, ep3: Math.round(start * (0.25 + rnd() * 0.15)), pay: Math.round(start * (m.search ? 0.05 : 0.015) * (0.5 + rnd())), cost });
        });
      });
    }
    const tagBy = { v06: '예고편', v15a: '갈등·반전', v15b: '설렘·로맨스', v30a: '예고편', v60a: '예고편', im01: '배우 중심', im02: '명대사' };
    const creatives = {};
    works.forEach((w) => Object.keys(tagBy).forEach((id) => { creatives[w.code + '_' + id] = { tag: tagBy[id], status: '집행 중' }; }));
    Store.replace({ v: 1, checks: { p01: true, p03: true }, customChecks: [], works, creatives, extraCreatives: {}, reports, settings: { ytMedium: 'paid_video', ytMediumSet: true, daily: {}, accounts: Calc.accounts() } });
    toast('예시 데이터를 넣었습니다');
  };

  window.Views = Views;
  window.Actions = Actions;
  window.toast = toast;
  window.UI = { h, n, won, pct, md, bar, dot, head, opt, ext, toast, busy, download, toCsv, copy };
})();
