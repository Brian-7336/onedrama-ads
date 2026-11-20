// 매체 연결: 「메타로 로그인」「구글로 로그인」으로 허용을 받은 뒤, 사이트에 올려 둔 소재를 매체에 직접 올린다.
// 로그인으로 받은 접근 권한(토큰)은 이 탭의 메모리에만 두고 저장하지 않는다. 탭을 닫으면 사라진다.
// 앱 ID와 클라이언트 ID는 비밀값이 아니다. 이 브라우저의 설정에만 저장한다.
(function () {
  const P = window.PLAN;
  const { h, toast } = window.UI;
  const S = () => Store.state;
  const cfg = () => { const s = S().settings; s.connect = s.connect || {}; return s.connect; };
  const st = { meta: { token: '', accounts: [], pages: [], busy: false, log: [], sdk: false }, ig: { on: false, token: '', id: '', username: '', pageToken: '', match: false, busy: false, log: [] }, yt: { token: '', channel: '', channelId: '', match: false, busy: false, log: [] } };
  const ORIGIN = location.origin;

  const log = (k, msg, cls) => { st[k].log.push([new Date().toTimeString().slice(0, 8), msg, cls || '']); if (st[k].log.length > 60) st[k].log.shift(); window.App.render(true); };
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('스크립트를 불러오지 못했습니다 (사내망 차단일 수 있습니다): ' + src)); document.head.appendChild(s); });
  const reg = () => { const s = S().settings; s.reg = s.reg || {}; ['assets', 'status'].forEach((k) => { s.reg[k] = s.reg[k] || {}; }); return s.reg; };
  const extOf = (name) => ((/\.[a-z0-9]+$/i.exec(name || '') || [''])[0]).toLowerCase();
  const rowsOf = (mediaId) => window.Register.fileRows(window.Register.filesOf(mediaId)[0], window.Register.phaseId());
  const fileOf = (content) => (S().creatives[content] || {}).file;

  // =====================================================================
  // 메타
  // =====================================================================
  const mver = () => cfg().metaVersion || 'v26.0';
  async function graph(path, params, method, host) {
    const url = 'https://' + (host || 'graph.facebook.com') + '/' + mver() + '/' + path;
    let res;
    if (method === 'POST') {
      const body = params instanceof FormData ? params : new URLSearchParams(Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
      if (!body.has('access_token')) body.append('access_token', st.meta.token);
      res = await fetch(url, { method: 'POST', body });
    } else {
      const q = new URLSearchParams(Object.assign({ access_token: st.meta.token }, params || {}));
      res = await fetch(url + '?' + q);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) { const e = json.error || {}; throw new Error((e.error_user_title ? e.error_user_title + ': ' : '') + (e.error_user_msg || e.message || 'HTTP ' + res.status)); }
    return json;
  }

  async function metaSdk() {
    if (st.meta.sdk) return;
    if (!cfg().metaAppId) throw new Error('메타 앱 ID를 먼저 넣어 주세요');
    await loadScript('https://connect.facebook.net/ko_KR/sdk.js');
    window.FB.init({ appId: cfg().metaAppId, version: mver(), cookie: false, xfbml: false });
    st.meta.sdk = true;
  }
  async function metaAfterLogin() {
    const acc = await graph('me/adaccounts', { fields: 'account_id,name,currency,account_status', limit: 100 });
    st.meta.accounts = acc.data || [];
    const pages = await graph('me/accounts', { fields: 'id,name,username', limit: 100 });
    st.meta.pages = pages.data || [];
    const mine = st.meta.pages.find((p) => (p.username || '').toLowerCase() === String(P.facebookPage || '').toLowerCase()) || st.meta.pages.find((p) => /원드라마/.test(p.name || ''));
    Store.update((s) => {
      const c = s.settings.connect;
      if (!st.meta.accounts.some((a) => a.account_id === c.metaAccount)) c.metaAccount = st.meta.accounts.length === 1 ? st.meta.accounts[0].account_id : '';
      if (!st.meta.pages.some((p) => p.id === c.metaPage)) c.metaPage = mine ? mine.id : st.meta.pages.length === 1 ? st.meta.pages[0].id : '';
    });
    log('meta', '로그인했습니다. 광고 계정 ' + st.meta.accounts.length + '개, 페이지 ' + st.meta.pages.length + '개', 'ok');
  }
  const act = () => 'act_' + cfg().metaAccount;

  // 소재 파일을 메타 라이브러리에 올리고, 받은 영상 ID·이미지 해시를 등록 표에 채운다.
  async function metaUpload() {
    if (!cfg().metaAccount) throw new Error('광고 계정을 골라 주세요');
    const seen = new Set();
    const rows = rowsOf('meta').filter((r) => !seen.has(r.ad) && seen.add(r.ad));
    let up = 0, skip = 0, miss = 0;
    for (const r of rows) {
      const f = fileOf(r.ad);
      if (!f) { miss++; continue; }
      if (reg().assets[r.key]) { skip++; continue; }
      const blob = await window.Assets.get(r.ad);
      if (!blob) { miss++; continue; }
      const fd = new FormData();
      log('meta', r.ad + ' 올리는 중…');
      if (f.type.startsWith('video/')) {
        fd.append('name', r.ad);
        fd.append('source', blob, r.ad + extOf(f.name));
        const out = await graph(act() + '/advideos', fd, 'POST', 'graph-video.facebook.com');
        Store.update(() => { reg().assets[r.key] = out.id; });
      } else {
        fd.append('filename', blob, r.ad + extOf(f.name));
        const out = await graph(act() + '/adimages', fd, 'POST');
        const img = Object.values(out.images || {})[0];
        if (!img || !img.hash) throw new Error(r.ad + ': 이미지 해시를 받지 못했습니다');
        Store.update(() => { reg().assets[r.key] = img.hash; });
      }
      up++;
      log('meta', r.ad + ' 올렸습니다 (' + reg().assets[r.key] + ')', 'ok');
    }
    log('meta', '소재 올리기 끝: 새로 ' + up + '개, 이미 올린 것 ' + skip + '개, 사이트에 파일 없는 것 ' + miss + '개', 'ok');
  }

  // =====================================================================
  // 인스타그램: 원드라마 공식 계정에 예고편을 릴스로 게시한다 (광고가 아니라 프로필에 남는 게시물).
  // 영상 파일은 메타의 재개형 업로드(rupload.facebook.com)로 브라우저에서 바로 보낸다.
  // =====================================================================
  const IG_NAME = String(((P.sns.accounts.find((a) => a[0] === '인스타그램') || [])[1] || '').replace(/^@/, '')).toLowerCase();
  const igTok = () => st.ig.pageToken || st.ig.token;
  async function igAfterLogin() {
    const pages = await graph('me/accounts', { fields: 'id,name,username,access_token,instagram_business_account{id,username}', limit: 100, access_token: st.ig.token });
    const list = (pages.data || []).filter((p) => p.instagram_business_account);
    const pg = list.find((p) => (p.instagram_business_account.username || '').toLowerCase() === IG_NAME) || list.find((p) => p.id === cfg().metaPage) || list[0];
    if (!pg) throw new Error('인스타그램 프로페셔널 계정이 연결된 페이지가 없습니다. 인스타그램 계정을 비즈니스 계정으로 바꾸고 페이스북 페이지에 연결해 주세요');
    st.ig.id = pg.instagram_business_account.id;
    st.ig.username = pg.instagram_business_account.username || '';
    st.ig.pageToken = pg.access_token || '';
    st.ig.match = st.ig.username.toLowerCase() === IG_NAME;
    st.ig.on = true;
    log('ig', '인스타그램 계정 @' + st.ig.username + ' 을 찾았습니다' + (st.ig.match ? '' : ' (원드라마 공식 계정 @' + IG_NAME + ' 이 아닙니다)'), st.ig.match ? 'ok' : 'bad');
  }
  // 올릴 수 있는 영상: 「소재 준비」에서 우리 형식으로 만든 공식 계정용 예고편.
  function igChoices() {
    const sns = S().sns || {};
    return S().works.filter((w) => sns[w.code]).map((w) => { const f = sns[w.code]; return { key: 'sns|' + w.code, code: w.code, label: w.title + ' · 공식 계정용 예고편 (' + f.dur + '초, ' + f.at + ' 만듦)', type: f.type, name: f.name, dur: f.dur }; });
  }
  const igPick = () => { const list = igChoices(); return list.find((x) => x.key === cfg().igPick) || list[0] || null; };
  // 캡션 기본값: 작품 소개, 무료 회차, 보는 곳, 출연자 계정, 해시태그.
  function igCaptionDefault(code) {
    const w = S().works.find((x) => x.code === code) || {};
    const wd = (window.WORKS_DATA || []).find((x) => x.title === w.title && x.cp === w.cp) || {};
    const cast = ((window.CAST || {})[w.title] || {}).cast || [];
    const tags = [...new Set(cast.flatMap((c) => (c.links || []).map((l) => (/instagram\.com\/([A-Za-z0-9._]+)/i.exec(l[1]) || [])[1])).filter(Boolean).map((x) => '@' + x.replace(/\.$/, '')))];
    const tname = String(w.title || '').replace(/[^0-9A-Za-z가-힣]/g, '');
    const hash = ['원드라마', '숏드라마', '원스토어', /[A-Za-z가-힣]{2}/.test(tname) ? tname : '', wd.genre ? wd.genre.split(/[\/,·\s]/)[0] + '드라마' : ''].filter(Boolean);
    return [
      '「' + (w.title || '') + '」 예고편',
      (wd.genre ? wd.genre + ' 숏드라마' : '숏드라마') + (wd.free ? ' · ' + (wd.free > 1 ? '1~' + wd.free + '화' : '1화') + ' 무료' : ''),
      '',
      '지금 원스토어 원드라마에서, 앱 설치 없이 바로 보세요.',
      '프로필 링크에서 볼 수 있어요.',
      tags.length ? '\n' + tags.join(' ') : '',
      '',
      [...new Set(hash)].map((x) => '#' + x).join(' '),
    ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  }
  const igCaption = (code) => { const c = (cfg().igCaption || {})[code]; return c == null ? igCaptionDefault(code) : c; };
  async function igPublish() {
    const pick = igPick();
    if (!pick) throw new Error('올릴 영상이 없습니다. 작품의 「공식 계정용 예고편」을 먼저 만들어 주세요');
    const blob = await window.Assets.raw.get(pick.key);
    if (!blob) throw new Error('영상 파일을 찾지 못했습니다 (이 브라우저에 넣은 파일만 올릴 수 있습니다)');
    const type = pick.type || blob.type || '';
    if (!/mp4|quicktime/.test(type) && !/\.(mp4|mov)$/i.test(pick.name || '')) throw new Error('인스타그램은 MP4·MOV만 받습니다 (지금 파일: ' + (pick.name || type) + ')');
    const caption = igCaption(pick.code);
    log('ig', '게시 준비 중: ' + pick.label);
    const box = await graph(st.ig.id + '/media', { media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: true, access_token: igTok() }, 'POST');
    log('ig', '영상 보내는 중… (' + (blob.size / 1048576).toFixed(1) + 'MB)');
    const up = await fetch('https://rupload.facebook.com/ig-api-upload/' + mver() + '/' + box.id, { method: 'POST', headers: { Authorization: 'OAuth ' + igTok(), offset: '0', file_size: String(blob.size) }, body: blob });
    const uj = await up.json().catch(() => ({}));
    if (!up.ok || uj.success === false || uj.debug_info) throw new Error('영상을 보내지 못했습니다: ' + ((uj.debug_info || {}).message || uj.message || 'HTTP ' + up.status));
    log('ig', '영상을 보냈습니다. 인스타그램이 처리하는 중…');
    for (let i = 0; ; i++) {
      const stt = await graph(box.id, { fields: 'status_code,status', access_token: igTok() });
      if (stt.status_code === 'FINISHED') break;
      if (stt.status_code === 'ERROR' || stt.status_code === 'EXPIRED') throw new Error('인스타그램이 영상을 받지 않았습니다: ' + (stt.status || stt.status_code));
      if (i >= 60) throw new Error('처리가 5분 넘게 걸립니다. 잠시 뒤 인스타그램 앱에서 올라갔는지 확인해 주세요');
      await new Promise((r) => setTimeout(r, 5000));
    }
    const pub = await graph(st.ig.id + '/media_publish', { creation_id: box.id, access_token: igTok() }, 'POST');
    let link = '';
    try { link = (await graph(pub.id, { fields: 'permalink', access_token: igTok() })).permalink || ''; } catch (e) { /* 주소는 못 받아도 게시는 된 것 */ }
    Store.update(() => { const c = cfg(); c.igPosts = c.igPosts || []; c.igPosts.unshift({ key: pick.key, label: pick.label, id: pub.id, link, at: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace('T', ' ') }); c.igPosts = c.igPosts.slice(0, 30); });
    log('ig', '게시했습니다' + (link ? ': ' + link : ' (미디어 ID ' + pub.id + ')'), 'ok');
  }
  function igPanel() {
    const c = cfg();
    const posts = c.igPosts || [];
    const history = posts.length ? '<details class="cguide"><summary>올린 기록 ' + posts.length + '건</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">' + posts.map((x) => '<li>' + h(x.at) + ' · ' + h(x.label) + (x.link ? ' · <a href="' + h(x.link) + '" target="_blank" rel="noopener noreferrer">게시물 보기 ↗</a>' : '') + '</li>').join('') + '</ul></details>' : '';
    let body;
    if (!st.ig.on) {
      body = '<div class="filters"><label class="field">메타 앱 ID<input type="text" inputmode="numeric" style="width:200px" value="' + h(c.metaAppId || '') + '" data-chg="cnSet" data-key="metaAppId" placeholder="숫자 15~16자리"></label></div>' +
        '<div class="actions" style="margin-top:8px"><button class="primary" data-act="cnIgLogin"' + (c.metaAppId ? '' : ' disabled') + busyAttr('ig') + '>메타로 로그인하고 게시 권한 허용</button> <span class="small muted">' + (c.metaAppId ? '메타 창에서 인스타그램 계정 @' + h(IG_NAME) + ' 과 연결된 페이지를 고르고 「콘텐츠 게시」를 허용합니다. 비밀번호는 메타 창에만 입력됩니다.' : '앱 ID를 넣으면 눌러집니다. 앱 만드는 법은 <a href="#/register">광고 등록</a>의 메타 칸에 있습니다.') + '</span></div>';
    } else {
      const list = igChoices(), pick = igPick();
      body = '<p style="margin:0 0 8px">계정: <strong>@' + h(st.ig.username) + '</strong> ' + (st.ig.match ? '<span class="tag ok">원드라마 공식 계정 맞음</span>' : '<span class="tag bad">원드라마 공식 계정(@' + h(IG_NAME) + ')이 아님. 올릴 수 없습니다</span>') + '</p>' +
        (list.length ? '<div class="filters"><label class="field">올릴 영상<select data-chg="cnIgPick">' + list.map((x) => '<option value="' + h(x.key) + '"' + (pick && x.key === pick.key ? ' selected' : '') + '>' + h(x.label) + '</option>').join('') + '</select></label></div>' +
          '<label class="mf" style="margin-top:8px"><span>캡션 (고쳐 써도 된다. 비우면 캡션 없이 올라간다) <button class="link-btn" data-act="cnIgCaptionReset" data-code="' + h(pick.code) + '">추천 문구로</button></span><textarea rows="9" style="width:100%" data-chg="cnIgCaption" data-code="' + h(pick.code) + '">' + h(igCaption(pick.code)) + '</textarea></label>' +
          '<div class="actions" style="margin-top:8px"><button class="primary" data-act="cnIgPublish"' + (st.ig.match ? '' : ' disabled') + busyAttr('ig') + '>릴스로 게시하기</button></div>' +
          '<p class="small muted" style="margin:6px 0 0">누르면 확인 창이 한 번 뜨고, 바로 공개 게시됩니다(예약·비공개 없음). 세로 9:16, 3초~15분, MP4·MOV만 올라갑니다. 출연자 계정을 캡션에 쓰기 전에 소속사 확인이 끝났는지 봅니다.</p>'
          : '<p class="small muted" style="margin:0">올릴 영상이 없습니다. 위 작품 칸의 「공식 계정용 예고편」에서 「만들기」를 누르면 여기에 나옵니다.</p>') + '<div class="actions" style="margin-top:8px"><button class="link-btn" data-act="cnIgLogout">로그아웃</button></div>';
    }
    return '<div class="card" id="igpost"><h2>공식 인스타그램에 예고편 올리기 <span class="tag warn">실제 계정으로 시험 필요</span></h2><div class="connect" style="margin:0">' +
      '<details class="cguide"><summary>처음 한 번: 준비할 것</summary><ol>' +
      '<li>인스타그램 @' + h(IG_NAME) + ' 이 프로페셔널(비즈니스) 계정이고, 페이스북 페이지 「원드라마」에 연결돼 있어야 한다.</li>' +
      '<li>메타 앱(광고 올리기에 쓰는 것과 같은 앱)의 「사용 사례」에 인스타그램 콘텐츠 관리(<code>instagram_basic</code>, <code>instagram_content_publish</code>)를 추가한다.</li>' +
      '<li>앱이 개발 모드여도 앱 관리자 본인이 관리하는 계정에는 심사 없이 올릴 수 있다.</li></ol></details>' +
      body + history + logHtml('ig') + '</div></div>';
  }

  const POS = {
    reels: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['facebook_reels', 'story'], instagram_positions: ['reels', 'story'] },
    story: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story'], instagram_positions: ['story'] },
    feed: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream'] },
  };
  async function thumbnail(videoId) {
    for (let i = 0; i < 20; i++) {
      const t = await graph(videoId + '/thumbnails', {});
      const pick = (t.data || []).find((x) => x.is_preferred) || (t.data || [])[0];
      if (pick && pick.uri) return pick.uri;
      await new Promise((r) => setTimeout(r, 4000));   // 영상 처리가 끝날 때까지 기다린다
    }
    throw new Error('영상 처리가 아직 끝나지 않았습니다. 잠시 뒤 다시 눌러 주세요');
  }
  // 캠페인 → 광고 세트 → 광고를 일시중지 상태로 만든다. 같은 이름이 이미 있으면 건너뛴다.
  async function metaCreate() {
    if (!cfg().metaAccount) throw new Error('광고 계정을 골라 주세요');
    if (!cfg().metaPage) throw new Error('페이지를 골라 주세요 (광고에는 페이지가 필요합니다)');
    const rows = rowsOf('meta');
    const ready = rows.filter((r) => reg().assets[r.key] && r.headline && r.desc && r.url);
    const notReady = rows.length - ready.length;
    if (!ready.length) throw new Error('만들 수 있는 광고가 없습니다. 소재 올리기, 광고 문구, 랜딩 주소를 먼저 채워 주세요');

    const byName = async (edge, fields) => { const o = {}; const r = await graph(act() + '/' + edge, { fields: fields || 'name', limit: 500 }); (r.data || []).forEach((x) => { o[x.name] = x.id; }); return o; };
    const camps = await byName('campaigns');
    const cname = ready[0].campaign;
    let campaignId = camps[cname];
    if (!campaignId) {
      campaignId = (await graph(act() + '/campaigns', { name: cname, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION' }, 'POST')).id;
      log('meta', '캠페인 ' + cname + ' 만들었습니다', 'ok');
    } else log('meta', '캠페인 ' + cname + ' 이미 있음');

    const sets = await byName('adsets');
    const ads = await byName('ads');
    let made = 0, had = 0;
    for (const r of ready) {
      if (ads[r.ad]) { had++; continue; }
      if (!sets[r.adset]) {
        const targeting = Object.assign({ geo_locations: { countries: ['KR'] }, age_min: r.ageMin, age_max: r.ageMax, genders: [2] }, POS[r.placement] || {});
        sets[r.adset] = (await graph(act() + '/adsets', {
          name: r.adset, campaign_id: campaignId, daily_budget: r.dailyBudget, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'WEBSITE', start_time: P.start + 'T00:00:00+0900', end_time: P.end + 'T23:59:00+0900',
          targeting, status: 'PAUSED',
        }, 'POST')).id;
        log('meta', '광고 세트 ' + r.adset + ' 만들었습니다', 'ok');
      }
      const f = fileOf(r.ad) || {};
      const isVideo = (f.type || '').startsWith('video/');
      const story = isVideo
        ? { page_id: cfg().metaPage, video_data: { video_id: reg().assets[r.key], image_url: await thumbnail(reg().assets[r.key]), title: r.headline, message: r.desc, call_to_action: { type: 'WATCH_MORE', value: { link: r.url } } } }
        : { page_id: cfg().metaPage, link_data: { link: r.url, name: r.headline, message: r.desc, image_hash: reg().assets[r.key], call_to_action: { type: 'WATCH_MORE' } } };
      const creative = await graph(act() + '/adcreatives', { name: r.ad, object_story_spec: story, url_tags: r.suffix }, 'POST');
      await graph(act() + '/ads', { name: r.ad, adset_id: sets[r.adset], creative: { creative_id: creative.id }, status: 'PAUSED' }, 'POST');
      Store.update(() => { reg().status[r.key] = '검수 중'; });
      made++;
      log('meta', '광고 ' + r.ad + ' 만들었습니다 (일시중지)', 'ok');
    }
    log('meta', '광고 만들기 끝: 새로 ' + made + '개, 이미 있던 것 ' + had + '개' + (notReady ? ', 준비 안 된 것 ' + notReady + '개 (소재·문구·주소 확인)' : '') + '. 광고 관리자에서 확인한 뒤 12/1에 켜세요', 'ok');
  }

  // =====================================================================
  // 유튜브 (구글 로그인)
  // =====================================================================
  let gClient = null;
  async function ytLogin() {
    if (!cfg().googleClientId) throw new Error('구글 클라이언트 ID를 먼저 넣어 주세요');
    if (!window.google || !window.google.accounts) await loadScript('https://accounts.google.com/gsi/client');
    await new Promise((res, rej) => {
      gClient = window.google.accounts.oauth2.initTokenClient({
        client_id: cfg().googleClientId,
        scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
        callback: (r) => { if (r.error) rej(new Error(r.error_description || r.error)); else { st.yt.token = r.access_token; res(); } },
        error_callback: (e) => rej(new Error(e && e.message ? e.message : '로그인 창이 닫혔습니다')),
      });
      gClient.requestAccessToken();
    });
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: 'Bearer ' + st.yt.token } });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
    st.yt.channel = j.items && j.items[0] ? j.items[0].snippet.title : '';
    st.yt.channelId = j.items && j.items[0] ? j.items[0].id : '';
    st.yt.match = !P.youtubeChannelId || st.yt.channelId === P.youtubeChannelId;
    if (!st.yt.channel) log('yt', '로그인했지만 이 계정에 유튜브 채널이 없습니다', 'bad');
    else if (!st.yt.match) log('yt', '로그인한 채널 「' + st.yt.channel + '」은 원드라마 채널이 아닙니다. 로그아웃한 뒤 원드라마 채널(브랜드 계정)을 골라 주세요', 'bad');
    else log('yt', '로그인했습니다. 원드라마 채널이 맞습니다: ' + st.yt.channel, 'ok');
  }
  async function ytUploadOne(r, f, blob) {
    const meta = {
      snippet: { title: ('[원드라마] ' + r.work.title + ' · ' + r.label).slice(0, 100), description: P.site + '\n' + r.ad, categoryId: '24' },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
    };
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + st.yt.token, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': f.type || 'video/*', 'X-Upload-Content-Length': String(blob.size) },
      body: JSON.stringify(meta),
    });
    if (!init.ok) { const j = await init.json().catch(() => ({})); throw new Error((j.error && j.error.message) || 'HTTP ' + init.status); }
    const loc = init.headers.get('Location');
    if (!loc) throw new Error('올리기 주소를 받지 못했습니다');
    const put = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': f.type || 'video/*' }, body: blob });
    const j = await put.json().catch(() => ({}));
    if (!put.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + put.status);
    return j;
  }
  // 영상을 채널에 「일부 공개」로 올리고, 받은 영상 ID를 등록 표에 채운다.
  async function ytUpload() {
    if (!st.yt.channel) throw new Error('유튜브 채널이 있는 계정으로 로그인해 주세요');
    if (!st.yt.match) throw new Error('원드라마 채널이 아닙니다 (' + st.yt.channel + '). 다른 채널에는 올리지 않습니다');
    const seen = new Set();
    const rows = rowsOf('youtube').filter((r) => !seen.has(r.ad) && seen.add(r.ad));
    let up = 0, skip = 0, miss = 0, locked = 0;
    for (const r of rows) {
      const f = fileOf(r.ad);
      if (!f) { miss++; continue; }
      if (reg().assets[r.key]) { skip++; continue; }
      const blob = await window.Assets.get(r.ad);
      if (!blob) { miss++; continue; }
      log('yt', r.ad + ' 올리는 중…');
      const v = await ytUploadOne(r, f, blob);
      Store.update(() => { reg().assets[r.key] = v.id; });
      up++;
      const priv = v.status && v.status.privacyStatus;
      if (priv === 'private') { locked++; log('yt', r.ad + ' 올렸지만 「비공개」로 잠겼습니다 (' + v.id + '). 유튜브 스튜디오에서 「일부 공개」로 바꿔야 광고에 쓸 수 있습니다', 'bad'); }
      else log('yt', r.ad + ' 올렸습니다 (' + v.id + ')', 'ok');
    }
    log('yt', '영상 올리기 끝: 새로 ' + up + '개, 이미 올린 것 ' + skip + '개, 사이트에 파일 없는 것 ' + miss + '개' + (locked ? ', 비공개로 잠긴 것 ' + locked + '개' : ''), locked ? 'bad' : 'ok');
  }

  // =====================================================================
  // 화면
  // =====================================================================
  const logHtml = (k) => (st[k].log.length ? '<div class="clog" role="log" aria-live="polite">' + st[k].log.slice(-8).map((l) => '<div class="' + l[2] + '"><span class="muted">' + l[0] + '</span> ' + h(l[1]) + '</div>').join('') + '</div>' : '');
  const busyAttr = (k) => (st[k].busy ? ' disabled' : '');

  function metaPanel() {
    const c = cfg();
    const rows = rowsOf('meta');
    const uniq = [...new Set(rows.map((r) => r.ad))];
    const withFile = uniq.filter((a) => fileOf(a)).length;
    const uploaded = [...new Set(rows.filter((r) => reg().assets[r.key]).map((r) => r.ad))].length;
    const guide = '<details class="cguide"' + (c.metaAppId ? '' : ' open') + '><summary>처음 한 번: 메타 앱 만들기 (10분)</summary><ol>' +
      '<li><a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps</a>에서 「앱 만들기」. 사용 사례는 광고 관련(마케팅 API)을 고른다. 광고 계정의 관리자인 계정으로 만든다.</li>' +
      '<li>앱에 「Facebook 로그인」 제품을 추가하고, 「JavaScript SDK로 로그인」을 켠 뒤 허용 도메인에 <code>' + h(ORIGIN) + '</code> 를 넣는다.</li>' +
      '<li>앱 설정 → 기본 설정의 「앱 ID」를 아래 칸에 붙여 넣는다. 앱 시크릿은 넣지 않는다.</li>' +
      '<li>앱은 개발 모드로 둔다. 앱 관리자 본인의 광고 계정에는 심사 없이 쓸 수 있다.</li></ol>' +
      '<div class="filters"><label class="field">메타 앱 ID<input type="text" inputmode="numeric" style="width:200px" value="' + h(c.metaAppId || '') + '" data-chg="cnSet" data-key="metaAppId" placeholder="숫자 15~16자리"></label>' +
      '<label class="field">API 버전<input type="text" style="width:90px" value="' + h(mver()) + '" data-chg="cnSet" data-key="metaVersion"></label></div></details>';
    let body;
    if (!st.meta.token) {
      body = '<button class="primary" data-act="cnMetaLogin"' + (c.metaAppId ? '' : ' disabled') + busyAttr('meta') + '>메타로 로그인</button> <span class="small muted">' + (c.metaAppId ? '로그인 창에서 광고 관리 권한을 허용합니다. 비밀번호는 메타 창에만 입력됩니다.' : '앱 ID를 넣으면 눌러집니다.') + '</span>';
    } else {
      body = '<div class="filters">' +
        '<label class="field">광고 계정<select data-chg="cnSet" data-key="metaAccount"><option value="">고르기</option>' + st.meta.accounts.map((a) => '<option value="' + h(a.account_id) + '"' + (a.account_id === c.metaAccount ? ' selected' : '') + '>' + h(a.name) + ' (' + h(a.account_id) + ', ' + h(a.currency) + ')</option>').join('') + '</select></label>' +
        '<label class="field">페이지<select data-chg="cnSet" data-key="metaPage"><option value="">고르기</option>' + st.meta.pages.map((p) => '<option value="' + h(p.id) + '"' + (p.id === c.metaPage ? ' selected' : '') + '>' + h(p.name) + '</option>').join('') + '</select></label></div>' +
        '<div class="actions" style="margin-top:8px"><button class="primary" data-act="cnMetaUpload"' + busyAttr('meta') + '>① 소재 올리기 (' + uploaded + '/' + withFile + ')</button>' +
        '<button data-act="cnMetaCreate"' + busyAttr('meta') + '>② 광고 만들기 (일시중지)</button>' +
        '<button class="link-btn" data-act="cnMetaLogout">로그아웃</button></div>' +
        '<p class="small muted" style="margin:6px 0 0">①은 사이트에 올린 소재 ' + withFile + '/' + uniq.length + '개를 메타 라이브러리에 올리고 ID를 아래 표에 채웁니다. ②는 캠페인·세트·광고를 꺼진 상태로 만듭니다. 같은 이름이 있으면 건너뜁니다.</p>';
    }
    return '<div class="connect"><h3 style="margin-top:0">로그인으로 바로 올리기 <span class="tag warn">실제 계정으로 시험 필요</span></h3>' + guide + body + logHtml('meta') + '</div>';
  }

  function ytPanel() {
    const c = cfg();
    const rows = rowsOf('youtube');
    const uniq = [...new Set(rows.map((r) => r.ad))];
    const withFile = uniq.filter((a) => fileOf(a)).length;
    const uploaded = [...new Set(rows.filter((r) => reg().assets[r.key]).map((r) => r.ad))].length;
    const guide = '<details class="cguide"' + (c.googleClientId ? '' : ' open') + '><summary>처음 한 번: 구글 클라이언트 ID 만들기 (15분)</summary><ol>' +
      '<li><a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">console.cloud.google.com</a>에서 프로젝트를 만든다.</li>' +
      '<li>「API 및 서비스」 → 「라이브러리」에서 「YouTube Data API v3」를 사용 설정한다.</li>' +
      '<li>「OAuth 동의 화면」을 만든다. 테스트 사용자에 <a href="https://www.youtube.com/channel/' + h(P.youtubeChannelId) + '" target="_blank" rel="noopener noreferrer">원드라마 채널</a>을 관리하는 구글 계정을 넣는다.</li>' +
      '<li>「사용자 인증 정보」 → 「OAuth 클라이언트 ID」 → 유형 「웹 애플리케이션」. 승인된 자바스크립트 원본에 <code>' + h(ORIGIN) + '</code> 를 넣는다.</li>' +
      '<li>만들어진 「클라이언트 ID」를 아래 칸에 붙여 넣는다. 클라이언트 보안 비밀번호는 넣지 않는다.</li></ol>' +
      '<div class="filters"><label class="field">구글 클라이언트 ID<input type="text" style="width:min(460px,100%)" value="' + h(c.googleClientId || '') + '" data-chg="cnSet" data-key="googleClientId" placeholder="....apps.googleusercontent.com"></label></div>' +
      '<p class="small muted" style="margin:6px 0 0">검증받지 않은 프로젝트로 올린 영상은 유튜브가 「비공개」로 잠글 수 있습니다. 그 경우 스튜디오에서 「일부 공개」로 바꿔야 광고에 쓸 수 있고, 바꿀 수 없으면 영상은 스튜디오에 직접 올려야 합니다. 먼저 1개로 시험하세요.</p></details>';
    let body;
    if (!st.yt.token) {
      body = '<button class="primary" data-act="cnYtLogin"' + (c.googleClientId ? '' : ' disabled') + busyAttr('yt') + '>구글로 로그인</button> <span class="small muted">' + (c.googleClientId ? '원드라마 채널(브랜드 계정)을 골라 허용합니다.' : '클라이언트 ID를 넣으면 눌러집니다.') + '</span>';
    } else {
      body = '<p style="margin:0 0 8px">채널: <strong>' + h(st.yt.channel || '없음') + '</strong> ' + (st.yt.match ? '<span class="tag ok">원드라마 채널 맞음</span>' : '<span class="tag bad">원드라마 채널이 아님. 로그아웃하고 다시 고르세요</span>') + '</p>' +
        '<div class="actions"><button class="primary" data-act="cnYtUpload"' + (st.yt.match ? '' : ' disabled') + busyAttr('yt') + '>영상 올리기 · 일부 공개 (' + uploaded + '/' + withFile + ')</button>' +
        '<button class="link-btn" data-act="cnYtLogout">로그아웃</button></div>' +
        '<p class="small muted" style="margin:6px 0 0">사이트에 올린 영상 ' + withFile + '/' + uniq.length + '개를 채널에 올리고 영상 ID를 아래 표에 채웁니다. 그다음 「올리기 묶음」의 CSV를 구글 애즈 에디터로 가져옵니다.</p>';
    }
    return '<div class="connect"><h3 style="margin-top:0">로그인으로 영상 올리기 <span class="tag warn">실제 계정으로 시험 필요</span></h3>' + guide + body + logHtml('yt') + '</div>';
  }

  const panel = (m) => (m.id === 'meta' ? metaPanel() : m.id === 'youtube' ? ytPanel() : '');

  // 오래 걸리는 일을 돌리는 틀: 버튼을 잠그고, 끝나면 풀고, 오류는 기록한다.
  function job(k, fn) {
    if (st[k].busy) return false;
    st[k].busy = true;
    window.App.render(true);
    Promise.resolve().then(fn).catch((e) => { log(k, '멈췄습니다: ' + (e && e.message ? e.message : e), 'bad'); toast('멈췄습니다: ' + (e && e.message ? e.message : e)); })
      .then(() => { st[k].busy = false; window.App.render(true); });
    return false;
  }

  Actions.cnSet = (el) => Store.update(() => { cfg()[el.dataset.key] = el.value.trim(); if (el.dataset.key === 'metaAppId' || el.dataset.key === 'metaVersion') st.meta.sdk = false; });
  // 로그인 창은 누른 순간에 떠야 브라우저가 막지 않는다. 그래서 SDK를 미리 불러 둔다.
  Actions.cnMetaLogin = () => {
    if (!st.meta.sdk) return job('meta', async () => { await metaSdk(); log('meta', '준비됐습니다. 「메타로 로그인」을 한 번 더 눌러 주세요'); });
    window.FB.login((r) => {
      if (!r.authResponse) { log('meta', '로그인을 취소했거나 권한을 허용하지 않았습니다', 'bad'); return; }
      st.meta.token = r.authResponse.accessToken;
      job('meta', metaAfterLogin);
    }, { scope: 'ads_management,pages_show_list,pages_read_engagement' });
    return false;
  };
  Actions.cnMetaLogout = () => { st.meta.token = ''; st.meta.accounts = []; st.meta.pages = []; if (window.FB) try { window.FB.logout(); } catch (e) { /* 이미 로그아웃 */ } };
  Actions.cnMetaUpload = () => {
    const n = [...new Set(rowsOf('meta').filter((r) => fileOf(r.ad) && !reg().assets[r.key]).map((r) => r.ad))].length;
    if (!n) { toast('새로 올릴 소재가 없습니다'); return false; }
    if (!window.confirm('메타 광고 계정 ' + (cfg().metaAccount || '(미선택)') + ' 의 라이브러리에 소재 ' + n + '개를 올립니다. 계속할까요?')) return false;
    return job('meta', metaUpload);
  };
  Actions.cnMetaCreate = () => {
    if (!window.confirm('메타 광고 계정 ' + (cfg().metaAccount || '(미선택)') + ' 에 캠페인·광고 세트·광고를 「일시중지」 상태로 만듭니다. 돈은 나가지 않지만 계정에 실제로 만들어집니다. 계속할까요?')) return false;
    return job('meta', metaCreate);
  };
  // 인스타그램 게시 권한은 광고 권한과 따로 받는다 (앱에 권한이 없을 때 광고 로그인까지 막히지 않게).
  Actions.cnIgLogin = () => {
    if (!st.meta.sdk) return job('ig', async () => { await metaSdk(); log('ig', '준비됐습니다. 로그인 버튼을 한 번 더 눌러 주세요'); });
    window.FB.login((r) => {
      if (!r.authResponse) { log('ig', '로그인을 취소했거나 권한을 허용하지 않았습니다', 'bad'); return; }
      st.ig.token = r.authResponse.accessToken;
      job('ig', igAfterLogin);
    }, { scope: 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement' });
    return false;
  };
  Actions.cnIgLogout = () => { Object.assign(st.ig, { on: false, token: '', id: '', username: '', pageToken: '', match: false }); };
  Actions.cnIgPick = (el) => Store.update(() => { cfg().igPick = el.value; });
  Actions.cnIgCaption = (el) => { Store.update(() => { const c = cfg(); (c.igCaption = c.igCaption || {})[el.dataset.code] = el.value; }); return false; };
  Actions.cnIgCaptionReset = (el) => Store.update(() => { const c = cfg(); if (c.igCaption) delete c.igCaption[el.dataset.code]; });
  Actions.cnIgPublish = () => {
    const pick = igPick();
    if (!pick) { toast('올릴 영상이 없습니다'); return false; }
    if (!st.ig.match) { toast('원드라마 공식 계정이 아니라 올릴 수 없습니다'); return false; }
    if (!window.confirm('인스타그램 @' + st.ig.username + ' 에 아래 영상을 릴스로 「공개」 게시합니다. 올리면 팔로워와 누구나 볼 수 있습니다.\n\n' + pick.label + '\n\n계속할까요?')) return false;
    return job('ig', igPublish);
  };
  Actions.cnYtLogin = () => {
    if (!(window.google && window.google.accounts)) return job('yt', async () => { await loadScript('https://accounts.google.com/gsi/client'); log('yt', '준비됐습니다. 「구글로 로그인」을 한 번 더 눌러 주세요'); });
    return job('yt', ytLogin);
  };
  Actions.cnYtLogout = () => { if (st.yt.token && window.google) try { window.google.accounts.oauth2.revoke(st.yt.token); } catch (e) { /* 무시 */ } st.yt.token = ''; st.yt.channel = ''; st.yt.channelId = ''; st.yt.match = false; };
  Actions.cnYtUpload = () => {
    const n = [...new Set(rowsOf('youtube').filter((r) => fileOf(r.ad) && !reg().assets[r.key]).map((r) => r.ad))].length;
    if (!n) { toast('새로 올릴 영상이 없습니다'); return false; }
    if (!window.confirm('유튜브 채널 「' + st.yt.channel + '」에 영상 ' + n + '개를 「일부 공개」로 올립니다. 계속할까요?')) return false;
    return job('yt', ytUpload);
  };

  window.Connect = { panel, igPanel, st, _test: { metaUpload, metaCreate, ytUpload, metaAfterLogin, igAfterLogin, igPublish, igChoices, igCaptionDefault } };
})();
