// 날짜, 예산, 성과 계산. 화면 코드와 분리해 둔다.
(function () {
  const P = window.PLAN;
  const DAY = 86400000;

  const toDate = (s) => new Date(s + 'T00:00:00');
  const iso = (d) => {
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  };
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);

  const Calc = {
    // 주소에 ?today=2026-12-05 를 붙이면 그 날짜 기준으로 볼 수 있다 (미리 보기용).
    today() {
      const m = /[?&]today=(\d{4}-\d{2}-\d{2})/.exec(location.search);
      return m ? m[1] : iso(new Date());
    },
    iso, toDate, daysBetween,
    addDays(s, n) { return iso(new Date(toDate(s).getTime() + n * DAY)); },
    phaseDays(ph) { return daysBetween(ph.start, ph.end) + 1; },
    phaseOf(date) { return P.phases.find((ph) => date >= ph.start && date <= ph.end) || null; },
    nextPhase(date) { return P.phases.find((ph) => ph.start > date) || null; },
    media(id) { return P.media.find((m) => m.id === id); },

    daily(mediaId, phaseId) {
      const o = (Store.state.settings.daily[mediaId] || {})[phaseId];
      return o != null ? o : Calc.media(mediaId).daily[phaseId];
    },
    // 매체의 한 달 계획 집행액 = 시기별 하루 예산 × 날짜 수
    plannedSpend(mediaId) {
      return P.phases.reduce((s, ph) => s + Calc.daily(mediaId, ph.id) * Calc.phaseDays(ph), 0);
    },
    plannedTotal() { return P.media.reduce((s, m) => s + Calc.plannedSpend(m.id), 0); },
    // 어느 날짜까지 계획대로 썼다면 나갔을 금액
    plannedUntil(date, mediaId) {
      let sum = 0;
      P.phases.forEach((ph) => {
        if (date < ph.start) return;
        const last = date > ph.end ? ph.end : date;
        const days = daysBetween(ph.start, last) + 1;
        (mediaId ? [Calc.media(mediaId)] : P.media).forEach((m) => { sum += Calc.daily(m.id, ph.id) * days; });
      });
      return sum;
    },

    contentOf(r) { return r.work ? r.work + '_' + r.creative : r.creative; },

    sum(rows) {
      const t = { imp: 0, clk: 0, start: 0, ep3: 0, pay: 0, cost: 0, n: rows.length };
      rows.forEach((r) => {
        t.imp += +r.imp || 0; t.clk += +r.clk || 0; t.start += +r.start || 0;
        t.ep3 += +r.ep3 || 0; t.pay += +r.pay || 0; t.cost += +r.cost || 0;
      });
      return Calc.rates(t);
    },
    rates(t) {
      t.ctr = t.imp ? t.clk / t.imp : null;
      t.cpm = t.imp ? (t.cost / t.imp) * 1000 : null;
      t.cpc = t.clk ? t.cost / t.clk : null;
      t.cps = t.start ? t.cost / t.start : null;      // 첫 재생당 비용
      t.cpp = t.pay ? t.cost / t.pay : null;          // 결제당 비용
      t.startRate = t.imp ? t.start / t.imp : null;   // 노출 대비 첫 재생
      t.ep3Rate = t.start ? t.ep3 / t.start : null;   // 첫 재생 대비 3화 시청
      t.payRate = t.start ? t.pay / t.start : null;   // 첫 재생 대비 결제
      return t;
    },
    groupBy(rows, keyFn) {
      const map = new Map();
      rows.forEach((r) => {
        const k = keyFn(r);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(r);
      });
      return [...map.entries()].map(([key, list]) => Object.assign({ key, rows: list }, Calc.sum(list)));
    },
    weekOf(date) {
      // 12/1(화) 시작. 월요일 기준 주차: 1주차 12/1~6, 2주차 12/7~13 ...
      if (date < P.start) return '집행 전';
      if (date <= '2026-12-06') return '1주차 (12/1~6)';
      const n = Math.floor(daysBetween('2026-12-07', date) / 7);
      const s = Calc.addDays('2026-12-07', n * 7);
      const e = Calc.addDays(s, 6) > P.end ? P.end : Calc.addDays(s, 6);
      return (n + 2) + '주차 (12/' + (+s.slice(8)) + '~' + (+e.slice(8)) + ')';
    },

    // 끄기 후보: 매체+소재 단위로 본다.
    killFlags() {
      const rows = Store.state.reports;
      const rule = P.killRule;
      const flags = [];
      const nonSearch = rows.filter((r) => !Calc.media(r.media).search);
      const avg = Calc.sum(nonSearch).cps;
      Calc.groupBy(rows, (r) => r.media + '|' + Calc.contentOf(r)).forEach((g) => {
        const [mediaId, content] = g.key.split('|');
        const m = Calc.media(mediaId);
        const key = (g.rows[0].work || '') + '_' + g.rows[0].creative;
        const st = (Store.state.creatives[key] || {}).status;
        if (st === '꺼짐') return;
        const byDate = Calc.groupBy(g.rows, (r) => r.date).sort((a, b) => (a.key < b.key ? 1 : -1));
        const recent = byDate.filter((d) => d.cost > 0).slice(0, rule.zeroDays);
        if (recent.length >= rule.zeroDays && recent.every((d) => d.start === 0)) {
          flags.push({ media: m, content, reason: '최근 ' + rule.zeroDays + '일 동안 첫 재생 없음', cps: g.cps, cost: g.cost });
        } else if (!m.search && avg && g.cps && g.start >= 10 && g.cps > avg * rule.costMultiple) {
          flags.push({ media: m, content, reason: '첫 재생당 비용이 평균(' + Math.round(avg).toLocaleString() + '원)의 ' + (g.cps / avg).toFixed(1) + '배', cps: g.cps, cost: g.cost });
        }
      });
      return flags;
    },

    checklistProgress() {
      const checks = Store.state.checks;
      return P.checklist.map((sec) => {
        const items = sec.groups.flatMap((g) => g.items)
          .concat(Store.state.customChecks.filter((c) => c.section === sec.id));
        const done = items.filter((i) => checks[i.id]).length;
        return { sec, items, done, total: items.length };
      });
    },

    // utm 링크
    ytMedium() { return Store.state.settings.ytMedium || 'paid_social'; },
    mediumOf(m) { return m.id === 'youtube' ? Calc.ytMedium() : m.medium; },
    buildUrl(base, m, content) {
      const params = 'utm_source=' + m.source + '&utm_medium=' + Calc.mediumOf(m) +
        '&utm_campaign=' + P.campaign + '&utm_content=' + content;
      let hash = '';
      const i = base.indexOf('#');
      if (i >= 0) { hash = base.slice(i); base = base.slice(0, i); }
      return base + (base.includes('?') ? '&' : '?') + params + hash;
    },
    creativeIds(code) {
      return P.creativeTypes.map((c) => c.id).concat(Store.state.extraCreatives[code] || []);
    },
    // 소재 번호가 어느 매체에서 쓰이는지. 추가 소재는 앞 글자로 판단한다.
    mediaCreatives(m, code) {
      if (m.search) return [];
      const extra = (Store.state.extraCreatives[code] || []).filter((id) => {
        if (id.startsWith('bn')) return m.id === 'gdn';
        if (id.startsWith('im')) return m.id === 'meta';
        if (id.startsWith('v')) return m.id === 'meta' || m.id === 'youtube';
        return false;
      });
      return m.creatives.concat(extra);
    },
    allLinks() {
      const out = [];
      const works = Store.state.works;
      P.media.forEach((m) => {
        if (m.search) {
          m.creatives.forEach((kw) => {
            if (kw === 'title') {
              works.forEach((w) => out.push(Calc.linkRow(m, w, w.code + '_title', '작품명 키워드')));
            } else {
              const name = P.keywordGroups.find((k) => k.id === kw).name;
              out.push(Calc.linkRow(m, null, kw, name + ' 키워드'));
            }
          });
        } else {
          works.forEach((w) => Calc.mediaCreatives(m, w.code).forEach((id) => {
            const t = P.creativeTypes.find((c) => c.id === id);
            out.push(Calc.linkRow(m, w, w.code + '_' + id, t ? t.name : '추가 소재'));
          }));
        }
      });
      return out;
    },
    linkRow(m, w, content, label) {
      const base = w ? (w.url || '') : P.site + '/';
      return {
        media: m, work: w, content, label,
        ok: /^[a-z0-9_]+$/.test(content),
        url: base ? Calc.buildUrl(base, m, content) : '',
        suffix: Calc.buildUrl('', m, content).slice(1),
      };
    },
  };

  window.Calc = Calc;
})();
