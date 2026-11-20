// 영상 만들기: 원본 영상(1화, 예고편 등)을 원드라마 홍보영상 형식으로 잘라 소재 칸에 넣는다.
// 영상 형식은 SNS 홍보 예고편(「계약결혼, 사냥개가 되겠습니다」 예고편 SNS 업로드용, 2026-11)을 따른다:
// 본편에는 오른쪽 위 로고만 얹고, 끝 몇 초는 화면이 바로 바뀌어 포스터 → 제목 → 「지금 원스토어에서」
// → 로고(원이 퍼지고 별이 반짝임) → 「깔 게 없는 숏드라마」와 버튼이 차례로 뜬다.
// 포스터에 제목이 이미 있으면 제목 글자는 따로 쓰지 않는다.
// 이미지 카드는 예전 형식(위쪽 띠에 장르·제목, 아래에 문구)을 그대로 쓴다.
// 모든 작업은 이 브라우저 안에서 한다. 영상은 실제 길이만큼 시간이 걸린다(15초 영상 = 15초).
(function () {
  const P = window.PLAN;
  const { h, toast } = window.UI;
  const FORM = {
    cta1: '깔 게 없는 숏드라마', cta2: '지금 원스토어에서', hi: '원스토어', blue: '#5062f8', yellow: '#f6c453', bg: '#08080c',
    sans: '"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif', serif: '"Noto Serif KR","Nanum Myeongjo","Batang",serif',
  };
  const MIMES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const icon = new Image();
  const iconReady = new Promise((res) => { icon.onload = res; icon.onerror = res; });
  icon.src = 'img/onedrama-icon.svg';

  const codeOf = (key) => key.split('_')[0];
  const sources = () => (Store.state.sources = Store.state.sources || {});
  const r1 = (x) => Math.round(x * 10) / 10;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // 끝 화면 버튼 글자: 콘텐츠 목록 문서에 적힌 무료 회차 수를 쓴다. 값이 없으면 「지금 보러가기」.
  function freeText(code) {
    const w = Store.state.works.find((x) => x.code === code) || {};
    const wd = (window.WORKS_DATA || []).find((x) => x.title === w.title && x.cp === w.cp) || {};
    const n = +wd.free || 0;
    return n > 1 ? '1~' + n + '화 무료로 보기' : n === 1 ? '1화 무료로 보기' : '지금 보러가기';
  }
  const AUTO_BENEFIT = /^(1~\d+화|1화) 무료(로 보기)?$|^지금 보러가기$/;

  // 소재 칸이 요구하는 크기·길이
  function target(key) {
    const id = key.split('_')[1];
    if (id === 'sns') {
      const src = (snsSource(codeOf(key)) || {}).info || {};
      const wide = (src.w || 0) > (src.h || 0);
      return { id, W: wide ? 1920 : 1080, H: wide ? 1080 : 1920, kind: 'video', dur: src.dur || 0, name: '공식 계정용 예고편' };
    }
    const t = P.creativeTypes.find((c) => c.id === id);
    const e = window.Assets.expected(id, t ? t.spec : '9:16');
    let W = 1080, H = 1920;
    if (e.sizes.length) { W = e.sizes[0][0]; H = e.sizes[0][1]; }
    else if (e.ratios.length) { const a = e.ratios[0][0], b = e.ratios[0][1]; if (a > b) { W = 1920; H = Math.round(1920 * b / a / 2) * 2; } else { W = 1080; H = Math.round(1080 * b / a / 2) * 2; } }
    return { id, W, H, kind: e.kind, dur: e.dur, name: t ? t.name : '추가 소재' };
  }

  // ---------- 원본 열기 ----------
  function openMedia(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      if (file.type.startsWith('image/')) {
        const im = new Image();
        im.onload = () => res({ el: im, url, w: im.naturalWidth, h: im.naturalHeight, dur: 0, image: true });
        im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('읽을 수 없는 이미지')); };
        im.src = url;
        return;
      }
      const v = document.createElement('video');
      v.preload = 'auto'; v.playsInline = true; v.muted = true;
      v.onloadedmetadata = () => res({ el: v, url, w: v.videoWidth, h: v.videoHeight, dur: isFinite(v.duration) ? v.duration : 0, image: false });
      v.onerror = () => { URL.revokeObjectURL(url); rej(new Error('이 브라우저가 읽을 수 없는 영상입니다 (mp4 권장)')); };
      v.src = url;
    });
  }
  function seek(v, t) {
    if (!v.play) return Promise.resolve();
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', on); res(); };
      const on = () => { if (v.requestVideoFrameCallback) { v.requestVideoFrameCallback(fin); setTimeout(fin, 250); } else fin(); };
      v.addEventListener('seeked', on);
      setTimeout(fin, 4000);
      v.currentTime = clamp(t, 0, Math.max(0, (v.duration || t) - 0.05));
    });
  }

  // ---------- 원본 분석: 장면이 바뀌는 곳을 찾는다 ----------
  async function analyze(file, onp) {
    const m = await openMedia(file);
    try {
      const v = m.el, D = m.dur;
      const step = Math.max(1, D / 120);   // 많아야 120번 본다 (1분 영상에 30초쯤 걸린다)
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d', { willReadFrequently: true });
      const diffs = [];
      let prev = null;
      for (let t = 0; t < D; t += step) {
        await seek(v, t);
        x.drawImage(v, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data;
        if (prev) { let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); diffs.push(Math.round(s / 3072)); }
        prev = d;
        if (onp) onp(t / D);
      }
      return { w: m.w, h: m.h, dur: r1(D), step: Math.round(step * 100) / 100, diffs };
    } finally { URL.revokeObjectURL(m.url); }
  }
  // 길이 L초짜리 구간을 고른다: 장면이 바뀌는 곳에서 시작하고, 화면 변화가 많은(움직임이 큰) 구간을 우선한다.
  // avoid: 이미 다른 소재가 쓴 구간. 겹치면 점수를 깎아 소재마다 다른 장면이 나오게 한다.
  function pick(src, L, avoid) {
    const D = src.dur || 0;
    if (D <= L) return [0, Math.floor(D * 10) / 10];
    const d = src.diffs || [], st = src.step || 1;
    if (!d.length) return [0, L];
    const avg = d.reduce((a, b) => a + b, 0) / d.length;
    const thr = Math.max(18, avg * 1.5);
    // 후보: 원본의 모든 표본 지점. 장면이 바뀌는 곳에서 시작하면 가산점을 준다.
    const starts = [0];
    d.forEach((x, i) => starts.push((i + 1) * st));
    let best = null;
    starts.filter((c) => c + L <= D + 0.05).forEach((c, k) => {
      let sc = 1;
      d.forEach((x, i) => { const t = (i + 1) * st; if (t > c && t <= c + L) sc += Math.min(x, thr * 2); });
      if (c === 0 || d[k - 1] > thr) sc *= 1.25;
      (avoid || []).forEach((a) => { const ov = Math.min(c + L, a[1]) - Math.max(c, a[0]); if (ov > 0) sc *= 1 - 0.95 * ov / Math.min(L, a[1] - a[0]); });
      if (!best || sc > best.sc) best = { c, sc };
    });
    const c = best ? best.c : Math.max(0, (D - L) / 2);
    return [r1(Math.min(c, Math.max(0, D - L))), r1(Math.min(c + L, D))];
  }

  // ---------- 원본 영상 보관 ----------
  const srcSig = (code) => { const x = sources()[code]; return x ? x.name + '|' + x.size : ''; };
  async function setSource(code, file) {
    if (!file.type.startsWith('video/')) throw new Error('원본은 영상 파일이어야 합니다');
    const b = window.UI.busy('원본 영상을 분석하는 중 0%');
    try {
      const a = await analyze(file, (p) => b.set('원본 영상을 분석하는 중 ' + Math.round(p * 100) + '%'));
      if (!a.dur) throw new Error('영상 길이를 읽지 못했습니다');
      b.set('원본 영상을 보관하는 중');
      await window.Assets.raw.put('src|' + code, file);
      Store.update((s) => { (s.sources = s.sources || {})[code] = Object.assign({ name: file.name, size: file.size }, a); });
      return a;
    } finally { b.done(); }
  }

  // ---------- 자막 (.srt) ----------
  const subsOf = (code) => ((Store.state.subtitles = Store.state.subtitles || {})[code] || null);
  function parseSrt(text) {
    const sec = (x) => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(x); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +('0.' + m[4]) : NaN; };
    const cues = [];
    text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/).forEach((blk) => {
      const ls = blk.split('\n').map((l) => l.trim()).filter(Boolean);
      const i = ls.findIndex((l) => l.includes('-->'));
      if (i < 0) return;
      const tm = ls[i].split('-->');
      const a = sec(tm[0]), b = sec(tm[1]);
      const t = ls.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
      if (isFinite(a) && isFinite(b) && t) cues.push([Math.round(a * 100) / 100, Math.round(b * 100) / 100, t]);
    });
    return cues;
  }
  async function setSubs(code, file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let text;
    if (buf[0] === 0xff && buf[1] === 0xfe) text = new TextDecoder('utf-16le').decode(buf);
    else { try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('euc-kr').decode(buf); } }
    const cues = parseSrt(text);
    if (!cues.length) throw new Error('자막을 읽지 못했습니다 (.srt 형식인지 확인해 주세요)');
    Store.update((st) => { (st.subtitles = st.subtitles || {})[code] = { name: file.name, cues }; });
    return cues;
  }
  // 원본의 a~b초에 걸치는 자막만 뽑는다 (시각은 원본 기준 그대로).
  function cuesFor(code, a, b) {
    const sb = subsOf(code);
    return sb ? sb.cues.filter((c) => c[1] > a && c[0] < b).map((c) => c.slice()) : [];
  }
  const srcTime = (r, t) => { let x = t; for (const sg of r.segs) { const d = sg[1] - sg[0]; if (x <= d) return sg[0] + x; x -= d; } return r.segs[r.segs.length - 1][1]; };

  // ---------- 작품 포스터 (끝 화면에 넣는다) ----------
  // 직접 넣은 포스터(이 브라우저에 보관)를 먼저 쓰고, 없으면 posters/<작품 코드>.jpg 를 쓴다.
  const pcache = {};          // 작품 코드 → 이미지 또는 null
  const loadImg = (url) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
  async function posterOf(code) {
    if (code in pcache) return pcache[code];
    let im = null;
    try { const f = await window.Assets.raw.get('poster|' + code); if (f) im = await loadImg(URL.createObjectURL(f)); } catch (e) { /* 무시 */ }
    if (!im) im = await loadImg('posters/' + encodeURIComponent(code) + '.jpg');
    pcache[code] = im;
    return im;
  }
  async function setPoster(code, file) {
    const im = await loadImg(URL.createObjectURL(file));
    if (!im) throw new Error('읽을 수 없는 이미지입니다');
    await window.Assets.raw.put('poster|' + code, file);
    pcache[code] = im;
    Store.update((st) => { (st.posters = st.posters || {})[code] = { name: file.name }; });
  }
  function drawPoster(ctx, im, cx, top, bw, bh, U) {
    const k = Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
    const pw = im.naturalWidth * k, ph = im.naturalHeight * k, x = cx - pw / 2, y = top + (bh - ph) / 2, rad = 18 * U;
    const path = () => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, pw, ph, rad); else ctx.rect(x, y, pw, ph); };
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 36 * U; ctx.shadowOffsetY = 10 * U;
    ctx.fillStyle = '#000'; path(); ctx.fill();
    ctx.restore();
    ctx.save(); path(); ctx.clip(); ctx.drawImage(im, x, y, pw, ph); ctx.restore();
    ctx.save(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 3 * U; ctx.strokeStyle = 'rgba(255,255,255,.85)'; path(); ctx.stroke(); ctx.restore();
  }

  // ---------- 작품 폴더에서 골라내기 ----------
  // 폴더 안 파일 목록에서 원본 영상(예고편 우선, 없으면 1화), 그 영상의 자막, 포스터를 고른다.
  const TRAILER = /예고|trailer|티저|teaser|ep[._ -]?0?0(?!\d)|(^|[^0-9])0화/;
  const EP1 = /ep[._ -]?0?1(?!\d)|(^|[^0-9])0?1화|(^|[^0-9])1회|[_ -]0?01\.[a-z0-9]+$/;
  function pickFromFolder(files) {
    const list = [...files].map((f) => ({ f, p: (f.webkitRelativePath || f.name).toLowerCase(), n: f.name.toLowerCase() }));
    const stem = (n) => n.replace(/\.[a-z0-9]+$/, '').replace(/[_ -]?(clean|v\d+|final|ko|kor|en|eng)$/g, '').replace(/[_ -]?(clean|v\d+|final)$/g, '');
    const dir = (x) => x.p.slice(0, x.p.lastIndexOf('/') + 1);
    const best = (arr, score) => arr.map((x) => ({ x, s: score(x) })).sort((a, b) => b.s - a.s || (a.x.p < b.x.p ? -1 : 1))[0];
    const vids = list.filter((x) => /\.(mp4|mov|m4v|webm|mkv)$/.test(x.n));
    const v = best(vids, (x) => (TRAILER.test(x.p) ? 100 : EP1.test(x.p) ? 40 : 0) + (/clean|클린|자막\s*없/.test(x.n) ? 10 : 0) + (/\.mp4$/.test(x.n) ? 5 : 0) - (/[_ -](en|eng)\./.test(x.n) ? 5 : 0));
    const video = v ? v.x : null;
    const kind = !video ? '' : TRAILER.test(video.p) ? '예고편' : EP1.test(video.p) ? '1화' : '첫 영상';
    let subs = null;
    if (video) {
      const vs = stem(video.n);
      const sb = best(list.filter((x) => /\.srt$/.test(x.n)), (x) => {
        const ss = stem(x.n);
        const rel = (vs.startsWith(ss) || ss.startsWith(vs) ? 50 : 0) + (kind === '예고편' && TRAILER.test(x.p) ? 30 : 0) + (kind === '1화' && EP1.test(x.p) && !TRAILER.test(x.p) ? 30 : 0);
        return rel ? rel + (dir(x) === dir(video) ? 20 : 0) - (/[_ -](en|eng)\.srt$/.test(x.n) ? 40 : 0) + (/[_ -](ko|kor)\.srt$/.test(x.n) ? 10 : 0) : -1;
      });
      if (sb && sb.s > 0) subs = sb.x;
    }
    const po = best(list.filter((x) => /\.(jpe?g|png|webp)$/.test(x.n)), (x) => (/포스터|poster/.test(x.p) ? 50 : 0) + (/키비주얼|key ?visual|kv/.test(x.p) ? 20 : 0) + (/세로|vertical|9x16|9_16/.test(x.p) ? 10 : 0) - (/가로|horizontal|16x9|16_9/.test(x.p) ? 10 : 0) - (/스틸|still|로고|logo|썸네일|thumb/.test(x.p) ? 60 : 0));
    return { video: video && video.f, kind, subs: subs && subs.f, poster: po && po.s > 0 ? po.x.f : null, counts: { files: list.length, videos: vids.length } };
  }
  async function setFolder(code, files) {
    const c = pickFromFolder(files);
    const got = [], miss = [];
    if (c.video) { await setSource(code, c.video); got.push(c.kind + ' ' + c.video.name); } else miss.push('영상');
    if (c.subs) { try { const cu = await setSubs(code, c.subs); got.push('자막 ' + c.subs.name + ' (' + cu.length + '줄)'); } catch (e) { miss.push('자막(읽지 못함)'); } } else miss.push('자막');
    if (c.poster) { try { await setPoster(code, c.poster); got.push('포스터 ' + c.poster.name); } catch (e) { miss.push('포스터(읽지 못함)'); } } else miss.push('포스터');
    return { got, miss, counts: c.counts };
  }

  // ---------- 편집 내용 기본값 ----------
  function defaults(key) {
    const T = target(key), code = codeOf(key);
    const w = Store.state.works.find((x) => x.code === code) || {};
    const wd = (window.WORKS_DATA || []).find((x) => x.title === w.title && x.cp === w.cp) || {};
    const src = sources()[code] || { dur: 0 };
    const used = window.Calc.creativeIds(code).map((id) => ((Store.state.creatives[code + '_' + id] || {}).edit || {})).filter((e) => e.src === 'src|' + code && e.segs).map((e) => e.segs[0]);
    const L = T.dur || 15;
    const seg = pick(src, L, used);
    const base15 = T.kind === 'image' ? pick(src, 15, []) : seg;
    return {
      subsOn: true, cues: T.kind === 'image' ? [] : cuesFor(code, seg[0], seg[1]),
      poster: true, posterTitle: true,
      src: 'src|' + code, segs: [seg], at: r1(clamp(base15[0] + ({ im01: 2, im02: 6, bn01: 10 }[T.id] || 3), 0, Math.max(0, src.dur - 0.2))),
      fit: 'auto', pos: 50, genre: wd.genre || '', title: w.title || '', sub: '', hook: '',
      cta1: FORM.cta1, cta2: FORM.cta2, benefit: freeText(code), end: L <= 6 ? 1.6 : 3.2, fmt: 2,
    };
  }

  // ---------- 그리기 ----------
  function wrap(ctx, text, maxW, maxLines) {
    const lines = [];
    String(text).split(/\n/).forEach((para) => {
      let line = '';
      para.split(/(\s+)/).forEach((tok) => {
        if (ctx.measureText(line + tok).width <= maxW || !line.trim()) line += tok;
        else { lines.push(line.trim()); line = tok.trimStart(); }
      });
      if (line.trim()) lines.push(line.trim());
    });
    return lines.slice(0, maxLines || 2);
  }
  function fitFont(ctx, text, weight, size, family, maxW) {
    let s = size;
    do { ctx.font = weight + ' ' + Math.round(s) + 'px ' + family; s *= 0.94; } while (ctx.measureText(text).width > maxW && s > size * 0.5);
  }
  function shadow(ctx, on, U) { ctx.shadowColor = on ? 'rgba(0,0,0,.75)' : 'transparent'; ctx.shadowBlur = on ? 10 * U : 0; ctx.shadowOffsetY = on ? 2 * U : 0; }
  // 로고(재생 아이콘 + 원드라마). x는 align에 따라 왼쪽·가운데·오른쪽 기준, y는 세로 가운데.
  function logo(ctx, x, y, size, align) {
    ctx.font = '700 ' + Math.round(size * 0.74) + 'px ' + FORM.sans;
    const tw = ctx.measureText('원드라마').width, gap = size * 0.24, w = size + gap + tw;
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    if (icon.naturalWidth) ctx.drawImage(icon, x0, y - size / 2, size, size);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('원드라마', x0 + size + gap, y + size * 0.03);
  }
  let tiny = null;
  function drawSource(ctx, T, el, iw, ih, r) {
    const W = T.W, H = T.H, sr = iw / ih, tr = W / H;
    const fit = r.fit === 'auto' || !r.fit ? (Math.max(sr / tr, tr / sr) > 1.4 ? 'blur' : 'cover') : r.fit;
    const pos = (r.pos == null ? 50 : r.pos) / 100;
    if (fit === 'blur') {
      // 작게 줄였다 키워 흐린 배경을 만든다 (빠르다).
      tiny = tiny || document.createElement('canvas');
      tiny.width = 96; tiny.height = Math.max(16, Math.round(96 / tr));
      const tc = tiny.getContext('2d');
      tc.filter = 'blur(5px)';
      const s0 = Math.max(tiny.width / iw, tiny.height / ih);
      tc.drawImage(el, (tiny.width - iw * s0) / 2, (tiny.height - ih * s0) / 2, iw * s0, ih * s0);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tiny, 0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
      const s = Math.min(W / iw, H / ih);
      ctx.drawImage(el, (W - iw * s) / 2, (H - ih * s) * (sr > tr ? pos : 0.5), iw * s, ih * s);
    } else {
      const s = Math.max(W / iw, H / ih);
      ctx.drawImage(el, (W - iw * s) * (sr > tr ? pos : 0.5), (H - ih * s) * (sr > tr ? 0.5 : pos), iw * s, ih * s);
    }
  }
  // ---------- 끝 화면 (영상) ----------
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const frac = (x) => x - Math.floor(x);
  function star(ctx, x, y, rad) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? rad * 0.28 : rad; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
  }
  // 제목을 두 줄까지 나눈다. 쉼표가 있으면 거기서 먼저 끊는다.
  function titleLines(ctx, title, maxW, size) {
    const t = String(title || '').trim();
    if (!t) return { lines: [], size };
    let sz = size, lines;
    for (;;) {
      ctx.font = '800 ' + Math.round(sz) + 'px ' + FORM.sans;
      const i = t.indexOf(', ');
      const byComma = i > 0 ? [t.slice(0, i + 1), t.slice(i + 2)] : null;
      lines = byComma && byComma.every((l) => ctx.measureText(l).width <= maxW) ? byComma : wrap(ctx, t, maxW, 3);
      if ((lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) || sz < size * 0.55) break;
      sz *= 0.93;
    }
    return { lines: lines.slice(0, 2), size: sz };
  }
  // 포스터 가장자리를 투명하게 풀어 준 그림. 한 번 만들어 두고 다시 쓴다.
  function feathered(m, im, w, h, tall) {
    const key = w + 'x' + h + (tall ? 't' : 'w');
    if (m._pf && m._pf.key === key && m._pf.im === im) return m._pf.cv;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.drawImage(im, 0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    const fade = (x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((st) => g.addColorStop(st[0], 'rgba(0,0,0,' + st[1] + ')')); c.fillStyle = g; c.fillRect(0, 0, w, h); };
    fade(0, 0, w, 0, [[0, 0], [0.12, 1], [0.88, 1], [1, 0]]);                              // 좌우
    fade(0, 0, 0, h, tall ? [[0, 1], [0.93, 1], [1, 0]] : [[0, 0], [0.08, 1], [0.92, 1], [1, 0]]);   // 위아래 (세로 화면은 위가 화면 끝이라 아래만)
    m._pf = { key, im, cv };
    return cv;
  }
  // e: 끝 화면이 시작된 뒤 지난 시간(초). 참조 영상은 3.2초짜리라, 더 짧으면 같은 비율로 빨라진다.
  function drawEnd(ctx, T, m, r, e, end, U) {
    const W = T.W, H = T.H, tall = H >= W * 1.2;
    const k = Math.min(1, end / 3.2);
    const prog = (t0, d) => clamp((e - t0 * k) / ((d || 0.22) * k), 0, 1);
    const po = r.poster !== false && m.poster ? m.poster : null;
    const baked = !!po && r.posterTitle !== false;      // 포스터에 제목이 있다 → 제목 글자를 쓰지 않는다
    const pw = po ? po.naturalWidth : 0, ph = po ? po.naturalHeight : 0;
    ctx.shadowColor = 'transparent'; ctx.globalAlpha = 1;

    // 바탕: 화면이 바로 바뀐다 (참조 영상은 페이드 없이 컷).
    if (po || !m.el) { ctx.fillStyle = FORM.bg; ctx.fillRect(0, 0, W, H); }
    else { ctx.fillStyle = 'rgba(8,8,12,.88)'; ctx.fillRect(0, 0, W, H); }
    let cx = W / 2, mw = W;
    if (po && tall && !baked) {
      // 제목 없는 그림: 위쪽에 가로를 꽉 채우고 아래로 갈수록 어두워진다 (참조 영상과 같은 배치).
      const s0 = W / pw;
      ctx.drawImage(po, 0, 0, W, ph * s0);
      const g = ctx.createLinearGradient(0, H * 0.36, 0, H * 0.6);
      g.addColorStop(0, 'rgba(8,8,12,0)'); g.addColorStop(1, FORM.bg);
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.36, W, H * 0.24 + 1);
      ctx.fillStyle = FORM.bg; ctx.fillRect(0, H * 0.6, W, H * 0.4);
    } else if (po) {
      // 제목이 든 포스터(또는 가로·정사각 화면): 포스터를 제목까지 그대로 보여 주고,
      // 테두리 없이 가장자리를 흐려 바탕에 자연스럽게 녹인다. 글자는 그 아래(가로는 오른쪽)에 둔다.
      const box = tall ? [W * 0.5, 0, W * 0.78, H * 0.76] : [W * 0.23, H * 0.03, W * 0.42, H * 0.94];
      const s0 = Math.min(box[2] / pw, box[3] / ph), dw = Math.round(pw * s0), dh = Math.round(ph * s0), x = box[0] - dw / 2, y = box[1] + (tall ? 0 : (box[3] - dh) / 2);
      // 뒤에는 같은 포스터를 흐리고 어둡게 깔아 빈 곳을 채운다.
      ctx.save(); ctx.filter = 'blur(' + Math.round(40 * U) + 'px)'; ctx.globalAlpha = 0.4;
      const sb = Math.max(W / pw, H / ph) * 1.08; ctx.drawImage(po, (W - pw * sb) / 2, (H - ph * sb) / 2, pw * sb, ph * sb);
      ctx.restore();
      ctx.drawImage(feathered(m, po, dw, dh, tall), x, y);
      if (tall) {
        const g = ctx.createLinearGradient(0, H * 0.7, 0, H * 0.8);
        g.addColorStop(0, 'rgba(8,8,12,0)'); g.addColorStop(1, 'rgba(8,8,12,.9)');
        ctx.fillStyle = g; ctx.fillRect(0, H * 0.7, W, H * 0.1 + 1);
        ctx.fillStyle = 'rgba(8,8,12,.9)'; ctx.fillRect(0, H * 0.8, W, H * 0.2);
      } else {
        const g = ctx.createLinearGradient(W * 0.4, 0, W * 0.6, 0);
        g.addColorStop(0, 'rgba(8,8,12,0)'); g.addColorStop(1, 'rgba(8,8,12,.7)');
        ctx.fillStyle = g; ctx.fillRect(W * 0.4, 0, W * 0.6, H);
        cx = W * 0.72; mw = W * 0.54;
      }
    }

    // 글자 묶음: 제목(1~2줄) → 지금 원스토어에서 → 로고 → 작은 문구 → 버튼. 간격은 참조 영상에서 잰 값.
    const sc = tall ? 1 : Math.min(1, mw / (760 * U));
    const u = U * sc;
    const tl = baked ? { lines: [], size: 0 } : titleLines(ctx, r.title, mw - 120 * u, 94 * u);
    const tag = String(r.cta1 || '').replace(/[,\s]+$/, '');
    const items = [];
    tl.lines.forEach((l, i) => items.push({ k: 'title', text: l, gap: i ? 129 * u * (tl.size / (94 * u)) : 0 }));
    if (r.cta2) items.push({ k: 'c2', gap: items.length ? 136 * u : 0 });
    const tight = baked && tall;
    items.push({ k: 'logo', gap: items.length ? (tight ? 108 : 125) * u : 0 });
    if (tag) items.push({ k: 'tag', gap: (tight ? 104 : r.benefit ? 127 : 110) * u });
    if (r.benefit) items.push({ k: 'cta', gap: (tag ? 72 : 140) * u });
    const span = items.reduce((x, it) => x + it.gap, 0);
    // 세로: 버튼이 참조 영상과 같은 높이(91.8%)에 오게 아래에서부터 쌓는다. 가로: 세로 가운데.
    let y = tall ? H * (r.benefit ? 0.918 : tag ? 0.89 : 0.83) - span : (H - span) / 2;
    // 등장 시각(초, 3.2초 기준): 제목 줄마다 0.2초, 이어서 둘째 줄 낱말이 하나씩, 로고, 작은 문구와 버튼.
    const base = 0.17 + 0.2 * tl.lines.length;
    const at = { c2: base, logo: base + 0.5, tag: base + 0.9, cta: base + 0.95 };
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let nTitle = 0;
    items.forEach((it) => {
      y += it.gap;
      if (it.k === 'title') {
        const p = easeOut(prog(0.17 + 0.2 * nTitle++));
        if (p <= 0) return;
        ctx.globalAlpha = p; ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(tl.size) + 'px ' + FORM.sans;
        ctx.fillText(it.text, cx, y + (1 - p) * 26 * u);
      }
      if (it.k === 'c2') {
        fitFont(ctx, r.cta2, 700, 48 * u, FORM.sans, mw - 120 * u);
        const i = r.cta2.indexOf(FORM.hi), full = ctx.measureText(r.cta2).width, x0 = cx - full / 2;
        const parts = i >= 0 ? [r.cta2.slice(0, i), FORM.hi, r.cta2.slice(i + FORM.hi.length)] : [r.cta2];
        let x = x0;
        ctx.textAlign = 'left';
        parts.forEach((txt, n) => {
          const w = ctx.measureText(txt).width, p = easeOut(prog(at.c2 + [0, 0.1, 0.23][n], 0.12));
          if (p > 0 && txt) {
            ctx.globalAlpha = p;
            if (n === 1) { ctx.fillStyle = FORM.blue; ctx.fillRect(x - 6 * u, y - 33 * u, w + 12 * u, 66 * u); }
            ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + 2 * u);
          }
          x += w;
        });
        ctx.textAlign = 'center';
      }
      if (it.k === 'logo') {
        const el = e / k - at.logo;       // 로고가 뜬 뒤 지난 시간 (3.2초 기준)
        if (el < 0) return;
        // 원이 빠르게 퍼졌다가 사라지고, 별이 원 둘레에서 반짝이며 흩어진다.
        const life = 0.95, q = clamp(el / life, 0, 1);
        if (q < 1) {
          const rad = (165 + 100 * easeOut(el / 0.28)) * u, fade = 1 - clamp((el - 0.3) / (life - 0.3), 0, 1);
          ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = '#4a4fd6'; ctx.lineWidth = 3 * u;
          ctx.beginPath(); ctx.arc(cx, y, rad, 0, Math.PI * 2); ctx.stroke();
          for (let i = 0; i < 18; i++) {
            const a = i * 2.39996 + 0.4, f = 0.78 + 0.62 * frac(i * 0.618 + 0.13), tw = 0.55 + 0.45 * Math.sin(el * 14 + i * 1.7);
            const rr = rad * f + 30 * u * q;
            ctx.globalAlpha = fade * tw; ctx.fillStyle = i % 3 ? '#8f96ff' : '#fff';
            star(ctx, cx + Math.cos(a) * rr * 1.25, y + Math.sin(a) * rr * 0.8, (5 + 8 * frac(i * 0.37)) * u);
          }
        }
        const p = easeOut(el / 0.25), z = 0.72 + 0.28 * p;
        ctx.globalAlpha = p;
        ctx.save(); ctx.translate(cx, y); ctx.scale(z, z); logo(ctx, 0, 0, 78 * u, 'center'); ctx.restore();
        ctx.textAlign = 'center';
      }
      if (it.k === 'tag') {
        const p = easeOut(prog(at.tag, 0.35));
        if (p <= 0) return;
        ctx.globalAlpha = p; ctx.fillStyle = '#c9cdf5';
        fitFont(ctx, tag, 500, 30 * u, FORM.sans, mw - 120 * u); ctx.fillText(tag, cx, y + (1 - p) * 14 * u);
      }
      if (it.k === 'cta') {
        const p = easeOut(prog(at.cta, 0.35));
        if (p <= 0) return;
        fitFont(ctx, r.benefit, 800, 48 * u, FORM.sans, mw - 220 * u);
        const bw = ctx.measureText(r.benefit).width + 96 * u, bh = 86 * u, yy = y + (1 - p) * 14 * u;
        ctx.globalAlpha = p;
        ctx.save(); ctx.shadowColor = 'rgba(80,98,248,.65)'; ctx.shadowBlur = 34 * u; ctx.fillStyle = FORM.blue;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - bw / 2, yy - bh / 2, bw, bh, bh / 2); else ctx.rect(cx - bw / 2, yy - bh / 2, bw, bh); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#fff'; ctx.fillText(r.benefit, cx, yy + 2 * u);
      }
    });
    ctx.globalAlpha = 1;
  }
  // t: 만들어지는 영상의 시각(초), total: 전체 길이. still이면 이미지 카드로 그린다.
  function draw(ctx, T, m, r, t, total, still) {
    const W = T.W, H = T.H, U = Math.min(W, H) / 1080, tall = H >= W * 1.2;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    drawSource(ctx, T, m.el, m.w, m.h, r);

    // 위쪽 띠: 장르, 제목, 로고
    if (still) {
      const g = ctx.createLinearGradient(0, 0, 0, 380 * U);
      g.addColorStop(0, 'rgba(0,0,0,.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, 380 * U);
    }
    shadow(ctx, true, U);
    logo(ctx, W - 42 * U, (tall ? 125 : 70) * U, 42 * U, 'right');
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    if (!still) { /* 영상은 로고만 */ } else if (tall) {
      ctx.textAlign = 'center';
      if (r.genre) { ctx.font = '500 ' + Math.round(30 * U) + 'px ' + FORM.sans; ctx.fillText(r.genre, W / 2, 178 * U); }
      if (r.title) { fitFont(ctx, r.title, 800, 52 * U, FORM.sans, W - 120 * U); ctx.fillText(r.title, W / 2, 240 * U); }
    } else {
      ctx.textAlign = 'left';
      if (r.genre) { ctx.font = '500 ' + Math.round(26 * U) + 'px ' + FORM.sans; ctx.fillText(r.genre, 48 * U, 50 * U); }
      if (r.title) { fitFont(ctx, r.title, 800, 42 * U, FORM.sans, W * 0.62); ctx.fillText(r.title, 48 * U, (r.genre ? 98 : 66) * U); }
    }

    // 첫 3초 자막 (소리 없이 봐도 상황이 읽히게)
    if (!still && r.sub && t < 3) {
      ctx.globalAlpha = clamp((3 - t) / 0.3, 0, 1);
      ctx.textAlign = 'center'; ctx.font = '800 ' + Math.round(48 * U) + 'px ' + FORM.sans;
      const ls = wrap(ctx, r.sub, W - 140 * U, 2);
      ls.forEach((l, i) => ctx.fillText(l, W / 2, H - (tall ? 420 : 200) * U + (i - (ls.length - 1)) * 62 * U));
      ctx.globalAlpha = 1;
    }
    // 원본 자막: 원본 시각에 맞는 줄을 아래쪽에 그린다. 끝 화면에서는 함께 어두워진다.
    if (!still && r.subsOn !== false && r.cues && r.cues.length) {
      const ts = srcTime(r, t);
      const cue = r.cues.find((c) => ts >= c[0] && ts < c[1]);
      const e0 = Math.min(r.end == null ? 3 : r.end, total * 0.5);
      const fade = e0 > 0 ? 1 - clamp((t - (total - e0)) / 0.4, 0, 1) : 1;   // 끝 화면이 뜨면 자막은 사라진다
      if (cue && cue[2] && fade > 0) {
        ctx.globalAlpha = fade;
        ctx.textAlign = 'center'; ctx.font = '800 ' + Math.round(46 * U) + 'px ' + FORM.sans;
        ctx.lineWidth = 6 * U; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineJoin = 'round';
        const ls = wrap(ctx, cue[2], W - 120 * U, 2);
        ls.forEach((l, i) => { const yy = H - (tall ? 300 : 110) * U + i * 60 * U; ctx.strokeText(l, W / 2, yy); ctx.fillText(l, W / 2, yy); });
        ctx.globalAlpha = 1;
      }
    }
    shadow(ctx, false, U);

    // 끝 화면
    const end = Math.min(r.end == null ? 3 : r.end, total * 0.5);
    if (!still) {
      if (end > 0 && t >= total - end) drawEnd(ctx, T, m, r, t - (total - end), end, U);
      ctx.restore();
      return;
    }
    const a = 1;
    if (a > 0) {
      ctx.globalAlpha = a;
      const c1 = (tall || W === H || still) && r.cta1 && r.cta1.indexOf(' ') > 0 && r.cta1.length > 8
        ? [r.cta1.slice(0, r.cta1.lastIndexOf(' ')), r.cta1.slice(r.cta1.lastIndexOf(' ') + 1)] : (r.cta1 ? [r.cta1] : []);
      const s1 = (still ? 66 : tall ? 88 : 80) * U;
      const hookIn = r.hook && !(tall && !still);          // 세로 영상은 한 줄 문구를 위쪽 띠에 따로 그린다
      // 포스터가 있으면: 세로는 글자 위에, 가로는 왼쪽에 두고 글자를 오른쪽으로 민다.
      const po = !still && r.poster !== false && m.poster ? m.poster : null;
      const cx = po && !tall ? W * 0.64 : W / 2, mw = po && !tall ? W * 0.62 : W;
      const blocks = [];
      if (hookIn) blocks.push({ k: 'hook', h: 70 * U });
      c1.forEach((l) => blocks.push({ k: 'c1', text: l, h: s1 * 1.28 }));
      if (r.cta2) blocks.push({ k: 'c2', h: 96 * U });
      blocks.push({ k: 'logo', h: 104 * U });
      if (r.benefit) blocks.push({ k: 'ben', h: 70 * U });
      const stackH = blocks.reduce((x, b) => x + b.h, 0);
      let y = still ? H - stackH - 56 * U : tall ? H * (po ? 0.62 : 0.6) : (H - stackH) / 2 + 24 * U;
      if (still) {
        const gb = ctx.createLinearGradient(0, y - 200 * U, 0, H);
        gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(0.45, 'rgba(6,6,14,.78)'); gb.addColorStop(1, 'rgba(6,6,14,.94)');
        ctx.fillStyle = gb; ctx.fillRect(0, y - 200 * U, W, H - y + 200 * U);
      } else {
        ctx.fillStyle = 'rgba(8,8,18,.6)'; ctx.fillRect(0, 0, W, H);
        const gb = ctx.createLinearGradient(0, H * 0.45, 0, H);
        gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, 'rgba(0,0,0,.7)');
        ctx.fillStyle = gb; ctx.fillRect(0, H * 0.45, W, H * 0.55);
      }
      if (r.hook && tall && !still) {
        const y0 = (po ? 300 : 340) * U, y1 = (po ? 490 : 600) * U;
        ctx.fillStyle = 'rgba(10,10,26,.55)'; ctx.fillRect(0, y0, W, y1 - y0);
        ctx.fillStyle = FORM.blue; ctx.fillRect(0, y0, W, 5 * U); ctx.fillRect(0, y1 - 5 * U, W, 5 * U);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '600 ' + Math.round((po ? 50 : 64) * U) + 'px ' + FORM.serif;
        const ls = wrap(ctx, r.hook, W - 120 * U, 2);
        ls.forEach((l, i) => ctx.fillText(l, W / 2, (y0 + y1) / 2 + (i - (ls.length - 1) / 2) * (po ? 70 : 92) * U));
      }
      if (po) {
        if (tall) { const top = (r.hook ? 525 : 320) * U; drawPoster(ctx, po, W / 2, top, W - 300 * U, y - 45 * U - top, U); }
        else drawPoster(ctx, po, W * 0.2, 130 * U, W * 0.3, H - 230 * U, U);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      blocks.forEach((b) => {
        const cy = y + b.h / 2;
        ctx.fillStyle = '#fff';
        if (b.k === 'hook') { fitFont(ctx, r.hook, 600, 46 * U, FORM.serif, mw - 120 * U); ctx.fillText(r.hook, cx, cy); }
        if (b.k === 'c1') { fitFont(ctx, b.text, 900, s1, FORM.sans, mw - 100 * U); ctx.fillText(b.text, cx, cy); }
        if (b.k === 'c2') {
          fitFont(ctx, r.cta2, 700, 52 * U, FORM.sans, mw - 120 * U);
          const i = r.cta2.indexOf(FORM.hi), full = ctx.measureText(r.cta2).width, x0 = cx - full / 2;
          if (i >= 0) {
            const pre = ctx.measureText(r.cta2.slice(0, i)).width, hw = ctx.measureText(FORM.hi).width;
            ctx.fillStyle = FORM.blue; ctx.fillRect(x0 + pre - 6 * U, cy - 36 * U, hw + 12 * U, 72 * U);
            ctx.fillStyle = '#fff';
          }
          ctx.fillText(r.cta2, cx, cy + 2 * U);
        }
        if (b.k === 'logo') logo(ctx, cx, cy, 72 * U, 'center');
        if (b.k === 'ben') { ctx.fillStyle = FORM.yellow; fitFont(ctx, r.benefit, 700, 40 * U, FORM.sans, mw - 120 * U); ctx.fillText(r.benefit, cx, cy); }
        ctx.textAlign = 'center';
        y += b.h;
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---------- 만들기 ----------
  // 편집 내용대로 영상(또는 이미지)을 만들어 파일로 돌려준다. ctl.stop을 켜면 멈춘다.
  async function make(key, r, onp, ctl) {
    const T = target(key);
    const file = await window.Assets.raw.get(r.src);
    if (!file) throw new Error('원본이 이 브라우저에 없습니다. 원본 영상을 다시 골라 주세요');
    const m = await openMedia(file);
    await iconReady;
    m.poster = await posterOf(codeOf(key));
    const v = m.el;
    const c = document.createElement('canvas'); c.width = T.W; c.height = T.H;
    const ctx = c.getContext('2d');
    let rec = null, ac = null;
    try {
      if (T.kind === 'image') {
        await seek(v, r.at || 0);
        draw(ctx, T, m, r, 0, 0, true);
        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        return new File([blob], key + '.png', { type: 'image/png' });
      }
      if (m.image) throw new Error('영상 칸은 원본이 영상이어야 합니다');
      const mime = MIMES.find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
      if (!mime) throw new Error('이 브라우저는 영상 만들기를 지원하지 않습니다 (크롬·엣지 권장)');
      const segs = r.segs, srcTotal = segs.reduce((x, s) => x + s[1] - s[0], 0), tail = r.tail || 0, total = srcTotal + tail;   // tail: 원본 뒤에 덧붙이는 끝 화면(초)
      const stream = c.captureStream(30);
      ac = new (window.AudioContext || window.webkitAudioContext)();
      await ac.resume();
      const gain = ac.createGain(), dest = ac.createMediaStreamDestination();
      ac.createMediaElementSource(v).connect(gain); gain.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      v.muted = false; v.volume = 1;
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000, audioBitsPerSecond: 128000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((res) => { rec.onstop = res; });
      let base = 0;
      for (const seg of segs) {
        await seek(v, seg[0]);
        draw(ctx, T, m, r, base, total, false);
        if (rec.state === 'inactive') rec.start(500); else rec.resume();
        await v.play();
        await new Promise((res, rej) => {
          const tick = () => {
            if (ctl && ctl.stop) { rej(new Error('멈췄습니다')); return; }
            const t = Math.min(srcTotal, base + Math.max(0, v.currentTime - seg[0]));
            draw(ctx, T, m, r, t, total, false);
            gain.gain.value = srcTotal - t < 0.5 ? Math.max(0, (srcTotal - t) / 0.5) : 1;
            if (onp) onp(t / total);
            if (v.currentTime >= seg[1] || v.ended) res(); else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        v.pause(); rec.pause(); base += seg[1] - seg[0];
      }
      if (tail > 0) {
        // 원본을 다 튼 뒤 끝 화면만 tail초 동안 더 그린다 (소리 없음).
        gain.gain.value = 0;
        rec.resume();
        const t0 = performance.now();
        await new Promise((res, rej) => {
          const tick = () => {
            if (ctl && ctl.stop) { rej(new Error('멈췄습니다')); return; }
            const e = (performance.now() - t0) / 1000;
            draw(ctx, T, m, r, Math.min(total, srcTotal + e), total, false);
            if (onp) onp(Math.min(1, (srcTotal + e) / total));
            if (e >= tail + 0.1) res(); else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        rec.pause();
      }
      rec.stop();
      await stopped;
      const type = mime.split(';')[0];
      return new File([new Blob(chunks, { type })], key + (type === 'video/mp4' ? '.mp4' : '.webm'), { type });
    } finally {
      try { if (v.pause) v.pause(); } catch (e) { /* 무시 */ }
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) { /* 무시 */ }
      try { if (ac) ac.close(); } catch (e) { /* 무시 */ }
      URL.revokeObjectURL(m.url);
    }
  }
  // 만들어서 소재 칸에 넣고, 편집 내용을 함께 저장한다 (나중에 「수정」으로 다시 연다).
  async function makeInto(key, r, onp, ctl) {
    if (r.poster == null) r.poster = true;
    if (r.src === 'src|' + codeOf(key)) r.srcSig = srcSig(codeOf(key));
    const file = await make(key, r, onp, ctl);
    const problems = await window.Assets.put(key, file);
    Store.update((s) => { const c = (s.creatives[key] = s.creatives[key] || {}); c.edit = r; c.file.made = true; });
    return problems;
  }

  // ---------- 공식 계정용 예고편 ----------
  // 원본 영상(예고편)을 자르지 않고 통째로 우리 형식(오른쪽 위 로고, 자막, 뒤에 끝 화면 3.2초)으로 만든다.
  // 광고 소재 칸과 따로 보관한다 (파일: IndexedDB 'sns|작품 코드', 정보: state.sns).
  const SNS_TAIL = 3.2;
  // 쓸 파일: 게시 칸에서 따로 고른 파일이 있으면 그것, 없으면 작품의 원본 영상.
  function snsSource(code) {
    const own = (Store.state.snsSrc || {})[code];
    if (own) return { key: 'snssrc|' + code, info: own, picked: true };
    const src = sources()[code];
    return src ? { key: 'src|' + code, info: src, picked: false } : null;
  }
  // 편집 값: 손으로 고친 것(state.snsEdit)이 있으면 그것, 없으면 기본값.
  function snsEdit(code) {
    const w = Store.state.works.find((x) => x.code === code) || {};
    const e = (Store.state.snsEdit || {})[code] || {};
    const src = snsSource(code);
    const canSubs = !!subsOf(code);
    return {
      title: e.title != null ? e.title : (w.title || ''),
      cta1: e.cta1 != null ? e.cta1 : FORM.cta1,
      benefit: e.benefit != null ? e.benefit : freeText(code),
      // 자막 파일은 작품의 원본 영상에 맞춘 것이라, 따로 고른 파일에는 기본으로 넣지 않는다.
      subsOn: canSubs && (e.subsOn != null ? e.subsOn : !(src && src.picked)),
      posterTitle: e.posterTitle != null ? e.posterTitle : true,
      end: e.end != null ? e.end : SNS_TAIL,
      canSubs,
    };
  }
  function snsRecipe(code) {
    const src = snsSource(code), e = snsEdit(code);
    return {
      src: src.key, segs: [[0, src.info.dur]], tail: e.end, end: e.end, fit: 'cover', pos: 50,
      subsOn: e.subsOn, cues: e.subsOn ? cuesFor(code, 0, src.info.dur) : [], poster: true, posterTitle: e.posterTitle,
      genre: '', title: e.title, sub: '', hook: '', cta1: e.cta1, cta2: FORM.cta2, benefit: e.benefit, fmt: 2,
    };
  }
  // 만든 뒤에 파일이나 편집 값이 바뀌었는지 보려고 남기는 표시.
  const snsSig = (code) => { const src = snsSource(code), e = snsEdit(code); return src ? [src.key, src.info.name, src.info.size, e.title, e.cta1, e.benefit, e.subsOn, e.posterTitle, e.end, !!pcache[code]].join('|') : ''; };
  // 게시 칸에 넣는 ①파일 선택 ②편집 ③확인.
  function snsPanel(code) {
    const src = snsSource(code), f = (Store.state.sns || {})[code], e = snsEdit(code);
    if (!(code in pcache)) posterOf(code).then(() => window.App.render(true));
    const po = pcache[code];
    const fin = '<input type="file" accept="video/*" data-chg="makerSnsFile" data-code="' + h(code) + '" hidden>';
    const step = (n, title, body, done) => '<div class="igstep' + (done ? ' done' : '') + '"><h3><span class="num">' + n + '</span> ' + title + '</h3>' + body + '</div>';
    const s1 = step(1, '예고편 파일 고르기',
      (src ? '<p style="margin:0 0 6px"><strong>' + h(src.info.name) + '</strong> <span class="muted small">' + src.info.w + '×' + src.info.h + ' · ' + src.info.dur + '초 · ' + (src.picked ? '여기서 고른 파일' : '작품의 원본 영상') + '</span></p>' : '<p class="muted" style="margin:0 0 6px">아직 고른 파일이 없습니다.</p>') +
      '<div class="actions"><label class="btn' + (src ? '' : ' primary') + ' upload">' + (src ? '다른 파일 고르기' : '파일 고르기') + fin + '</label>' +
      (src && src.picked && sources()[code] ? '<button class="link-btn" data-act="makerSnsUseSource" data-code="' + h(code) + '">작품의 원본 영상(' + h(sources()[code].name) + ') 쓰기</button>' : '') + '</div>' +
      (src && src.info.h < src.info.w ? '<p class="small muted" style="margin:6px 0 0">가로 영상입니다. 릴스는 세로(9:16)가 화면을 꽉 채웁니다.</p>' : ''), !!src);
    if (!src) return s1;
    const secs = Math.ceil(src.info.dur + e.end);
    const stale = f && f.sig && f.sig !== snsSig(code);
    const fld = (label, key, val, extra) => '<label class="mf"><span>' + label + '</span><input type="text" data-chg="makerSnsEdit" data-code="' + h(code) + '" data-f="' + key + '" value="' + h(val) + '"' + (extra || '') + '></label>';
    const chk = (label, key, on, dis) => '<label class="check"><input type="checkbox" data-chg="makerSnsEdit" data-code="' + h(code) + '" data-f="' + key + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '><span class="t">' + label + '</span></label>';
    const s2 = step(2, '우리 스타일로 편집',
      '<p class="small muted" style="margin:0 0 8px">예고편은 자르지 않고 통째로 씁니다. 오른쪽 위에 로고를 얹고, 끝에 포스터·「지금 원스토어에서」·로고·버튼이 나오는 끝 화면을 붙입니다.</p>' +
      '<div class="or-grid">' + fld('끝 화면 버튼 글자', 'benefit', e.benefit) + fld('끝 화면 작은 문구', 'cta1', e.cta1) + '</div>' +
      chk('자막 넣기' + (e.canSubs ? ' <span class="muted small">(' + h(subsOf(code).name) + (src.picked ? '. 작품의 원본 영상에 맞춘 자막이라 다른 파일이면 어긋날 수 있습니다' : '') + ')</span>' : ' <span class="muted small">(자막 파일 없음. 위 작품 칸에서 넣을 수 있습니다)</span>'), 'subsOn', e.subsOn, !e.canSubs) +
      '<p class="small" style="margin:8px 0 4px">끝 화면 포스터: ' + (po ? '<img class="pthumb" src="' + h(po.src) + '" alt="작품 포스터"> 있음' : '<span class="tag warn">없음</span> <span class="muted">위 작품 칸에서 포스터를 넣으면 끝 화면에 들어갑니다. 없으면 제목을 글자로 씁니다.</span>') + '</p>' +
      (po ? chk('포스터에 제목이 있음 <span class="muted small">(끄면 제목을 글자로 따로 쓴다)</span>', 'posterTitle', e.posterTitle) : '') +
      (!po || !e.posterTitle ? fld('끝 화면 제목', 'title', e.title) : '') +
      '<div class="actions" style="margin-top:10px"><button class="' + (!f || stale ? 'primary' : '') + '" data-act="makerSns" data-code="' + h(code) + '">' + (f ? '다시 만들기' : '홍보 영상 만들기') + ' (약 ' + (secs >= 90 ? Math.ceil(secs / 60) + '분' : secs + '초') + ')</button>' +
      (stale ? '<span class="tag warn">파일이나 편집 내용이 바뀌었습니다. 다시 만들어야 반영됩니다</span>' : '') + '</div>', !!f && !stale);
    const k = 'sns|' + code;
    const s3 = step(3, '만든 영상 확인',
      f ? '<p style="margin:0 0 6px"><strong>' + h(f.name) + '</strong> <span class="muted small">' + f.w + '×' + f.h + ' · ' + f.dur + '초 · ' + (f.size / 1048576).toFixed(1) + 'MB · ' + h(f.at) + ' 만듦</span>' +
          (/mp4/.test(f.type) ? '' : ' <span class="tag warn" title="이 브라우저가 MP4로 만들지 못했습니다. 인스타그램은 MP4·MOV만 받습니다. 크롬 최신판에서 다시 만들어 주세요">MP4 아님</span>') + '</p>' +
          '<div class="actions"><button class="primary" data-act="previewAsset" data-key="' + h(k) + '">미리보기</button><button data-act="downloadAsset" data-key="' + h(k) + '">내려받기</button></div>' +
          '<p class="small muted" style="margin:6px 0 0">로고 위치, 자막, 끝 화면의 포스터와 버튼 글자를 끝까지 보고 확인합니다. 고칠 것이 있으면 ②에서 고쳐 다시 만듭니다.</p>'
        : '<p class="muted" style="margin:0">②에서 만들면 여기서 미리 볼 수 있습니다.</p>', !!f && !stale);
    return s1 + s2 + s3;
  }
  const snsReady = (code) => { const f = (Store.state.sns || {})[code]; return f ? { file: f, stale: !!(f.sig && f.sig !== snsSig(code)) } : null; };
  Actions.makerSnsFile = (el) => {
    const file = el.files && el.files[0], code = el.dataset.code;
    if (!file) return false;
    if (!file.type.startsWith('video/')) { toast('영상 파일을 골라 주세요'); return false; }
    window.Assets.probe(file).then(async (m) => {
      if (!m.dur) throw new Error('영상 길이를 읽지 못했습니다');
      await window.Assets.raw.put('snssrc|' + code, file);
      Store.update((st) => { (st.snsSrc = st.snsSrc || {})[code] = { name: file.name, size: file.size, w: m.w, h: m.h, dur: m.dur }; });
      toast('예고편 파일을 넣었습니다 (' + m.dur + '초)');
    }).catch((e) => toast('파일을 넣지 못했습니다: ' + e.message));
    return false;
  };
  Actions.makerSnsUseSource = (el) => { const code = el.dataset.code; window.Assets.raw.del('snssrc|' + code); Store.update((st) => { if (st.snsSrc) delete st.snsSrc[code]; }); };
  Actions.makerSnsEdit = (el) => Store.update((st) => {
    const e = ((st.snsEdit = st.snsEdit || {})[el.dataset.code] = (st.snsEdit[el.dataset.code] || {}));
    e[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
  });
  Actions.makerSns = (el) => {
    const code = el.dataset.code, src = snsSource(code);
    if (!src) { toast('예고편 파일을 먼저 골라 주세요'); return false; }
    const key = code + '_sns', T = target(key), r = snsRecipe(code), sig = snsSig(code), secs = Math.ceil(src.info.dur + r.tail), ctl = { stop: false };
    const box = dialog('maker-run', '<h3>공식 계정용 예고편을 만드는 중</h3><p class="small muted">영상은 실제 길이만큼 걸립니다 (약 ' + secs + '초). 이 창을 다른 탭이나 창으로 가리면 멈추니 켜 둔 채 기다려 주세요.</p><p data-x="pct" style="font-size:22px;font-weight:700;margin:8px 0">0%</p><div class="row"><span class="spin" aria-hidden="true"></span><button data-x="stop">멈추기</button></div>');
    box.addEventListener('cancel', (ev) => ev.preventDefault());
    const btn = box.querySelector('[data-x=stop]'), pct = box.querySelector('[data-x=pct]');
    btn.onclick = () => { ctl.stop = true; };
    const done = (title) => { box.querySelector('h3').textContent = title; const sp = box.querySelector('.spin'); if (sp) sp.remove(); btn.textContent = '닫기'; btn.onclick = () => box.close(); window.App.render(true); };
    make(key, r, (x) => { pct.textContent = Math.round(x * 100) + '%'; }, ctl).then(async (file) => {
      await window.Assets.raw.put('sns|' + code, file);
      const d = new Date();
      Store.update((st) => { (st.sns = st.sns || {})[code] = { name: file.name, size: file.size, type: file.type, w: T.W, h: T.H, dur: r1(src.info.dur + r.tail), sig, at: (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }; });
      pct.textContent = '100%';
      done('만들었습니다. ③의 미리보기로 확인해 주세요');
    }).catch((e) => done('만들지 못했습니다: ' + e.message));
    return false;
  };

  // ---------- 작품 카드의 「원본 영상」 줄 ----------
  function sourceRow(code) {
    const src = sources()[code];
    const ids = window.Calc.creativeIds(code);
    const empty = ids.filter((id) => !(Store.state.creatives[code + '_' + id] || {}).file).length;
    const input = '<input type="file" accept="video/*" data-chg="makerSource" data-code="' + h(code) + '" hidden>';
    const sb = subsOf(code);
    const sin = '<input type="file" accept=".srt,.txt" data-chg="makerSubs" data-code="' + h(code) + '" hidden>';
    const subHtml = ' <span class="srcsub"><strong>자막</strong> ' + (sb ? h(sb.name) + ' <span class="muted small">' + sb.cues.length + '줄</span> <label class="link-btn">바꾸기' + sin + '</label>'
      : '<span class="muted">없음</span> <label class="btn sm upload">자막 파일(.srt) 넣기' + sin + '</label>') + '</span>';
    // 포스터가 있는지는 한 번 확인한 뒤 다시 그린다.
    if (!(code in pcache)) posterOf(code).then(() => window.App.render(true));
    const po = pcache[code];
    const pin = '<input type="file" accept="image/*" data-chg="makerPoster" data-code="' + h(code) + '" hidden>';
    const fin = '<input type="file" webkitdirectory data-chg="makerFolder" data-code="' + h(code) + '" hidden>';
    const made = madeKeys(code).length;
    const stale = [noSubKeys(code).length ? '자막' : '', noPosterKeys(code).length ? '포스터' : ''].filter(Boolean).join('·');
    const posterHtml = ' <span class="srcsub"><strong>포스터</strong> ' + (po ? '<img class="pthumb" src="' + h(po.src) + '" alt="작품 포스터"> <label class="link-btn">바꾸기' + pin + '</label>'
      : '<span class="muted">없음</span> <label class="btn sm upload">포스터 넣기' + pin + '</label>') + '</span>';
    return '<div class="srcrow' + (src ? '' : ' need') + '"><strong>원본 영상</strong> ' +
      (src ? '<span>' + h(src.name) + ' <span class="muted small">' + src.w + '×' + src.h + ' · ' + src.dur + '초</span></span> <label class="link-btn">바꾸기' + input + '</label> <label class="link-btn" title="작품 폴더를 고르면 예고편·자막·포스터를 다시 골라냅니다">폴더에서 다시 고르기' + fin + '</label>'
        : '<span class="muted">없음. 작품 폴더를 고르면 그 안에서 예고편(없으면 1화)·자막·포스터를 골라냅니다.</span> <label class="btn primary srcpick">＋ 작품 폴더 고르기' + fin + '</label> <label class="link-btn">영상 파일 하나만 고르기' + input + '</label>') +
      subHtml + posterHtml + (src && made ? ' <button class="sm' + (stale ? ' primary' : '') + '" data-act="makerRedoAll" data-code="' + h(code) + '" title="고쳐 둔 글자와 설정은 그대로 두고, 지금의 원본·자막·포스터로 다시 만듭니다">만든 소재 ' + made + '개 모두 다시 만들기' + (stale ? ' (' + stale + ' 반영)' : '') + '</button>' : '') + (src && empty ? ' <button class="sm primary" data-act="makerAuto" data-code="' + h(code) + '">빈 칸 ' + empty + '개 자동으로 만들기</button>' : '') + '</div>';
  }
  Actions.makerSource = (el) => {
    const file = el.files && el.files[0];
    if (!file) return false;
    setSource(el.dataset.code, file).then((a) => { toast('원본 영상을 넣었습니다 (' + a.dur + '초). 「빈 칸 자동으로 만들기」를 누르세요'); window.App.render(true); })
      .catch((e) => toast('원본을 넣지 못했습니다: ' + e.message));
    return false;
  };

  Actions.makerSubs = (el) => {
    const file = el.files && el.files[0];
    if (!file) return false;
    setSubs(el.dataset.code, file).then((c) => { toast('자막 ' + c.length + '줄을 넣었습니다. 이제 만드는 영상에 자막이 들어갑니다'); window.App.render(true); })
      .catch((e) => toast('자막을 넣지 못했습니다: ' + e.message));
    return false;
  };

  function dialog(cls, html) {
    const box = document.createElement('dialog');
    box.className = cls;
    box.innerHTML = html;
    document.body.appendChild(box);
    box.addEventListener('close', () => box.remove());
    box.showModal();
    return box;
  }

  // 여러 칸을 차례로 만든다. recipeOf(key)가 편집 내용을 준다.
  function runBatch(keys, recipeOf, what) {
    const secs = keys.reduce((a, k) => a + (target(k).dur || 1), 0);
    const ctl = { stop: false };
    const box = dialog('maker-run', '<h3>' + h(what) + ' ' + keys.length + '개를 만드는 중</h3><p class="small muted">영상은 실제 길이만큼 걸립니다 (모두 약 ' + Math.ceil(secs / 60) + '분). 이 창을 다른 탭이나 창으로 가리면 멈추니 켜 둔 채 기다려 주세요.</p><ol class="runlist">' +
      keys.map((k) => '<li data-k="' + h(k) + '">' + h(window.Calc.short(k)) + ' · ' + h(target(k).name) + ' <span class="st muted">대기</span></li>').join('') + '</ol><div class="row"><span class="spin" aria-hidden="true"></span><button data-x="stop">멈추기</button></div>');
    box.addEventListener('cancel', (ev) => ev.preventDefault());
    box.querySelector('[data-x=stop]').onclick = () => { ctl.stop = true; };
    (async () => {
      let ok = 0;
      for (const k of keys) {
        if (ctl.stop) break;
        const st = box.querySelector('li[data-k="' + k + '"] .st');
        try {
          const problems = await makeInto(k, recipeOf(k), (p) => { st.textContent = Math.round(p * 100) + '%'; }, ctl);
          st.textContent = problems.length ? '넣음 · 규격 확인: ' + problems[0] : '넣음 ✓';
          st.className = 'st ' + (problems.length ? 'warn-t' : 'ok-t');
          ok++;
        } catch (e) { st.textContent = '실패: ' + e.message; st.className = 'st bad-t'; }
      }
      box.querySelector('h3').textContent = (ctl.stop ? '멈췄습니다. ' : '끝났습니다. ') + ok + '개를 넣었습니다';
      const sp = box.querySelector('.spin'); if (sp) sp.remove();
      const b = box.querySelector('[data-x=stop]'); b.textContent = '닫기'; b.onclick = () => box.close();
      window.App.render(true);
    })();
  }
  // 빈 칸을 차례로 만든다.
  Actions.makerAuto = (el) => {
    const code = el.dataset.code;
    runBatch(window.Calc.creativeIds(code).map((id) => code + '_' + id).filter((k) => !(Store.state.creatives[k] || {}).file), defaults, '빈 칸');
    return false;
  };
  // 자막 없이 만든 영상: 자막 파일이 있는데 편집 내용에 자막이 없는 자동 제작 영상.
  function noSubKeys(code) {
    if (!subsOf(code)) return [];
    return window.Calc.creativeIds(code).map((id) => code + '_' + id).filter((k) => {
      const c = Store.state.creatives[k] || {};
      return c.file && c.file.made && target(k).kind === 'video' && c.edit && c.edit.src === 'src|' + code && c.edit.subsOn !== false && !(c.edit.cues || []).length && cuesFor(code, c.edit.segs[0][0], c.edit.segs[0][1]).length;
    });
  }
  // 포스터 없이 만든 영상: 포스터가 있는데 편집 내용에 포스터 표시가 없는 자동 제작 영상.
  function noPosterKeys(code) {
    if (!pcache[code]) return [];
    return window.Calc.creativeIds(code).map((id) => code + '_' + id).filter((k) => {
      const c = Store.state.creatives[k] || {};
      return c.file && c.file.made && target(k).kind === 'video' && c.edit && c.edit.poster == null;
    });
  }
  Actions.makerPoster = (el) => {
    const file = el.files && el.files[0];
    if (!file) return false;
    setPoster(el.dataset.code, file).then(() => { toast('포스터를 넣었습니다. 이제 만드는 영상의 끝 화면에 들어갑니다'); window.App.render(true); })
      .catch((e) => toast('포스터를 넣지 못했습니다: ' + e.message));
    return false;
  };
  // 이 사이트에서 만든 소재 (편집 내용이 남아 있어 다시 만들 수 있는 것)
  function madeKeys(code) {
    return window.Calc.creativeIds(code).map((id) => code + '_' + id).filter((k) => { const c = Store.state.creatives[k] || {}; return c.file && c.file.made && c.edit; });
  }
  // 다시 만들 때의 편집 내용: 고쳐 둔 글자·설정은 그대로 두고, 지금의 원본·자막·포스터를 반영한다.
  function redoRecipe(k) {
    const code = codeOf(k), T = target(k), src = sources()[code];
    const r = JSON.parse(JSON.stringify(Store.state.creatives[k].edit));
    r.poster = r.poster !== false;
    // 버튼 글자를 손으로 고치지 않았으면 문서의 무료 회차 수로 다시 맞춘다.
    if (T.kind === 'video' && (!r.benefit || AUTO_BENEFIT.test(r.benefit))) r.benefit = freeText(code);
    if (T.kind === 'video' && r.fmt !== 2) {
      if (r.posterTitle == null) r.posterTitle = true;
      if (r.cta1 === '깔 게 없는 숏드라마,') r.cta1 = FORM.cta1;
      const L = (T.dur || 15); r.end = L <= 6 ? 1.6 : Math.max(r.end || 0, 3.2);
      r.fmt = 2;
    }
    if (r.src !== 'src|' + code || !src) return r;          // 직접 올린 파일을 고쳐 만든 것은 그대로 다시 만든다
    const seg = r.segs[0];
    const others = window.Calc.creativeIds(code).map((id) => code + '_' + id).filter((x) => x !== k && target(x).kind === 'video')
      .map((x) => ((Store.state.creatives[x] || {}).edit || {})).filter((e) => e.src === r.src && e.segs).map((e) => e.segs[0]);
    const changed = (r.srcSig && r.srcSig !== srcSig(code)) || seg[1] > src.dur + 0.05 || (r.at || 0) > src.dur;
    const dup = /b$/.test(k) && others.some((sg) => sg[0] === seg[0] && sg[1] === seg[1]);   // 15초 A·B가 같은 구간이면 B를 다른 장면으로
    if (changed) { const d = defaults(k); r.segs = d.segs; r.at = d.at; r.cues = d.cues; }
    else if (dup) { r.segs = [pick(src, seg[1] - seg[0], others)]; r.cues = cuesFor(code, r.segs[0][0], r.segs[0][1]); }
    else if (T.kind === 'video' && r.subsOn !== false && !(r.cues || []).length) r.cues = cuesFor(code, seg[0], seg[1]);
    return r;
  }
  Actions.makerRedoAll = (el) => { runBatch(madeKeys(el.dataset.code), redoRecipe, '만든 소재'); return false; };
  Actions.makerRedo = (el) => { runBatch([el.dataset.key], redoRecipe, '소재'); return false; };
  Actions.makerFolder = (el) => {
    const files = el.files ? [...el.files] : [];
    el.value = '';
    if (!files.length) return false;
    const code = el.dataset.code;
    setFolder(code, files).then((x) => {
      const n = madeKeys(code).length;
      note('작품 폴더에서 골랐습니다', (x.got.length ? '<ul>' + x.got.map((g) => '<li>' + h(g) + '</li>').join('') + '</ul>' : '') +
        (x.miss.length ? '<p class="small muted">찾지 못한 것: ' + h(x.miss.join(', ')) + ' (폴더 안 파일 ' + x.counts.files + '개 중 영상 ' + x.counts.videos + '개). 아래 줄의 「바꾸기」·「넣기」로 직접 고를 수 있습니다.</p>' : '') +
        (n && x.got.length ? '<p class="small muted">이미 만든 소재 ' + n + '개는 「모두 다시 만들기」를 누르면 새 원본으로 다시 만듭니다.</p>' : ''));
      window.App.render(true);
    }).catch((e) => { toast('폴더에서 고르지 못했습니다: ' + e.message); window.App.render(true); });
    return false;
  };
  function note(title, html) {
    const box = dialog('maker-run', '<h3>' + h(title) + '</h3>' + html + '<div class="row"><button class="primary" data-x="close">확인</button></div>');
    box.querySelector('[data-x=close]').onclick = () => box.close();
  }

  // ---------- 편집기 ----------
  async function openEditor(key) {
    const T = target(key), code = codeOf(key);
    const cur = Store.state.creatives[key] || {};
    let r = cur.edit ? JSON.parse(JSON.stringify(cur.edit)) : null;
    if (!r) {
      r = defaults(key);
      if (cur.file && !cur.file.made) {
        // 직접 올린 파일을 고친다: 그 파일을 원본으로 삼는다.
        const f = await window.Assets.get(key);
        if (f) { await window.Assets.raw.put('srcof|' + key, f); r.src = 'srcof|' + key; r.segs = [[0, r1(Math.min(cur.file.dur || T.dur || 15, T.dur || 9999))]]; r.at = 0; }
      }
    }
    const file = await window.Assets.raw.get(r.src);
    if (!file) {
      const box = dialog('maker-run', '<h3>원본 영상이 필요합니다</h3><p class="small muted">이 작품의 1화나 예고편 파일을 고르면 원드라마 형식으로 잘라 넣을 수 있습니다. 파일은 이 브라우저에만 보관됩니다.</p><div class="row"><label class="btn primary">원본 영상 고르기<input type="file" accept="video/*" hidden></label> <button data-x="close">닫기</button></div>');
      box.querySelector('[data-x=close]').onclick = () => box.close();
      box.querySelector('input').onchange = (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        setSource(code, f).then(() => { box.close(); window.App.render(true); openEditor(key); }).catch((e) => toast('원본을 넣지 못했습니다: ' + e.message));
      };
      return;
    }
    const m = await openMedia(file);
    await iconReady;
    m.poster = await posterOf(code);
    const v = m.el;
    const isVid = T.kind === 'video';
    if (isVid && m.image) { URL.revokeObjectURL(m.url); toast('영상 칸은 원본이 영상이어야 합니다'); return; }
    const L = Math.min(T.dur || 9999, r1(r.segs[0][1] - r.segs[0][0])) || T.dur || 15;
    const maxStart = Math.max(0, r1(m.dur - L));
    const fld = (label, name, val, extra) => '<label class="mf"><span>' + label + '</span><input type="text" data-f="' + name + '" value="' + h(val || '') + '"' + (extra || '') + '></label>';
    const box = dialog('maker', '<div class="maker-head"><h3>' + h(window.Calc.short(key)) + ' · ' + h(T.name) + ' <span class="muted small">' + T.W + '×' + T.H + (isVid ? ' · ' + L + '초' : '') + '</span></h3><button class="sm" data-x="close">닫기</button></div>' +
      '<div class="maker-body"><div class="stage"><canvas width="' + T.W + '" height="' + T.H + '"></canvas>' +
      (isVid ? '<div class="transport"><button class="sm" data-x="play">▶ 재생</button><input type="range" data-x="scrub" min="0" max="' + L + '" step="0.05" value="0" aria-label="미리 보기 위치"><span class="small muted" data-x="clock"></span></div>' : '') + '</div>' +
      '<div class="fields"><p class="small muted">원본: ' + h(file.name) + (m.dur ? ' · ' + r1(m.dur) + '초' : '') + '</p>' +
      (m.image ? '' : isVid
        ? '<label class="mf"><span>시작 위치 (원본의 몇 초부터 ' + L + '초) <output data-x="startv"></output></span><input type="range" data-f="start" min="0" max="' + maxStart + '" step="0.1" value="' + r.segs[0][0] + '"></label><div class="row"><button class="sm" data-x="auto">다른 장면 자동으로 고르기</button></div>'
        : '<label class="mf"><span>쓸 장면 (원본의 몇 초) <output data-x="startv"></output></span><input type="range" data-f="at" min="0" max="' + Math.max(0, r1(m.dur - 0.2)) + '" step="0.1" value="' + (r.at || 0) + '"></label>') +
      '<label class="mf"><span>화면 맞춤</span><select data-f="fit"><option value="auto">자동</option><option value="cover">꽉 채우기 (잘림)</option><option value="blur">흐린 배경에 전체 넣기</option></select></label>' +
      '<label class="mf"><span>화면 위치</span><input type="range" data-f="pos" min="0" max="100" step="1" value="' + (r.pos == null ? 50 : r.pos) + '"></label>' +
      (isVid ? '<label class="check"><input type="checkbox" data-f="subsOn"' + (r.subsOn !== false ? ' checked' : '') + '><span class="t">원본 자막 넣기</span></label><div class="cues" data-x="cues"></div>' : '') +
      fld('장르 줄', 'genre', r.genre) + fld('제목', 'title', r.title) +
      (isVid ? fld('첫 3초 자막 (비우면 없음)', 'sub', r.sub, ' placeholder="예: 결혼식 날, 신랑이 사라졌다"') : '') +
      (isVid ? '' : fld('끝 화면 한 줄 (비우면 없음)', 'hook', r.hook, ' placeholder="예: 보낸 지 6분. 지울 수 없다."')) +
      fld(isVid ? '끝 화면 작은 문구' : '끝 화면 큰 글자', 'cta1', r.cta1) + fld('끝 화면 둘째 줄 (「원스토어」는 파란 상자)', 'cta2', r.cta2) + fld(isVid ? '끝 화면 버튼 글자' : '혜택 한 줄 (노란 글자)', 'benefit', r.benefit) +
      (isVid ? '<label class="check"><input type="checkbox" data-f="poster"' + (r.poster !== false ? ' checked' : '') + (m.poster ? '' : ' disabled') + '><span class="t">끝 화면에 작품 포스터 넣기' + (m.poster ? '' : ' <span class="muted small">(포스터 없음. 소재 화면에서 넣을 수 있습니다)</span>') + '</span></label>' : '') +
      (isVid ? '<label class="check"><input type="checkbox" data-f="posterTitle"' + (r.posterTitle !== false ? ' checked' : '') + (m.poster ? '' : ' disabled') + '><span class="t">포스터에 제목이 있음 <span class="muted small">(끄면 제목 글자를 따로 쓴다)</span></span></label>' : '') +
      (isVid ? '<label class="mf"><span>끝 화면 길이 (초)</span><input type="number" data-f="end" min="0" max="' + Math.floor(L / 2) + '" step="0.5" value="' + r.end + '"></label>' : '') +
      '<div class="row maker-go"><button class="primary" data-x="make">' + (cur.file ? '다시 만들어 바꿔 넣기' : '만들어서 넣기') + '</button><span class="small muted" data-x="msg">' + (isVid ? '만드는 데 약 ' + L + '초 걸립니다.' : '') + '</span></div></div></div>');
    const cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
    const q = (s) => box.querySelector(s);
    q('[data-f=fit]').value = r.fit || 'auto';
    const ownSrc = r.src === 'src|' + code;
    if (isVid && !r.cues) r.cues = ownSrc ? cuesFor(code, r.segs[0][0], r.segs[0][1]) : [];
    // 이 구간에 나오는 자막 줄을 보여 주고 글자를 고칠 수 있게 한다.
    const listCues = () => {
      const el = q('[data-x=cues]');
      if (!el) return;
      el.innerHTML = !subsOf(code) && ownSrc ? '<p class="small muted">자막 파일이 없습니다. 소재 화면의 「자막 파일(.srt) 넣기」로 넣으면 영상에 들어갑니다.</p>'
        : !(r.cues || []).length ? '<p class="small muted">이 구간에는 자막이 없습니다.</p>'
        : r.cues.map((c, i) => '<label class="cue"><span>' + Math.max(0, c[0] - r.segs[0][0]).toFixed(1) + '초</span><input type="text" data-cue="' + i + '" value="' + h(c[2]) + '"></label>').join('');
    };
    listCues();
    let t = isVid ? Math.max(0, L - 0.01) : 0, playing = false, busy = false, raf = 0;
    const srcT = (x) => (isVid ? r.segs[0][0] + x : (r.at || 0));
    const paint = () => draw(ctx, T, m, r, t, L, !isVid);
    const clock = () => { if (isVid) { q('[data-x=clock]').textContent = t.toFixed(1) + ' / ' + L + '초'; q('[data-x=scrub]').value = t; } };
    const show = async () => { await seek(v, srcT(t)); paint(); clock(); const o = q('[data-x=startv]'); if (o) o.textContent = (isVid ? r.segs[0][0] : r.at) + '초'; };
    const stop = () => { playing = false; cancelAnimationFrame(raf); if (v.pause) v.pause(); const b = q('[data-x=play]'); if (b) b.textContent = '▶ 재생'; };
    const play = async () => {
      if (t >= L - 0.1) t = 0;
      await seek(v, srcT(t));
      v.muted = false; playing = true; q('[data-x=play]').textContent = '❚❚ 멈춤';
      await v.play();
      const tick = () => {
        if (!playing) return;
        t = clamp(v.currentTime - r.segs[0][0], 0, L);
        paint(); clock();
        if (t >= L || v.ended) { stop(); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    box.addEventListener('input', (ev) => {
      const el = ev.target;
      if (busy) return;
      if (el.dataset.x === 'scrub') { stop(); t = +el.value; show(); return; }
      if (el.dataset.cue) { const c = r.cues[+el.dataset.cue]; c[2] = el.value; if (!playing) { t = clamp(c[0] - r.segs[0][0] + 0.1, 0, L); show(); } return; }
      const f = el.dataset.f;
      if (!f) return;
      if (f === 'subsOn') { r.subsOn = el.checked; if (!playing) show(); return; }
      if (f === 'posterTitle') { r.posterTitle = el.checked; if (!playing) { t = Math.max(0, L - 0.01); show(); } return; }
      if (f === 'poster') { r.poster = el.checked; if (!playing) { t = Math.max(0, L - 0.01); show(); } return; }
      if (f === 'start') { stop(); const a = r1(+el.value); r.segs = [[a, r1(a + L)]]; if (ownSrc) r.cues = cuesFor(code, a, a + L); listCues(); t = 0; show(); return; }
      if (f === 'at') { r.at = r1(+el.value); show(); return; }
      r[f] = f === 'pos' || f === 'end' ? +el.value : el.value;
      if (playing) return;
      if (['hook', 'cta1', 'cta2', 'benefit', 'end'].includes(f) && isVid) t = Math.max(0, L - 0.01);   // 끝 화면 글자를 고치면 끝 화면을 보여 준다
      if (f === 'sub') t = 0.5;
      show();
    });
    box.addEventListener('click', (ev) => {
      const x = ev.target.dataset && ev.target.dataset.x;
      if (!x) return;
      if (busy) { if (x === 'close') toast('만드는 중에는 닫을 수 없습니다'); return; }
      if (x === 'close') box.close();
      if (x === 'play') { if (playing) stop(); else play(); }
      if (x === 'auto') {
        stop();
        const src = sources()[code];
        if (!src || r.src !== 'src|' + code) { toast('직접 올린 파일은 자동으로 고를 장면 정보가 없습니다. 시작 위치를 직접 옮겨 주세요'); return; }
        r.tried = (r.tried || []).concat([r.segs[0]]);
        const seg = pick(src, L, r.tried);
        r.segs = [seg]; r.cues = cuesFor(code, seg[0], seg[1]); listCues(); q('[data-f=start]').value = seg[0]; t = 0; show();
      }
      if (x === 'make') {
        stop(); busy = true;
        const msg = q('[data-x=msg]'), btn = q('[data-x=make]');
        btn.disabled = true;
        const rr = JSON.parse(JSON.stringify(r)); delete rr.tried;
        makeInto(key, rr, (p) => { msg.textContent = '만드는 중 ' + Math.round(p * 100) + '% · 이 창을 가리지 마세요'; }).then((problems) => {
          toast(problems.length ? '넣었습니다. 규격 확인: ' + problems[0] : '만들어서 넣었습니다');
          busy = false; box.close(); window.App.render(true);
        }).catch((e) => { busy = false; btn.disabled = false; msg.textContent = '만들지 못했습니다: ' + e.message; });
      }
    });
    box.addEventListener('cancel', (ev) => { if (busy) ev.preventDefault(); });
    box.addEventListener('close', () => { stop(); URL.revokeObjectURL(m.url); });
    show();
  }
  Actions.makerOpen = (el) => { const b = window.UI.busy('편집기를 여는 중'); openEditor(el.dataset.key).catch((e) => toast('편집기를 열지 못했습니다: ' + e.message)).then(() => b.done()); return false; };

  window.Maker = { snsPanel, snsReady, sourceRow, setSource, setSubs, setPoster, posterOf, pickFromFolder, parseSrt, target, defaults, make, makeInto, analyze, pick, draw, openEditor };
})();
