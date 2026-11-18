// 분석·추천: 입력한 성과를 매체·형식·내용·작품·장르로 나눠 비교하고 추천을 만든다.
// 표본이 적은 묶음은 순위에서 빼고 「표본 부족」으로 표시한다.
(function () {
  const P = window.PLAN;
  const { h, n, won, pct, md, dot, head, opt, toast } = window.UI;
  const S = () => Store.state;
  const MIN = { cost: 10000, start: 30, pay: 3 }; // 판단에 필요한 최소 표본

  const ui = { media: '' };
  // 받침에 맞춰 이/가를 붙인다.
  const iga = (word) => {
    const c = String(word).replace(/[^가-힣A-Za-z0-9]+$/, '').slice(-1);
    const code = c.charCodeAt(0);
    const batchim = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 !== 0 : /[013678LMNRlmnr]/.test(c);
    return word + (batchim ? '이' : '가');
  };
  const enough = (g) => g.cost >= MIN.cost && g.start >= MIN.start;
  const typeName = (id) => { const t = P.creativeTypes.find((c) => c.id === id); return t ? t.name : (P.keywordGroups.find((k) => k.id === id) || {}).name || id; };
  const tagOf = (r) => (S().creatives[r.work + '_' + r.creative] || {}).tag || '';
  const workOf = (code) => S().works.find((w) => w.code === code);
  const genreOf = (code) => { const w = workOf(code); const d = w && WORKS_DATA.find((x) => x.title === w.title && x.cp === w.cp); return d ? d.genre : ''; };

  // 묶음을 첫 재생당 비용이 낮은 순으로 세우고 판단을 붙인다.
  function rank(rows, keyFn) {
    const gs = Calc.groupBy(rows.filter((r) => keyFn(r) !== ''), keyFn);
    const ok = gs.filter(enough);
    const avg = Calc.sum(ok.flatMap((g) => g.rows)).cps;
    ok.sort((a, b) => a.cps - b.cps);
    ok.forEach((g, i) => {
      g.rankNo = i + 1;
      g.verdict = ok.length > 1 && i === 0 ? ['ok', '가장 좋음'] : avg && g.cps > avg * 1.3 ? ['bad', '평균보다 나쁨'] : avg && g.cps < avg * 0.9 ? ['ok', '평균보다 좋음'] : ['', '평균 수준'];
    });
    const thin = gs.filter((g) => !enough(g)).sort((a, b) => b.cost - a.cost);
    thin.forEach((g) => { g.verdict = ['warn', '표본 부족']; });
    return { ok, thin, all: ok.concat(thin), avg };
  }

  function table(title, sub, res, labelFn, firstHead) {
    if (!res.all.length) return '<div class="card"><h2>' + h(title) + '</h2><div class="empty">' + h(sub.empty || '기록이 없습니다') + '</div></div>';
    return '<div class="card"><h2>' + h(title) + ' <span class="muted small">' + h(sub.note || '') + '</span></h2><div class="tablewrap"><table><thead><tr><th>#</th><th>' + h(firstHead) + '</th><th class="num">집행액</th><th class="num">첫 재생</th><th class="num">첫 재생당</th><th class="num">노출 대비 재생</th><th class="num">3화 시청률</th><th class="num">결제</th><th class="num">결제당</th><th>판단</th></tr></thead><tbody>' +
      res.all.map((g) => '<tr><td class="num">' + (g.rankNo || '–') + '</td><td>' + labelFn(g.key) + '</td><td class="num">' + won(g.cost) + '</td><td class="num">' + n(g.start) + '</td><td class="num">' + won(g.cps) + '</td><td class="num">' + pct(g.startRate, 2) + '</td><td class="num">' + pct(g.ep3Rate, 0) + '</td><td class="num">' + n(g.pay) + '</td><td class="num">' + won(g.cpp) + '</td><td><span class="tag ' + g.verdict[0] + '">' + g.verdict[1] + '</span></td></tr>').join('') +
      '</tbody></table></div></div>';
  }

  // 다음 시기 예산 재배분안: 검색을 뺀 매체끼리, 효율에 따라 계획의 70~130% 안에서 옮긴다.
  function reallocation() {
    const today = Calc.today();
    const next = Calc.nextPhase(today) || (today < P.start ? P.phases[1] : null);
    if (!next) return null;
    const movable = P.media.filter((m) => !m.search);
    const gs = Calc.groupBy(S().reports.filter((r) => !Calc.media(r.media).search), (r) => r.media);
    const ready = movable.filter((m) => { const g = gs.find((x) => x.key === m.id); return g && enough(g); });
    if (ready.length < 2) return { next, rows: null };
    const avg = Calc.sum(ready.flatMap((m) => gs.find((x) => x.key === m.id).rows)).cps;
    const total = ready.reduce((s, m) => s + Calc.daily(m.id, next.id), 0);
    const raw = ready.map((m) => {
      const g = gs.find((x) => x.key === m.id);
      const score = Math.max(0.7, Math.min(1.3, avg / g.cps));
      return { m, g, plan: Calc.daily(m.id, next.id), want: Calc.daily(m.id, next.id) * score };
    });
    const scale = total / raw.reduce((s, r) => s + r.want, 0);
    raw.forEach((r) => { r.to = Math.round((r.want * scale) / 1000) * 1000; });
    raw[0].to += total - raw.reduce((s, r) => s + r.to, 0); // 반올림 차이는 첫 매체에
    return { next, rows: raw, total };
  }

  function recommendations(rows) {
    const out = [];
    const media = rank(rows, (r) => r.media);
    const nonSearch = rows.filter((r) => !Calc.media(r.media).search);
    if (media.ok.length >= 2) {
      const best = media.ok[0];
      const worst = media.ok[media.ok.length - 1];
      out.push(['ok', '첫 재생은 ' + iga(Calc.media(best.key).name) + ' 가장 쌉니다', '첫 재생당 ' + won(best.cps) + '. 가장 비싼 ' + Calc.media(worst.key).name + '(' + won(worst.cps) + ')의 ' + pct(best.cps / worst.cps, 0) + ' 수준입니다.']);
    }
    const payers = Calc.groupBy(rows, (r) => r.media).filter((g) => g.pay >= MIN.pay).sort((a, b) => a.cpp - b.cpp);
    if (payers.length >= 2 && media.ok.length && payers[0].key !== media.ok[0].key) {
      out.push(['info', '결제는 ' + iga(Calc.media(payers[0].key).name) + ' 가장 쌉니다', '결제당 ' + won(payers[0].cpp) + '. 첫 재생이 싼 매체와 결제가 싼 매체가 다르니, 첫 재생당 비용만 보고 끄지 않습니다.']);
    }
    P.media.filter((m) => !m.search).forEach((m) => {
      const f = rank(nonSearch.filter((r) => r.media === m.id), (r) => r.creative);
      if (f.ok.length >= 2) {
        const b = f.ok[0];
        const w = f.ok[f.ok.length - 1];
        out.push(['ok', m.name + '에서는 ' + iga(typeName(b.key)) + ' 가장 좋습니다', '첫 재생당 ' + won(b.cps) + ', 3화 시청률 ' + pct(b.ep3Rate, 0) + '. ' + (w.cps > b.cps * 1.5 ? typeName(w.key) + '(' + won(w.cps) + ')은 줄이거나 바꿉니다.' : '형식 간 차이는 크지 않습니다.')]);
      }
    });
    const tags = rank(nonSearch, tagOf);
    if (tags.ok.length >= 2) {
      const b = tags.ok[0];
      const w = tags.ok[tags.ok.length - 1];
      out.push(['ok', '내용은 ' + iga('「' + b.key + '」') + ' 가장 잘 됩니다', '첫 재생당 ' + won(b.cps) + '. 「' + w.key + '」(' + won(w.cps) + ')보다 ' + pct(1 - b.cps / w.cps, 0) + ' 쌉니다. 다음 주 새 소재 2종은 이 내용으로 만듭니다.']);
      const deep = tags.ok.filter((g) => g.start >= MIN.start).sort((a, b2) => b2.ep3Rate - a.ep3Rate)[0];
      if (deep && deep.key !== b.key) out.push(['info', '끝까지 보게 하는 내용은 「' + deep.key + '」입니다', '3화 시청률 ' + pct(deep.ep3Rate, 0) + '. 첫 재생은 덜 싸도 결제로 이어질 가능성이 높으니 함께 유지합니다.']);
    } else if (nonSearch.length && !nonSearch.some((r) => tagOf(r))) {
      out.push(['warn', '소재에 「내용」을 지정해 주세요', '내용이 지정되지 않아 어떤 내용이 잘 되는지 비교할 수 없습니다. 소재 화면에서 고릅니다.']);
    }
    const works = rank(rows.filter((r) => r.work), (r) => r.work);
    if (works.ok.length >= 2) {
      const b = works.ok[0];
      const w = works.ok[works.ok.length - 1];
      const bw = workOf(b.key);
      const ww = workOf(w.key);
      out.push(['ok', '작품은 ' + iga('「' + (bw ? bw.title : b.key) + '」') + ' 가장 잘 됩니다', '첫 재생당 ' + won(b.cps) + ', 결제 ' + n(b.pay) + '건. ' + (w.cps > b.cps * 1.5 ? '「' + (ww ? ww.title : w.key) + '」(' + won(w.cps) + ')은 예산을 줄입니다.' : '작품 간 차이는 크지 않습니다.')]);
    }
    Calc.killFlags().forEach((f) => out.push(['bad', '끄기 후보: ' + f.media.name + ' ' + f.content, f.reason]));
    return out;
  }

  window.Views.insights = function () {
    const all = S().reports;
    const rows = all.filter((r) => !ui.media || r.media === ui.media);
    const nonSearch = rows.filter((r) => !Calc.media(r.media).search);
    const recs = recommendations(all);
    const re = reallocation();
    const dates = [...new Set(all.map((r) => r.date))].sort();

    const preByMedia = P.media.map((m) => {
      const list = P.preRecs.filter((x) => x.media === m.id);
      return '<div class="card"><h2>' + dot(m) + h(m.name) + '</h2>' + list.map((x) => '<div class="check"><span class="t"><strong>' + h(x.title) + '</strong><br><span class="muted">' + h(x.why) + '</span><br><span class="small muted">근거: ' + h(x.basis) + '</span></span></div>').join('') + '</div>';
    }).join('');

    let reHtml = '';
    if (re && re.rows) {
      reHtml = '<div class="card"><h2>' + h(re.next.name) + ' 기간 예산 재배분안 <span class="muted small">' + md(re.next.start) + '~' + md(re.next.end) + '</span></h2><div class="tablewrap"><table><thead><tr><th>매체</th><th class="num">첫 재생당</th><th class="num">계획 하루 예산</th><th class="num">추천 하루 예산</th><th class="num">변화</th></tr></thead><tbody>' +
        re.rows.map((r) => '<tr><td>' + dot(r.m) + h(r.m.name) + '</td><td class="num">' + won(r.g.cps) + '</td><td class="num">' + won(r.plan) + '</td><td class="num"><strong>' + won(r.to) + '</strong></td><td class="num">' + (r.to === r.plan ? '–' : '<span class="tag ' + (r.to > r.plan ? 'ok' : 'warn') + '">' + (r.to > r.plan ? '+' : '') + n(r.to - r.plan) + '</span>') + '</td></tr>').join('') +
        '</tbody></table></div><div class="actions" style="margin-top:10px"><button data-act="applyRealloc">이 값으로 하루 예산 바꾸기</button><span class="small muted">합계는 그대로 두고, 효율에 따라 계획의 70~130% 안에서만 옮긴다. 검색 광고는 결제 기여가 달라 그대로 둔다.</span></div></div>';
    } else if (re) {
      reHtml = '<div class="card"><h2>' + h(re.next.name) + ' 기간 예산 재배분안</h2><div class="empty">검색을 뺀 매체 2개 이상에서 집행액 ' + won(MIN.cost) + ', 첫 재생 ' + MIN.start + '회가 넘어야 계산합니다</div></div>';
    }

    return head('분석·추천', all.length ? '성과 기록 ' + all.length + '줄 (' + md(dates[0]) + '~' + md(dates[dates.length - 1]) + ') 기준. 집행액 ' + won(MIN.cost) + ', 첫 재생 ' + MIN.start + '회가 안 되는 묶음은 순위에서 뺀다.' : '아직 성과 기록이 없어 집행 전 추천만 보여 준다.',
      '<select data-chg="insMedia" aria-label="매체">' + opt('', '매체 전체', ui.media) + P.media.map((m) => opt(m.id, m.name, ui.media)).join('') + '</select>') +
      (all.length ? '<div class="card"><h2>추천</h2>' + (recs.length ? recs.map((r) => '<div class="notice ' + r[0] + '"><strong>' + h(r[1]) + '</strong><br>' + h(r[2]) + '</div>').join('') : '<div class="empty">아직 비교할 만큼 표본이 쌓이지 않았습니다</div>') +
        '<p class="small muted">숫자가 적을 때의 순위는 우연일 수 있다. 며칠 더 지켜본 뒤 움직이고, 한 번에 크게 옮기지 않는다.</p></div>' + reHtml +
        table('매체별', { note: '어느 매체가 좋은가' }, rank(rows, (r) => r.media), (k) => dot(Calc.media(k)) + h(Calc.media(k).name), '매체') +
        table('매체 × 형식', { note: '어느 매체에서 어떤 형식이 좋은가' }, rank(rows, (r) => r.media + '|' + r.creative), (k) => { const a = k.split('|'); return dot(Calc.media(a[0])) + h(Calc.media(a[0]).name) + ' · ' + h(typeName(a[1])) + ' <code>' + h(a[1]) + '</code>'; }, '매체 · 형식') +
        table('내용별', { note: '어떤 내용의 영상이 좋은가', empty: '소재 화면에서 「내용」을 지정하면 비교합니다' }, rank(nonSearch, tagOf), (k) => h(k), '내용') +
        table('매체 × 내용', { note: '매체마다 통하는 내용이 다른가', empty: '소재 화면에서 「내용」을 지정하면 비교합니다' }, rank(nonSearch.filter((r) => tagOf(r)), (r) => r.media + '|' + tagOf(r)), (k) => { const a = k.split('|'); return dot(Calc.media(a[0])) + h(Calc.media(a[0]).name) + ' · ' + h(a[1]); }, '매체 · 내용') +
        table('작품별', { note: '어떤 작품이 좋은가' }, rank(rows.filter((r) => r.work), (r) => r.work), (k) => { const w = workOf(k); return '<code>' + h(k) + '</code> ' + h(w ? w.title : ''); }, '작품') +
        table('장르별', { note: '어떤 장르가 좋은가' }, rank(rows.filter((r) => r.work), (r) => genreOf(r.work)), (k) => h(k), '장르')
        : '') +
      '<div class="head" style="margin-top:26px"><div><h1 style="font-size:17px">집행 전 추천</h1><p>성과 데이터가 아니라 CP 회신과 조사 자료에서 나온 가설이다. 시험 기간(12/1~9)에 위 표로 확인한다.</p></div></div>' +
      '<div class="grid g2">' + preByMedia + '</div>';
  };

  window.Actions.insMedia = (el) => { ui.media = el.value; };
  window.Actions.applyRealloc = () => {
    const re = reallocation();
    if (!re || !re.rows) return false;
    if (!confirm(re.next.name + ' 기간 하루 예산을 추천 값으로 바꿀까요?\n' + re.rows.map((r) => r.m.name + ': ' + won(r.plan) + ' → ' + won(r.to)).join('\n'))) return false;
    Store.update((s) => re.rows.forEach((r) => {
      s.settings.daily[r.m.id] = s.settings.daily[r.m.id] || {};
      if (r.to === r.m.daily[re.next.id]) delete s.settings.daily[r.m.id][re.next.id]; else s.settings.daily[r.m.id][re.next.id] = r.to;
    }));
    toast('하루 예산을 바꿨습니다. 예산 화면에서 확인하세요');
  };

  window.Insights = { recommendations, reallocation, rank };
})();
