// 소재 파일 보관: 소재 화면에서 올린 영상·이미지를 이 브라우저(IndexedDB)에 넣어 두고,
// 길이·비율·크기를 읽어 규격에 맞는지 자동으로 검사한다. 서버로 보내지 않는다.
// 매체로 바로 올리는 기능은 아직 없다 (매체 API 열쇠와 PC에서 도는 연결 프로그램이 필요하다).
(function () {
  const P = window.PLAN;
  const { h, toast } = window.UI;
  const DB = 'onedrama-files';
  const STORE = 'files';

  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function tx(mode, fn) {
    return open().then((db) => new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const q = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); res(q && q.result); };
      t.onerror = t.onabort = () => { db.close(); rej(t.error); };
    }));
  }
  const dbPut = (key, file) => tx('readwrite', (s) => s.put(file, key));
  const dbGet = (key) => tx('readonly', (s) => s.get(key));
  const dbDel = (key) => tx('readwrite', (s) => s.delete(key));

  // 파일에서 가로·세로·길이를 읽는다.
  function probe(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const done = (v) => { URL.revokeObjectURL(url); res(v); };
      const fail = () => { URL.revokeObjectURL(url); rej(new Error('읽을 수 없는 파일')); };
      if (file.type.startsWith('video/')) {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.onloadedmetadata = () => done({ kind: 'video', w: v.videoWidth, h: v.videoHeight, dur: isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null });
        v.onerror = fail;
        v.src = url;
      } else if (file.type.startsWith('image/')) {
        const im = new Image();
        im.onload = () => done({ kind: 'image', w: im.naturalWidth, h: im.naturalHeight, dur: null });
        im.onerror = fail;
        im.src = url;
      } else fail();
    });
  }

  // 소재 번호와 규격 글자에서 기대값을 뽑는다. 예: v15a → 영상 15초, '9:16' → 비율 0.5625.
  function expected(id, spec) {
    const m = /^v(\d+)/.exec(id);
    const ratios = [];
    const sizes = [];
    String(spec || '').replace(/(\d+)\s*[×x]\s*(\d+)/g, (_, w, hh) => { sizes.push([+w, +hh]); return ''; })
      .replace(/(\d+)\s*:\s*(\d+)/g, (_, a, b) => { ratios.push([+a, +b]); return ''; });
    return { kind: m ? 'video' : 'image', dur: m ? +m[1] : null, ratios, sizes };
  }
  // 규격 검사. 문제를 글자 목록으로 돌려준다 (비어 있으면 통과).
  function check(id, spec, meta) {
    const e = expected(id, spec);
    const out = [];
    if (e.kind !== meta.kind) out.push(e.kind === 'video' ? '영상이어야 합니다' : '이미지여야 합니다');
    if (e.dur && meta.dur != null && Math.abs(meta.dur - e.dur) > 1) out.push('길이 ' + e.dur + '초여야 하는데 ' + meta.dur + '초');
    const r = meta.w / meta.h;
    if (e.sizes.length) {
      if (!e.sizes.some((s) => s[0] === meta.w && s[1] === meta.h)) out.push('크기 ' + e.sizes.map((s) => s[0] + '×' + s[1]).join(' 또는 ') + '여야 하는데 ' + meta.w + '×' + meta.h);
    } else if (e.ratios.length && !e.ratios.some((x) => Math.abs(r - x[0] / x[1]) / (x[0] / x[1]) < 0.02)) {
      out.push('비율 ' + e.ratios.map((x) => x[0] + ':' + x[1]).join(' 또는 ') + '이어야 하는데 ' + meta.w + '×' + meta.h);
    }
    return out;
  }

  const mb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB');
  const specOf = (key) => { const id = key.split('_')[1]; const t = P.creativeTypes.find((c) => c.id === id); return { id, spec: t ? t.spec : '' }; };

  // 파일을 넣고, 규격을 검사하고, 상태를 「검수 중」으로 올린다.
  async function put(key, file) {
    const meta = await probe(file);
    const { id, spec } = specOf(key);
    const problems = check(id, spec, meta);
    await dbPut(key, file);
    Store.update((s) => {
      const c = (s.creatives[key] = s.creatives[key] || {});
      c.file = { name: file.name, size: file.size, type: file.type, w: meta.w, h: meta.h, dur: meta.dur, problems, at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
      if (!c.status || c.status === '요청 전' || c.status === '제작 중') c.status = '검수 중';
    });
    return problems;
  }

  // 소재 표의 「파일」 칸
  function cell(key) {
    const f = (Store.state.creatives[key] || {}).file;
    const input = '<input type="file" accept="video/*,image/*" data-chg="uploadAsset" data-key="' + h(key) + '" hidden>';
    if (!f) return '<label class="btn sm upload">파일 올리기' + input + '</label>';
    const info = f.w + '×' + f.h + (f.dur != null ? ' · ' + f.dur + '초' : '') + ' · ' + mb(f.size);
    return '<div class="asset"><button class="link-btn asset-name" data-act="previewAsset" data-key="' + h(key) + '" title="' + h(f.name) + ' 미리 보기">' + h(f.name) + '</button>' +
      '<span class="small muted">' + info + '</span>' +
      (f.problems && f.problems.length ? '<span class="tag bad" title="' + h(f.problems.join(' / ')) + '">규격 확인: ' + h(f.problems[0]) + '</span>' : '<span class="tag ok">규격 맞음</span>') +
      '<span class="asset-act"><button class="link-btn" data-act="downloadAsset" data-key="' + h(key) + '">내려받기</button> <label class="link-btn">바꾸기' + input + '</label> <button class="link-btn" data-act="delAsset" data-key="' + h(key) + '">지우기</button></span></div>';
  }
  function summary() {
    const fs = Object.values(Store.state.creatives).map((c) => c.file).filter(Boolean);
    return { n: fs.length, size: fs.reduce((a, f) => a + f.size, 0), bad: fs.filter((f) => f.problems && f.problems.length).length, text: mb(fs.reduce((a, f) => a + f.size, 0)) };
  }

  Actions.uploadAsset = (el) => {
    const file = el.files && el.files[0];
    if (!file) return false;
    toast('파일을 읽는 중입니다…');
    put(el.dataset.key, file).then((problems) => {
      toast(problems.length ? '올렸습니다. 규격 확인이 필요합니다: ' + problems[0] : '올렸습니다. 규격이 맞습니다');
      window.App.render(true);
    }).catch((e) => toast('올리지 못했습니다: ' + (e && e.message ? e.message : '알 수 없는 오류')));
    return false;
  };
  Actions.previewAsset = (el) => {
    dbGet(el.dataset.key).then((file) => {
      if (!file) { toast('이 브라우저에 파일이 없습니다. 다시 올려 주세요'); return; }
      const url = URL.createObjectURL(file);
      const box = document.createElement('dialog');
      box.className = 'preview';
      box.innerHTML = '<form method="dialog"><button class="sm" aria-label="닫기">닫기</button></form>' + (file.type.startsWith('video/') ? '<video controls autoplay playsinline src="' + url + '"></video>' : '<img alt="" src="' + url + '">');
      box.addEventListener('close', () => { URL.revokeObjectURL(url); box.remove(); });
      box.addEventListener('click', (ev) => { if (ev.target === box) box.close(); });
      document.body.appendChild(box);
      box.showModal();
    });
    return false;
  };
  Actions.downloadAsset = (el) => {
    dbGet(el.dataset.key).then((file) => {
      if (!file) { toast('이 브라우저에 파일이 없습니다'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      // 매체에 올릴 때 알아보기 쉽게 소재 번호를 파일 이름으로 쓴다.
      a.download = el.dataset.key + (/\.[a-z0-9]+$/i.exec(file.name) || [''])[0];
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    return false;
  };
  Actions.delAsset = (el) => {
    const key = el.dataset.key;
    dbDel(key).then(() => {
      Store.update((s) => { if (s.creatives[key]) delete s.creatives[key].file; });
      toast('파일을 지웠습니다');
      window.App.render(true);
    });
    return false;
  };

  window.Assets = { cell, put, check, expected, summary };
})();
