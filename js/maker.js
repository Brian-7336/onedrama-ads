// 영상 만들기: 원본 영상(1화, 예고편 등)을 원드라마 홍보영상 형식으로 잘라 소재 칸에 넣는다.
// 형식은 SNS 홍보영상(2026-11)을 따른다: 위쪽 어두운 띠에 장르·제목, 오른쪽 위 로고,
// 끝 몇 초는 화면을 어둡게 하고 「깔 게 없는 숏드라마, / 지금 원스토어에서 / 로고 / 혜택 한 줄」.
// 모든 작업은 이 브라우저 안에서 한다. 영상은 실제 길이만큼 시간이 걸린다(15초 영상 = 15초).
(function () {
  const P = window.PLAN;
  const { h, toast } = window.UI;
  const FORM = {
    cta1: '깔 게 없는 숏드라마,', cta2: '지금 원스토어에서', hi: '원스토어', blue: '#5468ff', yellow: '#f6c453',
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

  // 소재 칸이 요구하는 크기·길이
  function target(key) {
    const id = key.split('_')[1];
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
    const thr = Math.max(22, avg * 2.5);
    const cuts = [0];
    d.forEach((x, i) => { if (x > thr) cuts.push((i + 1) * st); });
    let best = null;
    cuts.filter((c) => c + L <= D).forEach((c) => {
      let sc = 1;
      d.forEach((x, i) => { const t = (i + 1) * st; if (t > c && t <= c + L) sc += Math.min(x, thr * 2); });
      (avoid || []).forEach((a) => { const ov = Math.min(c + L, a[1]) - Math.max(c, a[0]); if (ov > 0) sc *= 1 - 0.9 * ov / Math.min(L, a[1] - a[0]); });
      if (!best || sc > best.sc) best = { c, sc };
    });
    const c = best ? best.c : Math.max(0, (D - L) / 2);
    return [r1(c), r1(c + L)];
  }

  // ---------- 원본 영상 보관 ----------
  async function setSource(code, file) {
    if (!file.type.startsWith('video/')) throw new Error('원본은 영상 파일이어야 합니다');
    toast('원본 영상을 분석하는 중입니다…');
    const a = await analyze(file);
    if (!a.dur) throw new Error('영상 길이를 읽지 못했습니다');
    await window.Assets.raw.put('src|' + code, file);
    Store.update((s) => { (s.sources = s.sources || {})[code] = Object.assign({ name: file.name, size: file.size }, a); });
    return a;
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
      src: 'src|' + code, segs: [seg], at: r1(clamp(base15[0] + ({ im01: 2, im02: 6, bn01: 10 }[T.id] || 3), 0, Math.max(0, src.dur - 0.2))),
      fit: 'auto', pos: 50, genre: wd.genre || '', title: w.title || '', sub: '', hook: '',
      cta1: FORM.cta1, cta2: FORM.cta2, benefit: wd.free ? '1~' + wd.free + '화 무료' : '', end: L <= 6 ? 1.5 : L <= 15 ? 3 : 4,
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
  // t: 만들어지는 영상의 시각(초), total: 전체 길이. still이면 이미지 카드로 그린다.
  function draw(ctx, T, m, r, t, total, still) {
    const W = T.W, H = T.H, U = Math.min(W, H) / 1080, tall = H >= W * 1.2;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    drawSource(ctx, T, m.el, m.w, m.h, r);

    // 위쪽 띠: 장르, 제목, 로고
    const g = ctx.createLinearGradient(0, 0, 0, 380 * U);
    g.addColorStop(0, 'rgba(0,0,0,.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 380 * U);
    shadow(ctx, true, U);
    logo(ctx, W - 44 * U, (tall ? 100 : 64) * U, 44 * U, 'right');
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    if (tall) {
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
      ls.forEach((l, i) => ctx.fillText(l, W / 2, H - (tall ? 400 : 130) * U + (i - (ls.length - 1)) * 62 * U));
      ctx.globalAlpha = 1;
    }
    shadow(ctx, false, U);

    // 끝 화면
    const end = Math.min(r.end == null ? 3 : r.end, total * 0.5);
    const a = still ? 1 : end > 0 ? clamp((t - (total - end)) / 0.4, 0, 1) : 0;
    if (a > 0) {
      ctx.globalAlpha = a;
      const c1 = (tall || W === H || still) && r.cta1 && r.cta1.indexOf(' ') > 0 && r.cta1.length > 8
        ? [r.cta1.slice(0, r.cta1.lastIndexOf(' ')), r.cta1.slice(r.cta1.lastIndexOf(' ') + 1)] : (r.cta1 ? [r.cta1] : []);
      const s1 = (still ? 66 : tall ? 88 : 80) * U;
      const hookIn = r.hook && !(tall && !still);          // 세로 영상은 한 줄 문구를 위쪽 띠에 따로 그린다
      const blocks = [];
      if (hookIn) blocks.push({ k: 'hook', h: 70 * U });
      c1.forEach((l) => blocks.push({ k: 'c1', text: l, h: s1 * 1.28 }));
      if (r.cta2) blocks.push({ k: 'c2', h: 96 * U });
      blocks.push({ k: 'logo', h: 104 * U });
      if (r.benefit) blocks.push({ k: 'ben', h: 70 * U });
      const stackH = blocks.reduce((x, b) => x + b.h, 0);
      let y = still ? H - stackH - 56 * U : tall ? H * 0.6 : (H - stackH) / 2 + 24 * U;
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
        const y0 = 340 * U, y1 = 600 * U;
        ctx.fillStyle = 'rgba(10,10,26,.55)'; ctx.fillRect(0, y0, W, y1 - y0);
        ctx.fillStyle = FORM.blue; ctx.fillRect(0, y0, W, 5 * U); ctx.fillRect(0, y1 - 5 * U, W, 5 * U);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '600 ' + Math.round(64 * U) + 'px ' + FORM.serif;
        const ls = wrap(ctx, r.hook, W - 120 * U, 2);
        ls.forEach((l, i) => ctx.fillText(l, W / 2, (y0 + y1) / 2 + (i - (ls.length - 1) / 2) * 92 * U));
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      blocks.forEach((b) => {
        const cy = y + b.h / 2;
        ctx.fillStyle = '#fff';
        if (b.k === 'hook') { fitFont(ctx, r.hook, 600, 46 * U, FORM.serif, W - 120 * U); ctx.fillText(r.hook, W / 2, cy); }
        if (b.k === 'c1') { fitFont(ctx, b.text, 900, s1, FORM.sans, W - 100 * U); ctx.fillText(b.text, W / 2, cy); }
        if (b.k === 'c2') {
          fitFont(ctx, r.cta2, 700, 52 * U, FORM.sans, W - 120 * U);
          const i = r.cta2.indexOf(FORM.hi), full = ctx.measureText(r.cta2).width, x0 = W / 2 - full / 2;
          if (i >= 0) {
            const pre = ctx.measureText(r.cta2.slice(0, i)).width, hw = ctx.measureText(FORM.hi).width;
            ctx.fillStyle = FORM.blue; ctx.fillRect(x0 + pre - 6 * U, cy - 36 * U, hw + 12 * U, 72 * U);
            ctx.fillStyle = '#fff';
          }
          ctx.fillText(r.cta2, W / 2, cy + 2 * U);
        }
        if (b.k === 'logo') logo(ctx, W / 2, cy, 72 * U, 'center');
        if (b.k === 'ben') { ctx.fillStyle = FORM.yellow; fitFont(ctx, r.benefit, 700, 40 * U, FORM.sans, W - 120 * U); ctx.fillText(r.benefit, W / 2, cy); }
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
      const segs = r.segs, total = segs.reduce((x, s) => x + s[1] - s[0], 0);
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
            const t = Math.min(total, base + Math.max(0, v.currentTime - seg[0]));
            draw(ctx, T, m, r, t, total, false);
            gain.gain.value = total - t < 0.5 ? Math.max(0, (total - t) / 0.5) : 1;
            if (onp) onp(t / total);
            if (v.currentTime >= seg[1] || v.ended) res(); else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        v.pause(); rec.pause(); base += seg[1] - seg[0];
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
    const file = await make(key, r, onp, ctl);
    const problems = await window.Assets.put(key, file);
    Store.update((s) => { const c = (s.creatives[key] = s.creatives[key] || {}); c.edit = r; c.file.made = true; });
    return problems;
  }

  // ---------- 작품 카드의 「원본 영상」 줄 ----------
  function sourceRow(code) {
    const src = sources()[code];
    const ids = window.Calc.creativeIds(code);
    const empty = ids.filter((id) => !(Store.state.creatives[code + '_' + id] || {}).file).length;
    const input = '<input type="file" accept="video/*" data-chg="makerSource" data-code="' + h(code) + '" hidden>';
    return '<div class="srcrow' + (src ? '' : ' need') + '"><strong>원본 영상</strong> ' +
      (src ? '<span>' + h(src.name) + ' <span class="muted small">' + src.w + '×' + src.h + ' · ' + src.dur + '초</span></span> <label class="link-btn">바꾸기' + input + '</label>'
        : '<span class="muted">없음. 1화나 예고편 파일을 고르면 원드라마 형식으로 잘라 빈 칸을 채웁니다.</span> <label class="btn primary srcpick">＋ 원본 영상 고르기' + input + '</label>') +
      (src && empty ? ' <button class="sm primary" data-act="makerAuto" data-code="' + h(code) + '">빈 칸 ' + empty + '개 자동으로 만들기</button>' : '') + '</div>';
  }
  Actions.makerSource = (el) => {
    const file = el.files && el.files[0];
    if (!file) return false;
    setSource(el.dataset.code, file).then((a) => { toast('원본 영상을 넣었습니다 (' + a.dur + '초). 「빈 칸 자동으로 만들기」를 누르세요'); window.App.render(true); })
      .catch((e) => toast('원본을 넣지 못했습니다: ' + e.message));
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

  // 빈 칸을 차례로 만든다.
  Actions.makerAuto = (el) => {
    const code = el.dataset.code;
    const keys = window.Calc.creativeIds(code).map((id) => code + '_' + id).filter((k) => !(Store.state.creatives[k] || {}).file);
    const secs = keys.reduce((a, k) => a + (target(k).dur || 1), 0);
    const ctl = { stop: false };
    const box = dialog('maker-run', '<h3>빈 칸 ' + keys.length + '개를 만드는 중</h3><p class="small muted">영상은 실제 길이만큼 걸립니다 (모두 약 ' + Math.ceil(secs / 60) + '분). 이 창을 다른 탭이나 창으로 가리면 멈추니 켜 둔 채 기다려 주세요.</p><ol class="runlist">' +
      keys.map((k) => '<li data-k="' + h(k) + '">' + h(window.Calc.short(k)) + ' · ' + h(target(k).name) + ' <span class="st muted">대기</span></li>').join('') + '</ol><div class="row"><button data-x="stop">멈추기</button></div>');
    box.addEventListener('cancel', (ev) => ev.preventDefault());
    box.querySelector('[data-x=stop]').onclick = () => { ctl.stop = true; };
    (async () => {
      let ok = 0;
      for (const k of keys) {
        if (ctl.stop) break;
        const st = box.querySelector('li[data-k="' + k + '"] .st');
        try {
          const problems = await makeInto(k, defaults(k), (p) => { st.textContent = Math.round(p * 100) + '%'; }, ctl);
          st.textContent = problems.length ? '넣음 · 규격 확인: ' + problems[0] : '넣음 ✓';
          st.className = 'st ' + (problems.length ? 'warn-t' : 'ok-t');
          ok++;
        } catch (e) { st.textContent = '실패: ' + e.message; st.className = 'st bad-t'; }
      }
      box.querySelector('h3').textContent = (ctl.stop ? '멈췄습니다. ' : '끝났습니다. ') + ok + '개를 넣었습니다';
      const b = box.querySelector('[data-x=stop]'); b.textContent = '닫기'; b.onclick = () => box.close();
      window.App.render(true);
    })();
    return false;
  };

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
      fld('장르 줄', 'genre', r.genre) + fld('제목', 'title', r.title) +
      (isVid ? fld('첫 3초 자막 (비우면 없음)', 'sub', r.sub, ' placeholder="예: 결혼식 날, 신랑이 사라졌다"') : '') +
      fld('끝 화면 한 줄 (비우면 없음)', 'hook', r.hook, ' placeholder="예: 보낸 지 6분. 지울 수 없다."') +
      fld('끝 화면 큰 글자', 'cta1', r.cta1) + fld('끝 화면 둘째 줄 (「원스토어」는 파란 상자)', 'cta2', r.cta2) + fld('혜택 한 줄 (노란 글자)', 'benefit', r.benefit) +
      (isVid ? '<label class="mf"><span>끝 화면 길이 (초)</span><input type="number" data-f="end" min="0" max="' + Math.floor(L / 2) + '" step="0.5" value="' + r.end + '"></label>' : '') +
      '<div class="row maker-go"><button class="primary" data-x="make">' + (cur.file ? '다시 만들어 바꿔 넣기' : '만들어서 넣기') + '</button><span class="small muted" data-x="msg">' + (isVid ? '만드는 데 약 ' + L + '초 걸립니다.' : '') + '</span></div></div></div>');
    const cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
    const q = (s) => box.querySelector(s);
    q('[data-f=fit]').value = r.fit || 'auto';
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
      const f = el.dataset.f;
      if (!f) return;
      if (f === 'start') { stop(); const a = r1(+el.value); r.segs = [[a, r1(a + L)]]; t = 0; show(); return; }
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
        r.segs = [seg]; q('[data-f=start]').value = seg[0]; t = 0; show();
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
  Actions.makerOpen = (el) => { openEditor(el.dataset.key).catch((e) => toast('편집기를 열지 못했습니다: ' + e.message)); return false; };

  window.Maker = { sourceRow, setSource, target, defaults, make, makeInto, analyze, pick, draw, openEditor };
})();
