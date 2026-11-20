// 소속사 연락: 출연 배우의 소속사에 초상 사용 확인, 태그·공유 협조를 메일이나 공식 계정으로 요청한다.
// 이 사이트가 직접 보내지는 않는다. 문안을 만들어 메일 앱을 열거나 복사해 주고, 보내는 것은 사람이 한다.
// 연락처·진행 상태·보내는 사람은 이 브라우저에만 저장한다 (레포에 올리지 않는다).
(function () {
  const P = window.PLAN;
  const { h, copy, toast } = window.UI;
  const S = () => Store.state;
  const CAST = window.CAST || {};
  const STATUS = ['연락 전', '보냄', '회신 받음', '허락', '거절', '보류'];
  const ST_TAG = { '보냄': 'accent', '회신 받음': 'accent', '허락': 'ok', '거절': 'warn', '보류': 'warn' };
  const ASKS = [
    ['portrait', '광고에 배우 이름·얼굴 사용 확인'],
    ['tag', '공식 계정 게시물에 배우 계정 태그'],
    ['share', '배우·소속사 계정에서 게시물 공유'],
  ];

  const plain = (name) => name.replace(/\s*\(.*$/, '');
  const insta = (c) => { const l = (c.links || []).find((x) => /instagram\.com\//i.test(x[1])); return l ? l[1] : ''; };
  const handle = (url) => { const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(url || ''); return m ? '@' + m[1].replace(/\.$/, '') : ''; };
  const okUrl = (u) => /^https?:\/\//i.test(u || '');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // 조사 자료의 소속사 칸은 「이름(출처·메모)」 꼴이다. 이름과 메모를 나눈다.
  function parseAgency(raw) {
    raw = String(raw || '').trim();
    if (!raw) return { name: '', note: '' };
    const m = /^([^(（]+)[(（](.*?)[)）]?\s*$/.exec(raw);
    const name = (m ? m[1] : raw).split(' / ')[0].trim();
    return { name: /^무소속/.test(name) ? '' : name, free: /^무소속/.test(name), note: m ? m[2].trim() : '' };
  }

  // 작품의 출연자를 소속사별로 묶는다. 소속사를 모르거나 무소속이면 배우에게 직접 연락하는 줄이 된다.
  function rows(w) {
    const s = S();
    const cast = (CAST[w.title] || {}).cast || [];
    const by = {}, out = [];
    cast.forEach((c) => {
      const nm = plain(c.name), ck = w.title + '|' + nm;
      const typed = ((s.castAgency || {})[ck] || '').trim();
      const a = typed ? { name: typed, note: '', typed: true } : parseAgency(c.agency);
      const actor = { name: nm, insta: insta(c), ck };
      if (a.name) {
        let r = by[a.name];
        if (!r) { r = by[a.name] = { key: a.name, label: a.name, actors: [], notes: [], typed: [] }; out.push(r); }
        r.actors.push(actor);
        if (a.note && !r.notes.includes(a.note)) r.notes.push(a.note);
        if (a.typed) r.typed.push(ck);
      } else {
        out.push({ key: '@' + nm, direct: true, free: !!a.free, label: a.free ? '무소속' : '', actors: [actor], notes: a.note ? [a.note] : [], typed: [] });
      }
    });
    return out;
  }
  const contactOf = (r) => {
    const c = (S().agencies || {})[r.key] || {};
    return { email: c.email || '', account: c.account || (r.direct ? r.actors[0].insta : '') };
  };
  const logOf = (w, r) => (S().outreach || {})[w.code + '|' + r.key] || {};

  // ---------- 문안 ----------
  function draft(w, r, asks, sender) {
    const names = r.actors.map((a) => a.name);
    const who = names.join(', ') + ' 배우';
    const tags = r.actors.map((a) => handle(a.insta)).filter(Boolean).join(' ');
    const st = P.start.split('-');
    const dl = new Date(P.start + 'T00:00:00'); dl.setDate(dl.getDate() - 4);
    const due = dl > new Date() ? (dl.getMonth() + 1) + '월 ' + dl.getDate() + '일까지' : '';
    const me = sender || '[이름·소속·연락처]';
    const list = [];
    if (asks.portrait) list.push('광고 소재(예고편, 본편 일부, 포스터)에 배우의 이름과 얼굴이 나오는 데 문제가 없는지 확인 부탁드립니다.');
    if (asks.tag) list.push('원드라마(' + P.sns.accounts[0][1] + ')와 원스토어(' + P.sns.onestore[0][1] + ') 공식 인스타그램 게시물에 배우 계정' + (tags ? '(' + tags + ')' : '') + '을 태그해도 되는지 확인 부탁드립니다.');
    if (asks.share) list.push('가능하다면 배우 또는 소속사 공식 계정에서 해당 게시물을 공유해 주시면 감사하겠습니다.');
    const what = asks.portrait ? '초상 사용 확인' : asks.tag ? '계정 태그 확인' : '게시물 공유';
    const subject = '[원스토어 원드라마] 「' + w.title + '」 12월 광고 관련 ' + names.join(', ') + ' 배우 ' + what + ' 요청';
    const body = [
      '안녕하세요' + (r.direct ? ', ' + names[0] + ' 배우님.' : ', ' + r.label + ' 담당자님.'),
      '원스토어의 숏드라마 서비스 「원드라마」(drama.onestore.co.kr) 광고를 맡고 있는 ' + me + '입니다.',
      '',
      '원드라마에서 서비스 중인 「' + w.title + '」(' + w.cp + ' 제공)을 ' + st[0] + '년 ' + (+st[1]) + '월 ' + (+st[2]) + '일부터 12월 31일까지 메타(인스타그램·페이스북), 유튜브, 네이버, 구글에 광고할 예정입니다.',
      (r.direct ? '출연하신 작품이라 ' : '이 작품에 출연한 ' + who + '와 관련해 ') + '아래 내용을 확인·요청드립니다.',
      '',
      list.map((x, i) => (list.length > 1 ? (i + 1) + '. ' : '') + x).join('\n'),
      '',
      '광고에는 CP사에서 받은 홍보용 소재만 쓰며, 사용 범위에 조건이 있으면 알려 주시는 대로 따르겠습니다.',
      due ? '집행 준비 일정상 ' + due + ' 회신 주시면 감사하겠습니다.' : '집행이 임박해 가능한 한 빨리 회신 주시면 감사하겠습니다.',
      '',
      '감사합니다.',
      me,
    ].join('\n');
    return { subject, body };
  }

  // ---------- 작품별 계획 화면에 넣는 칸 ----------
  function section(w) {
    const rs = rows(w);
    if (!rs.length) return '';
    const s = S();
    const tr = rs.map((r) => {
      const c = contactOf(r), lg = logOf(w, r), st = lg.status || '연락 전';
      const agency = r.direct
        ? (r.free ? '<span class="tag">무소속</span> <span class="muted small">배우에게 직접</span>'
          : '<input type="text" class="or-in" placeholder="소속사 이름 입력" aria-label="' + h(r.actors[0].name) + ' 소속사" data-chg="orAgency" data-k="' + h(r.actors[0].ck) + '">')
        : h(r.label) + (r.typed.length ? ' <button class="link-btn" data-act="orAgencyClear" data-k="' + h(r.typed.join('\n')) + '" title="직접 입력한 소속사 지우기">✕</button>' : '') +
          (r.notes.length ? '<br><span class="small muted">' + h(r.notes.join(' · ')) + '</span>' : '');
      const contact = [
        c.email ? '<a class="chip" href="mailto:' + h(encodeURIComponent(c.email).replace(/%40/g, '@')) + '">' + h(c.email) + '</a>' : '',
        okUrl(c.account) ? '<a class="chip" href="' + h(c.account) + '" target="_blank" rel="noopener noreferrer">' + (handle(c.account) ? h(handle(c.account)) : '공식 계정') + '</a>' : '',
      ].join('') || '<span class="muted small">없음</span>';
      return '<tr><td class="wrap">' + agency + '</td><td class="wrap">' + h(r.actors.map((a) => a.name).join(', ')) + '</td><td class="wrap">' + contact + '</td>' +
        '<td><span class="tag ' + (ST_TAG[st] || '') + '">' + h(st) + '</span>' + (lg.date ? '<br><span class="small muted">' + h(lg.date) + '</span>' : '') + '</td>' +
        '<td><button class="sm" data-act="orOpen" data-code="' + h(w.code) + '" data-k="' + h(r.key) + '">연락하기</button></td></tr>';
    }).join('');
    const n = rs.filter((r) => logOf(w, r).status && logOf(w, r).status !== '연락 전').length;
    return '<h3>소속사 연락 <span class="muted" style="font-weight:400">' + n + '/' + rs.length + '곳 연락함</span></h3>' +
      '<table class="inner"><thead><tr><th>소속사</th><th>배우</th><th>연락처</th><th>상태</th><th></th></tr></thead><tbody>' + tr + '</tbody></table>' +
      '<p class="small muted" style="margin:6px 0 0">초상 사용권은 출연 계약으로 CP가 갖고 있는 경우가 많다. CP 메타의 초상권 문구를 먼저 보고, 문구가 없거나 협의가 필요한 배우부터 연락한다.' +
      (s.settings.sender ? '' : ' 보내는 사람은 「연락하기」 창에서 한 번 적어 두면 계속 쓴다.') + '</p>';
  }

  Actions.orAgency = (el) => { Store.update((s) => { (s.castAgency = s.castAgency || {})[el.dataset.k] = el.value.trim(); }); };
  Actions.orAgencyClear = (el) => { Store.update((s) => { el.dataset.k.split('\n').forEach((k) => { delete (s.castAgency || {})[k]; }); }); };

  // ---------- 연락하기 창 ----------
  Actions.orOpen = (el) => {
    const w = S().works.find((x) => x.code === el.dataset.code);
    const r = w && rows(w).find((x) => x.key === el.dataset.k);
    if (!r) return false;
    const lk = w.code + '|' + r.key;
    const c = contactOf(r), lg = logOf(w, r);
    const asks = Object.assign({ portrait: true, tag: true, share: false }, lg.asks || {});
    const d0 = lg.subject ? { subject: lg.subject, body: lg.body } : draft(w, r, asks, S().settings.sender);
    const title = r.direct ? r.actors[0].name + ' 배우' : r.label;
    const find = 'https://www.google.com/search?q=' + encodeURIComponent((r.direct ? r.actors[0].name + ' 배우 소속사' : r.label) + ' 공식 문의 이메일 인스타그램');
    const box = document.createElement('dialog');
    box.className = 'maker-run outreach';
    box.innerHTML = '<h3>' + h(title) + '에 연락 <span class="muted small" style="font-weight:400">「' + h(w.title) + '」 ' + h(r.actors.map((a) => a.name).join(', ')) + '</span></h3>' +
      '<div class="or-grid">' +
        '<label class="mf"><span>메일 주소</span><input type="text" data-f="email" inputmode="email" autocomplete="off" placeholder="contact@example.com" value="' + h(c.email) + '"></label>' +
        '<label class="mf"><span>공식 계정 주소 (인스타그램 등)</span><input type="text" data-f="account" autocomplete="off" placeholder="https://www.instagram.com/…" value="' + h(c.account) + '"></label>' +
      '</div>' +
      '<p class="small muted" style="margin:4px 0 10px">연락처를 모르면 <a href="' + h(find) + '" target="_blank" rel="noopener noreferrer">검색해서 찾기 ↗</a>. 소속사 홈페이지의 문의 메일이나 공식 인스타그램을 적는다.</p>' +
      '<div class="or-asks">' + ASKS.map((a) => '<label><input type="checkbox" data-ask="' + a[0] + '"' + (asks[a[0]] ? ' checked' : '') + '> ' + a[1] + '</label>').join('') + '</div>' +
      '<label class="mf"><span>보내는 사람 (이름·소속·연락처. 한 번 적으면 계속 쓴다)</span><input type="text" data-f="sender" autocomplete="off" placeholder="원스토어 ○○팀 홍길동 (메일, 전화)" value="' + h(S().settings.sender || '') + '"></label>' +
      '<label class="mf"><span>제목</span><input type="text" data-f="subject" value="' + h(d0.subject) + '"></label>' +
      '<label class="mf"><span>본문 (고쳐 써도 된다)</span><textarea data-f="body" rows="13">' + h(d0.body) + '</textarea></label>' +
      '<div class="row"><button class="primary" data-x="mail">메일 앱으로 열기</button><button data-x="dm">본문 복사하고 공식 계정 열기</button><button data-x="copy">제목·본문 복사</button><button class="link-btn" data-x="reset">문안 처음으로</button></div>' +
      '<div class="or-grid" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">' +
        '<label class="mf"><span>진행 상태</span><select data-f="status">' + STATUS.map((x) => '<option' + (x === (lg.status || '연락 전') ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
        '<label class="mf"><span>메모 (회신 내용, 조건)</span><input type="text" data-f="note" value="' + h(lg.note || '') + '"></label>' +
      '</div>' +
      '<div class="row" style="justify-content:flex-end;margin-top:12px"><button data-x="close">닫기</button></div>';
    document.body.appendChild(box);
    const q = (f) => box.querySelector('[data-f=' + f + ']');
    const x = (n) => box.querySelector('[data-x=' + n + ']');
    let edited = !!lg.subject;
    const readAsks = () => { box.querySelectorAll('[data-ask]').forEach((e) => { asks[e.dataset.ask] = e.checked; }); };
    const redraft = () => { const d = draft(w, r, asks, q('sender').value.trim()); q('subject').value = d.subject; q('body').value = d.body; edited = false; };
    const sync = () => {
      const email = q('email').value.trim(), account = q('account').value.trim();
      x('mail').disabled = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      x('dm').disabled = !okUrl(account);
    };
    // 닫을 때 한 번에 저장한다. 문안은 손으로 고쳤을 때만 남긴다.
    const save = () => {
      readAsks();
      Store.update((s) => {
        const email = q('email').value.trim(), account = q('account').value.trim();
        s.agencies = s.agencies || {};
        if (email || (account && account !== (r.direct ? r.actors[0].insta : ''))) s.agencies[r.key] = { email, account }; else delete s.agencies[r.key];
        s.settings.sender = q('sender').value.trim();
        const status = q('status').value, note = q('note').value.trim();
        const o = { status, note, asks: Object.assign({}, asks), date: status === '연락 전' ? '' : (lg.status === status && lg.date) || today() };
        if (edited) { o.subject = q('subject').value; o.body = q('body').value; }
        s.outreach = s.outreach || {};
        if (status === '연락 전' && !note && !edited && asks.portrait && asks.tag && !asks.share) delete s.outreach[lk]; else s.outreach[lk] = o;
      });
    };
    box.addEventListener('input', (ev) => {
      const f = ev.target.dataset.f;
      if (f === 'subject' || f === 'body') edited = true;
      if (f === 'email' || f === 'account') sync();
    });
    box.addEventListener('change', (ev) => {
      if (ev.target.dataset.ask) {
        readAsks();
        if (!asks.portrait && !asks.tag && !asks.share) { ev.target.checked = true; readAsks(); toast('요청할 내용을 하나는 골라야 합니다'); return; }
        if (edited && !confirm('요청 내용을 바꾸면 고쳐 쓴 문안이 새로 만들어집니다. 바꿀까요?')) { ev.target.checked = !ev.target.checked; readAsks(); return; }
        redraft();
      }
      if (ev.target.dataset.f === 'sender' && !edited) redraft();
    });
    const sent = () => { if (q('status').value === '연락 전') toast('보낸 뒤에는 진행 상태를 「보냄」으로 바꿔 주세요'); };
    x('mail').onclick = () => {
      const to = encodeURIComponent(q('email').value.trim()).replace(/%40/g, '@');
      const sub = encodeURIComponent(q('subject').value), body = encodeURIComponent(q('body').value.replace(/\n/g, '\r\n'));
      // 주소가 너무 길면 메일 앱이 본문을 잘라 먹는다. 그럴 때는 제목만 넘기고 본문은 복사해 준다.
      const full = 'mailto:' + to + '?subject=' + sub + '&body=' + body;
      if (full.length <= 1900) { location.href = full; sent(); }
      else { copy(q('body').value, '본문이 길어 복사해 두었습니다. 열린 메일에 붙여 넣어 주세요'); location.href = 'mailto:' + to + '?subject=' + sub; }
    };
    x('dm').onclick = () => { copy(q('body').value, '본문을 복사했습니다. 열린 계정의 메시지에 붙여 넣어 주세요'); window.open(q('account').value.trim(), '_blank', 'noopener,noreferrer'); };
    x('copy').onclick = () => copy(q('subject').value + '\n\n' + q('body').value, '제목과 본문을 복사했습니다');
    x('reset').onclick = () => { if (!edited || confirm('고쳐 쓴 문안을 지우고 처음 문안으로 되돌릴까요?')) redraft(); };
    x('close').onclick = () => box.close();
    box.addEventListener('close', () => { save(); box.remove(); window.App.render(true); });
    sync();
    box.showModal();
    return false;
  };

  window.Outreach = { section, rows, draft, parseAgency };
})();
