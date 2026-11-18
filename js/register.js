// 광고 등록: 계획·작품·소재·링크에서 매체별 등록 행을 만들고, 대량 등록 파일로 내려받는다.
// 파일의 열 이름은 매체가 주는 템플릿과 정확히 같아야 하므로, 화면에서 열을 맞출 수 있게 했다.
(function () {
  const P = window.PLAN;
  const { h, won, md, dot, head, opt, ext, toast, download, toCsv } = window.UI;
  const S = () => Store.state;

  const STATUSES = ['미등록', '파일 올림', '검수 중', '승인', '반려'];
  const ST_CLS = { '미등록': '', '파일 올림': 'warn', '검수 중': 'warn', '승인': 'ok', '반려': 'bad' };
  const LIMITS = { naver: { headline: 15, desc: 45 }, gsearch: { headline: 30, desc: 90 } };
  const DEFAULT_KEYWORDS = { brand: '원드라마\n숏드라마\n숏드라마 추천\n원스토어 드라마' };

  // 저장 위치: settings.reg
  function reg() {
    const s = S().settings;
    s.reg = s.reg || {};
    ['copy', 'assets', 'keywords', 'groupIds', 'status', 'headers', 'map', 'bids'].forEach((k) => { s.reg[k] = s.reg[k] || {}; });
    return s.reg;
  }
  const ui = { phase: '', openMap: {} };
  function phaseId() {
    if (ui.phase) return ui.phase;
    const t = Calc.today();
    return (Calc.phaseOf(t) || Calc.nextPhase(t) || P.phases[P.phases.length - 1]).id;
  }

  // 맞출 수 있는 값
  const FIELDS = {
    campaign: '캠페인 이름', adset: '광고 세트·그룹 이름', ad: '광고 이름 (content)',
    dailyBudget: '광고 세트 하루 예산', campaignBudget: '캠페인(매체) 하루 예산',
    start: '시작일 (YYYY-MM-DD)', end: '종료일 (YYYY-MM-DD)', startTime: '시작 일시', endTime: '종료 일시',
    ageMin: '나이 최소', ageMax: '나이 최대', placement: '노출 위치',
    headline: '제목', desc: '설명', url: '랜딩 주소 (utm 없음)', fullUrl: '랜딩 주소 (utm 포함)', suffix: 'utm 꼬리표',
    asset: '영상·이미지 ID', assetFile: '소재 파일 이름 (묶음 안의 이름)', keyword: '키워드', matchType: '검색 유형', bid: '입찰가', groupId: '네이버 광고그룹 ID',
  };

  // 파일 정의. headers는 [열 이름, 기본으로 넣을 값]. '=글자'는 고정값, 그 밖은 FIELDS의 키.
  const FILES = {
    meta: {
      media: 'meta', title: '메타 일괄 가져오기 파일', file: 'meta_bulk_import.csv', kind: 'ads',
      where: '광고 관리자 → 「내보내기 및 가져오기」 → 「광고 일괄 가져오기」',
      headers: [
        ['Campaign Name', 'campaign'], ['Campaign Status', '=PAUSED'], ['Campaign Objective', '=Outcome Traffic'], ['Buying Type', '=AUCTION'],
        ['Ad Set Name', 'adset'], ['Ad Set Run Status', '=PAUSED'], ['Ad Set Daily Budget', 'dailyBudget'], ['Ad Set Time Start', 'startTime'], ['Ad Set Time Stop', 'endTime'],
        ['Countries', '=KR'], ['Gender', '=Female'], ['Age Min', 'ageMin'], ['Age Max', 'ageMax'],
        ['Ad Name', 'ad'], ['Ad Status', '=PAUSED'], ['Title', 'headline'], ['Body', 'desc'], ['Link', 'url'], ['URL Tags', 'suffix'], ['Call to Action', '=WATCH_MORE'], ['Video ID', 'asset'],
      ],
    },
    youtube: {
      media: 'youtube', title: '구글 애즈 에디터 파일 (동영상)', file: 'google_ads_video.csv', kind: 'ads',
      where: '구글 애즈 에디터 → 「계정」 → 「가져오기」 → 「파일에서」',
      headers: [
        ['Campaign', 'campaign'], ['Campaign Type', '=Video'], ['Campaign Status', '=Paused'], ['Budget', 'campaignBudget'], ['Budget type', '=Daily'], ['Start Date', 'start'], ['End Date', 'end'],
        ['Ad Group', 'adset'], ['Ad Group Status', '=Paused'], ['Ad Name', 'ad'], ['Video ID', 'asset'], ['Headline', 'headline'], ['Description 1', 'desc'], ['Final URL', 'url'], ['Final URL suffix', 'suffix'], ['Status', '=Paused'],
      ],
    },
    gdn: {
      media: 'gdn', title: '구글 애즈 에디터 파일 (디스플레이)', file: 'google_ads_display.csv', kind: 'ads',
      where: '구글 애즈 에디터 → 「계정」 → 「가져오기」 → 「파일에서」',
      headers: [
        ['Campaign', 'campaign'], ['Campaign Type', '=Display'], ['Campaign Status', '=Paused'], ['Budget', 'campaignBudget'], ['Budget type', '=Daily'], ['Start Date', 'start'], ['End Date', 'end'],
        ['Ad Group', 'adset'], ['Ad Group Status', '=Paused'], ['Ad Name', 'ad'], ['Short headline', 'headline'], ['Long headline', 'headline'], ['Description 1', 'desc'], ['Business name', '=원드라마'], ['Final URL', 'url'], ['Final URL suffix', 'suffix'], ['Status', '=Paused'],
      ],
    },
    gsearch: {
      media: 'gsearch', title: '구글 애즈 에디터 파일 (검색)', file: 'google_ads_search.csv', kind: 'search',
      where: '구글 애즈 에디터 → 「계정」 → 「가져오기」 → 「파일에서」',
      headers: [
        ['Campaign', 'campaign'], ['Campaign Type', '=Search'], ['Campaign Status', '=Paused'], ['Budget', 'campaignBudget'], ['Budget type', '=Daily'], ['Start Date', 'start'], ['End Date', 'end'],
        ['Ad Group', 'adset'], ['Ad Group Status', '=Paused'], ['Max CPC', 'bid'], ['Keyword', 'keyword'], ['Criterion Type', 'matchType'],
        ['Headline 1', 'headline'], ['Headline 2', '=원드라마'], ['Headline 3', '=설치 없이 바로 재생'], ['Description 1', 'desc'], ['Description 2', '=앱 설치 없이 웹에서 바로 보는 숏드라마'], ['Final URL', 'url'], ['Final URL suffix', 'suffix'],
      ],
    },
    naver_kw: {
      media: 'naver', title: '네이버 키워드 대량 등록', file: 'naver_keywords.csv', kind: 'keywords',
      where: '검색광고 → 「도구」 → 「대량 관리」 → 「대량 등록/수정」 → 키워드 등록',
      headers: [['광고그룹 ID', 'groupId'], ['키워드', 'keyword'], ['입찰가', 'bid']],
    },
    naver_ad: {
      media: 'naver', title: '네이버 소재 대량 등록', file: 'naver_ads.csv', kind: 'groupAds',
      where: '검색광고 → 「도구」 → 「대량 관리」 → 「대량 등록/수정」 → 소재 등록',
      headers: [['광고그룹 ID', 'groupId'], ['제목', 'headline'], ['설명', 'desc'], ['연결 URL(PC)', 'fullUrl'], ['연결 URL(모바일)', 'fullUrl']],
    },
  };
  const filesOf = (mediaId) => Object.keys(FILES).filter((k) => FILES[k].media === mediaId);

  function headersOf(fk) { return reg().headers[fk] || FILES[fk].headers.map((x) => x[0]); }
  function specOf(fk, header) {
    const saved = (reg().map[fk] || {})[header];
    if (saved != null) return saved;
    const own = FILES[fk].headers.find((x) => x[0].toLowerCase() === header.toLowerCase());
    if (own) return own[1];
    // 다른 파일 정의나 한글 이름에서 같은 열 이름을 찾아 본다.
    for (const k of Object.keys(FILES)) {
      const hit = FILES[k].headers.find((x) => x[0].toLowerCase() === header.toLowerCase());
      if (hit && !hit[1].startsWith('=')) return hit[1];
    }
    const byLabel = Object.keys(FIELDS).find((f) => FIELDS[f] === header);
    return byLabel || '';
  }

  // ---------- 등록 행 만들기 ----------
  function placementOf(m, id) {
    if (m.id === 'meta') return id.startsWith('im01') ? 'feed' : 'reels';
    if (m.id === 'youtube') return id === 'v06' ? 'bumper' : id === 'v30a' ? 'instream' : 'shorts';
    return m.placements[0];
  }
  const copyOf = (code) => reg().copy[code || 'common'] || {};
  const campaignName = (m) => P.campaign + '_' + m.id;

  function base(m, ph) {
    return {
      media: m, campaign: campaignName(m), campaignBudget: Calc.daily(m.id, ph),
      start: P.start, end: P.end, startTime: P.start + ' 00:00', endTime: P.end + ' 23:59', ageMin: 25, ageMax: 44,
    };
  }

  // 영상·이미지·배너 광고: 작품 × 소재
  function adRows(m, ph) {
    const rows = [];
    S().works.forEach((w) => Calc.mediaCreatives(m, w.code).forEach((id) => {
      const content = w.code + '_' + id;
      const place = placementOf(m, id);
      const t = P.creativeTypes.find((c) => c.id === id);
      const c = copyOf(w.code);
      rows.push(Object.assign(base(m, ph), {
        key: m.id + '|' + content, work: w, creative: id, label: t ? t.name : '추가 소재',
        adset: campaignName(m) + '_' + place + '_' + w.code, placement: place, ad: content,
        headline: c.headline || '', desc: c.desc || '', url: w.url || '',
        fullUrl: w.url ? Calc.buildUrl(w.url, m, content) : '', suffix: Calc.buildUrl('', m, content).slice(1),
        asset: reg().assets[m.id + '|' + content] || '',
        assetFile: ((f) => (f ? content + ((/\.[a-z0-9]+$/i.exec(f.name) || [''])[0]).toLowerCase() : ''))((S().creatives[content] || {}).file),
      }));
    }));
    const sets = [...new Set(rows.map((r) => r.adset))];
    const each = sets.length ? Math.floor(Calc.daily(m.id, ph) / sets.length / 100) * 100 : 0;
    rows.forEach((r) => { r.dailyBudget = each; });
    return rows;
  }

  // 검색 광고: 키워드 묶음(광고그룹) 단위
  function searchGroups(m, ph) {
    const groups = [];
    m.creatives.forEach((kw) => {
      const list = kw === 'title' ? S().works.map((w) => ({ key: w.code + '_title', work: w, name: w.title + ' (작품명)' })) :
        [{ key: kw, work: null, name: P.keywordGroups.find((k) => k.id === kw).name }];
      list.forEach((g) => {
        const saved = reg().keywords[g.key];
        const text = saved != null ? saved : (g.work ? g.work.title : DEFAULT_KEYWORDS[g.key] || '');
        const c = copyOf(g.work ? g.work.code : 'common');
        const baseUrl = g.work ? (g.work.url || '') : P.site + '/';
        groups.push(Object.assign(base(m, ph), {
          key: m.id + '|' + g.key, gkey: g.key, work: g.work, label: g.name,
          adset: campaignName(m) + '_' + m.placements[0] + '_' + g.key, ad: g.key,
          keywords: text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
          headline: c.headline || '', desc: c.desc || '', url: baseUrl,
          fullUrl: baseUrl ? Calc.buildUrl(baseUrl, m, g.key) : '', suffix: Calc.buildUrl('', m, g.key).slice(1),
          groupId: reg().groupIds[g.key] || '', bid: reg().bids[m.id] || (m.id === 'naver' ? 70 : ''), matchType: 'Phrase',
        }));
      });
    });
    return groups;
  }

  function fileRows(fk, ph) {
    const f = FILES[fk];
    const m = Calc.media(f.media);
    if (f.kind === 'ads') return adRows(m, ph);
    const groups = searchGroups(m, ph);
    const kwRows = groups.flatMap((g) => g.keywords.map((k) => Object.assign({}, g, { keyword: k, headline: '', desc: '', url: '', fullUrl: '', suffix: '' })));
    const adOnly = groups.map((g) => Object.assign({}, g, { keyword: '', matchType: '', bid: '' }));
    if (f.kind === 'keywords') return groups.flatMap((g) => g.keywords.map((k) => Object.assign({}, g, { keyword: k })));
    if (f.kind === 'groupAds') return groups;
    return kwRows.concat(adOnly); // 구글 검색: 키워드 줄 + 광고 줄
  }

  function buildCsv(fk, ph) {
    const heads = headersOf(fk);
    const rows = fileRows(fk, ph).map((r) => heads.map((hd) => {
      const spec = specOf(fk, hd);
      if (!spec) return '';
      if (spec.startsWith('=')) return spec.slice(1);
      return r[spec] == null ? '' : r[spec];
    }));
    return { heads, rows, csv: toCsv([heads].concat(rows)) };
  }

  // 빠진 것 찾기
  function problems(m, ph) {
    const out = [];
    const works = S().works;
    if (!works.length) { out.push('작품을 먼저 골라 주세요'); return out; }
    const noUrl = works.filter((w) => !w.url).map((w) => w.code);
    if (noUrl.length) out.push('랜딩 주소 없음: ' + noUrl.join(', '));
    const lim = LIMITS[m.id];
    if (m.search) {
      const gs = searchGroups(m, ph);
      const noKw = gs.filter((g) => !g.keywords.length).map((g) => g.gkey);
      if (noKw.length) out.push('키워드 없음: ' + noKw.join(', '));
      const noCopy = gs.filter((g) => !g.headline || !g.desc).map((g) => g.gkey);
      if (noCopy.length) out.push('광고 문구 없음: ' + noCopy.join(', '));
      if (lim) gs.forEach((g) => {
        if (g.headline.length > lim.headline) out.push(g.gkey + ' 제목이 ' + lim.headline + '자를 넘음 (' + g.headline.length + '자)');
        if (g.desc.length > lim.desc) out.push(g.gkey + ' 설명이 ' + lim.desc + '자를 넘음 (' + g.desc.length + '자)');
      });
      if (m.id === 'naver') {
        const noId = gs.filter((g) => !g.groupId).map((g) => g.gkey);
        if (noId.length) out.push('네이버 광고그룹 ID 없음: ' + noId.join(', '));
      }
    } else {
      const rows = adRows(m, ph);
      const noCopy = [...new Set(rows.filter((r) => !r.headline || !r.desc).map((r) => r.work.code))];
      if (noCopy.length) out.push('광고 문구 없음: ' + noCopy.join(', '));
      if (m.id !== 'gdn') {
        const noAsset = rows.filter((r) => !r.asset).length;
        if (noAsset) out.push('영상·이미지 ID 없음: ' + noAsset + '건');
      }
    }
    return out;
  }

  // ---------- 화면 ----------
  const Views = window.Views;
  const Actions = window.Actions;

  Views.register = function () {
    const ph = phaseId();
    const phase = P.phases.find((x) => x.id === ph);
    const works = S().works;
    const r = reg();
    const allKeys = P.media.flatMap((m) => (m.search ? searchGroups(m, ph) : adRows(m, ph)).map((x) => x.key));
    const counts = STATUSES.map((st) => [st, allKeys.filter((k) => (r.status[k] || STATUSES[0]) === st).length]);

    const copyRows = [{ code: 'common', title: '공통 (브랜드·장르 키워드 광고)' }].concat(works.map((w) => ({ code: w.code, title: w.code + ' ' + w.title })))
      .map((w) => {
        const c = copyOf(w.code);
        return '<tr><td>' + h(w.title) + '</td>' +
          '<td><input type="text" style="width:100%;min-width:200px" value="' + h(c.headline || '') + '" data-chg="regCopy" data-code="' + h(w.code) + '" data-field="headline" placeholder="제목 (네이버 15자, 구글 30자)" aria-label="' + h(w.title) + ' 제목"> <span class="small muted">' + (c.headline || '').length + '자</span></td>' +
          '<td><input type="text" style="width:100%;min-width:320px" value="' + h(c.desc || '') + '" data-chg="regCopy" data-code="' + h(w.code) + '" data-field="desc" placeholder="설명 (네이버 45자, 구글 90자)" aria-label="' + h(w.title) + ' 설명"> <span class="small muted">' + (c.desc || '').length + '자</span></td></tr>';
      }).join('');

    const mediaCards = P.media.map((m) => {
      const probs = problems(m, ph);
      const rows = m.search ? searchGroups(m, ph) : adRows(m, ph);
      const sets = [...new Set(rows.map((x) => x.adset))];
      let table;
      if (m.search) {
        table = '<table><thead><tr><th>광고그룹</th><th>키워드 (한 줄에 하나)</th>' + (m.id === 'naver' ? '<th>네이버 광고그룹 ID</th>' : '') + '<th>연결 주소</th><th>상태</th></tr></thead><tbody>' +
          rows.map((g) => '<tr><td><code>' + h(g.adset) + '</code><br><span class="small muted">' + h(g.label) + '</span></td>' +
            '<td><textarea rows="3" style="width:100%;min-width:200px" data-chg="regKeywords" data-key="' + h(g.gkey) + '" aria-label="' + h(g.gkey) + ' 키워드">' + h(g.keywords.join('\n')) + '</textarea></td>' +
            (m.id === 'naver' ? '<td><input type="text" style="width:150px" value="' + h(g.groupId) + '" placeholder="grp-..." data-chg="regGroupId" data-key="' + h(g.gkey) + '" aria-label="' + h(g.gkey) + ' 광고그룹 ID"></td>' : '') +
            '<td class="linkcell mono" style="max-width:260px" title="' + h(g.fullUrl) + '">' + (g.fullUrl ? h(g.fullUrl) : '<span class="tag warn">랜딩 주소 없음</span>') + '</td>' +
            '<td>' + statusSelect(g.key) + '</td></tr>').join('') + '</tbody></table>' +
          '<div class="filters" style="margin:10px 0 0"><label class="field">입찰가(원)<input type="number" min="0" step="10" style="width:110px" value="' + h(r.bids[m.id] || (m.id === 'naver' ? 70 : '')) + '" data-chg="regBid" data-media="' + m.id + '"></label></div>';
      } else {
        table = rows.length ? '<table><thead><tr><th>광고 세트·그룹</th><th>광고 이름</th><th>소재</th><th class="num">세트 하루 예산</th>' + (m.id === 'gdn' ? '' : '<th>영상·이미지 ID</th>') + '<th>상태</th></tr></thead><tbody>' +
          rows.map((x) => '<tr><td><code>' + h(x.adset) + '</code></td><td><code>' + h(x.ad) + '</code></td><td>' + h(x.label) + '</td><td class="num">' + won(x.dailyBudget) + '</td>' +
            (m.id === 'gdn' ? '' : '<td><input type="text" style="width:170px" value="' + h(x.asset) + '" placeholder="' + (m.id === 'youtube' ? '유튜브 영상 ID' : '메타 영상 ID') + '" data-chg="regAsset" data-key="' + h(x.key) + '" aria-label="' + h(x.ad) + ' 영상 ID"></td>') +
            '<td>' + statusSelect(x.key) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">작품을 고르면 등록할 광고가 만들어집니다</div>';
      }

      const files = filesOf(m.id).map((fk) => {
        const f = FILES[fk];
        const open = ui.openMap[fk];
        const heads = headersOf(fk);
        const n = rows.length ? fileRows(fk, ph).length : 0;
        return '<div style="border-top:1px dashed var(--line);margin-top:12px;padding-top:12px">' +
          '<div class="actions"><strong>' + h(f.title) + '</strong><span class="small muted">' + n + '줄 · ' + heads.length + '열</span><span style="flex:1"></span>' +
            '<button class="primary" data-act="regDownload" data-file="' + fk + '"' + (n ? '' : ' disabled') + '>파일 내려받기</button>' +
            '<button data-act="regToggleMap" data-file="' + fk + '">' + (open ? '열 맞추기 닫기' : '열 맞추기') + '</button></div>' +
          '<div class="small muted" style="margin-top:4px">올리는 곳: ' + h(f.where) + '</div>' +
          (open ? '<div style="margin-top:10px"><p class="small muted">매체에서 내려받은 템플릿의 첫 줄(열 이름)을 그대로 복사해 붙여 넣으면, 이름이 같은 열은 자동으로 맞춰진다. 엑셀에서 복사한 그대로(탭 구분) 넣으면 된다.</p>' +
            '<textarea rows="2" style="width:100%" data-chg="regHeaders" data-file="' + fk + '" aria-label="' + h(f.title) + ' 열 이름">' + h(heads.join('\t')) + '</textarea>' +
            '<div class="actions" style="margin:6px 0"><button class="sm" data-act="regResetMap" data-file="' + fk + '">기본값으로</button></div>' +
            '<div class="tablewrap" style="max-height:340px;overflow-y:auto"><table><thead><tr><th>열 이름</th><th>넣을 값</th><th>고정값</th></tr></thead><tbody>' +
            heads.map((hd) => {
              const spec = specOf(fk, hd);
              const fixed = spec.startsWith('=');
              return '<tr><td><code>' + h(hd) + '</code></td><td><select data-chg="regMap" data-file="' + fk + '" data-header="' + h(hd) + '" aria-label="' + h(hd) + ' 값">' + opt('', '(비움)', fixed ? '=' : spec) + opt('=', '(고정값)', fixed ? '=' : spec) + Object.keys(FIELDS).map((k) => opt(k, FIELDS[k], fixed ? '=' : spec)).join('') + '</select></td>' +
                '<td>' + (fixed ? '<input type="text" value="' + h(spec.slice(1)) + '" data-chg="regMapFixed" data-file="' + fk + '" data-header="' + h(hd) + '" aria-label="' + h(hd) + ' 고정값">' : '') + '</td></tr>';
            }).join('') + '</tbody></table></div></div>' : '') + '</div>';
      }).join('');

      return '<div class="card"><div class="actions" style="margin-bottom:10px"><h2 style="margin:0">' + dot(m) + h(m.name) + '</h2>' +
        '<span class="small muted">캠페인 <code>' + h(campaignName(m)) + '</code> · ' + (m.search ? '광고그룹 ' : '세트 ') + sets.length + '개 · ' + (m.search ? '키워드 ' + rows.reduce((s, g) => s + g.keywords.length, 0) + '개' : '광고 ' + rows.length + '개') + ' · 하루 ' + won(Calc.daily(m.id, ph)) + '</span>' +
        '<span style="flex:1"></span>' +
        ((rd) => (rd.total ? '<span class="tag ' + (rd.ready === rd.total ? 'ok' : 'warn') + '">소재 파일 ' + rd.ready + '/' + rd.total + '</span>' : ''))(window.Bundle.readiness(m)) +
        '<button class="primary sm" data-act="bundleDownload" data-media="' + m.id + '">올리기 묶음 받기 (zip)</button>' + ext(Calc.adUrl(m), m.ad.name, 'sm') + '</div>' +
        probs.map((p) => '<div class="notice warn">' + h(p) + '</div>').join('') +
        '<div class="tablewrap">' + table + '</div>' + files + '</div>';
    }).join('');

    return head('광고 등록', '여기서 문구·키워드·영상 ID를 채우고 매체별 등록 파일을 내려받아, 각 매체의 대량 등록에 올린다.',
      '<label class="field">예산 기준 시기<select data-chg="regPhase">' + P.phases.map((x) => opt(x.id, x.name + ' ' + md(x.start) + '~' + md(x.end), ph)).join('') + '</select></label>') +
      '<div class="notice info"><strong>순서</strong> ① 문구·키워드 채우기 → ② 매체마다 「올리기 묶음 받기」 (소재 파일 + 등록 파일 + 순서 안내가 zip 하나로) → ③ 묶음 안의 읽어보기 순서대로 매체에 올리기 → ④ 매체에서 내용 확인 뒤 켜기 → ⑤ 여기 상태 바꾸기. 모든 광고는 <strong>일시중지</strong> 상태로 만들어진다.</div>' +
      '<div class="notice warn">파일의 열 이름은 매체 템플릿과 한 글자라도 다르면 무시된다. 처음 한 번은 각 매체에서 템플릿을 내려받아 「열 맞추기」에 첫 줄을 붙여 넣고, 광고 1~2개로 먼저 올려 본다.</div>' +
      '<div class="grid" style="grid-template-columns:repeat(' + counts.length + ',minmax(0,1fr))">' + counts.map((c) => '<div class="card stat"><div class="label">' + h(c[0]) + '</div><div class="value">' + c[1] + '</div></div>').join('') + '</div>' +
      '<div class="card"><h2>광고 문구 <span class="muted small">' + h(phase.name) + ' 기간 기준</span></h2><div class="tablewrap"><table><thead><tr><th>대상</th><th>제목</th><th>설명</th></tr></thead><tbody>' + copyRows + '</tbody></table></div>' +
        '<p class="small muted" style="margin-top:8px">강점 메시지: 앱 설치 없이 웹에서 바로 재생. 과장 문구는 광고 반감 요인이니 피한다.</p></div>' +
      mediaCards;
  };

  function statusSelect(key) {
    const cur = reg().status[key] || STATUSES[0];
    return '<select data-chg="regStatus" data-key="' + h(key) + '" aria-label="' + h(key) + ' 등록 상태">' + STATUSES.map((s) => opt(s, s, cur)).join('') + '</select> <span class="tag ' + ST_CLS[cur] + '">' + h(cur) + '</span>';
  }

  const setIn = (bucket, key, value) => Store.update(() => { const r = reg(); if (value === '' || value == null) delete r[bucket][key]; else r[bucket][key] = value; });
  Actions.regPhase = (el) => { ui.phase = el.value; };
  Actions.regCopy = (el) => Store.update(() => { const r = reg(); const c = (r.copy[el.dataset.code] = r.copy[el.dataset.code] || {}); c[el.dataset.field] = el.value.trim(); });
  Actions.regKeywords = (el) => Store.update(() => { reg().keywords[el.dataset.key] = el.value; });
  Actions.regGroupId = (el) => setIn('groupIds', el.dataset.key, el.value.trim());
  Actions.regAsset = (el) => setIn('assets', el.dataset.key, el.value.trim());
  Actions.regBid = (el) => setIn('bids', el.dataset.media, Math.max(0, Math.round(+el.value || 0)) || '');
  Actions.regStatus = (el) => setIn('status', el.dataset.key, el.value === STATUSES[0] ? '' : el.value);
  Actions.regToggleMap = (el) => { ui.openMap[el.dataset.file] = !ui.openMap[el.dataset.file]; };
  Actions.regHeaders = (el) => {
    const heads = el.value.split(/\r?\n/)[0].split(el.value.includes('\t') ? '\t' : ',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
    if (!heads.length) { toast('열 이름이 없습니다'); return; }
    setIn('headers', el.dataset.file, heads);
    toast(heads.length + '개 열을 읽었습니다');
  };
  Actions.regMap = (el) => Store.update(() => { const r = reg(); (r.map[el.dataset.file] = r.map[el.dataset.file] || {})[el.dataset.header] = el.value; });
  Actions.regMapFixed = (el) => Store.update(() => { const r = reg(); (r.map[el.dataset.file] = r.map[el.dataset.file] || {})[el.dataset.header] = '=' + el.value; });
  Actions.regResetMap = (el) => Store.update(() => { const r = reg(); delete r.headers[el.dataset.file]; delete r.map[el.dataset.file]; });
  Actions.regDownload = (el) => {
    const fk = el.dataset.file;
    const out = buildCsv(fk, phaseId());
    if (!out.rows.length) { toast('내려받을 줄이 없습니다'); return false; }
    download(FILES[fk].file, out.csv);
    toast(out.rows.length + '줄을 내려받았습니다');
    return false;
  };

  function progress() {
    const ph = phaseId();
    const keys = P.media.flatMap((m) => (m.search ? searchGroups(m, ph) : adRows(m, ph)).map((x) => x.key));
    const st = (S().settings.reg || {}).status || {};
    return { total: keys.length, done: keys.filter((k) => st[k] && st[k] !== '반려').length };
  }

  window.Register = { buildCsv, fileRows, problems, progress, FILES, filesOf, phaseId };
})();
