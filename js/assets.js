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
    const mk = '<button class="' + (f ? 'link-btn' : 'sm') + '" data-act="makerOpen" data-key="' + h(key) + '" title="원본 영상을 원드라마 형식으로 잘라 넣습니다">' + (f ? '수정' : '만들기') + '</button>';
    if (!f) return '<label class="btn sm upload">파일 올리기 · 끌어다 놓기' + input + '</label> ' + mk;
    const info = f.w + '×' + f.h + (f.dur != null ? ' · ' + f.dur + '초' : '') + ' · ' + mb(f.size);
    return '<div class="asset"><button class="link-btn asset-name" data-act="previewAsset" data-key="' + h(key) + '" title="' + h(f.name) + ' 재생·미리 보기">▶ ' + h(f.name) + '</button>' + (f.made ? '<span class="tag accent" title="이 사이트에서 원드라마 형식으로 만든 파일">자동 제작</span>' : '') +
      '<span class="small muted">' + info + '</span>' +
      (f.problems && f.problems.length ? '<span class="tag bad" title="' + h(f.problems.join(' / ')) + '">규격 확인: ' + h(f.problems[0]) + '</span>' : '<span class="tag ok">규격 맞음</span>') +
      '<span class="asset-act">' + mk + (f.made && (Store.state.creatives[key] || {}).edit ? ' <button class="link-btn" data-act="makerRedo" data-key="' + h(key) + '" title="지금의 원본·자막·포스터로 이 소재만 다시 만듭니다">다시 만들기</button>' : '') + ' <button class="link-btn" data-act="downloadAsset" data-key="' + h(key) + '">내려받기</button> <label class="link-btn">바꾸기' + input + '</label> <button class="link-btn" data-act="delAsset" data-key="' + h(key) + '">지우기</button></span></div>';
  }
  function summary() {
    const fs = Object.values(Store.state.creatives).map((c) => c.file).filter(Boolean);
    return { n: fs.length, size: fs.reduce((a, f) => a + f.size, 0), bad: fs.filter((f) => f.problems && f.problems.length).length, text: mb(fs.reduce((a, f) => a + f.size, 0)) };
  }

  Actions.uploadAsset = (el) => {
    const file = el.files && el.files[0];
    if (!file) return false;
    const b = window.UI.busy('파일을 읽고 규격을 검사하는 중');
    put(el.dataset.key, file).finally(() => b.done()).then((problems) => {
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

  // ---------- 끌어다 놓기 ----------
  // 소재 줄에 놓으면 그 소재에 넣는다. 작품 카드에 여러 개를 놓으면 알아서 배정한다:
  // 파일 이름에 소재 번호(w01_v15a 또는 v15a)가 있으면 그 칸, 없으면 규격이 맞는 빈 칸.
  async function assign(code, files) {
    const ids = Calc.creativeIds(code);
    const taken = new Set();
    const placed = [];
    const left = [];
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (/\.srt$/.test(name)) {
        // 자막 파일은 이 작품의 자막으로 넣는다. 여러 개면 영어(_en) 아닌 것을 우선한다.
        if (/_en\.srt$/.test(name) && files.some((f) => /\.srt$/i.test(f.name) && !/_en\.srt$/i.test(f.name))) { left.push(file.name + ' (다른 자막 사용)'); continue; }
        try { const c = await window.Maker.setSubs(code, file); placed.push(file.name + ' → 자막 ' + c.length + '줄'); } catch (e) { left.push(file.name + ' (자막을 읽을 수 없음)'); }
        continue;
      }
      let id = ids.find((x) => name.includes(code + '_' + x)) || ids.find((x) => new RegExp('(^|[^a-z0-9])' + x + '([^a-z0-9]|$)').test(name));
      if (!id) {
        let meta = null;
        try { meta = await probe(file); } catch (e) { left.push(file.name + ' (읽을 수 없음)'); continue; }
        id = ids.find((x) => {
          const key = code + '_' + x;
          if (taken.has(key) || (Store.state.creatives[key] || {}).file) return false;
          const t = P.creativeTypes.find((c) => c.id === x);
          return t && check(x, t.spec, meta).length === 0;
        });
      }
      if (!id && file.type.startsWith('video/') && !(Store.state.sources || {})[code]) {
        // 맞는 칸이 없는 영상은 「원본 영상」으로 넣어 두고, 거기서 잘라 만든다.
        try { await window.Maker.setSource(code, file); placed.push(file.name + ' → 원본 영상'); } catch (e) { left.push(file.name + ' (읽을 수 없음)'); }
        continue;
      }
      if (!id || taken.has(code + '_' + id)) { left.push(file.name + ' (맞는 칸 없음)'); continue; }
      taken.add(code + '_' + id);
      try { await put(code + '_' + id, file); placed.push(file.name + ' → ' + id); } catch (e) { left.push(file.name + ' (읽을 수 없음)'); }
    }
    return { placed, left };
  }

  const view = document.getElementById('view');
  const zoneOf = (ev) => ev.target.closest && (ev.target.closest('[data-drop]') || ev.target.closest('[data-dropwork]'));
  const hasFiles = (ev) => ev.dataTransfer && [...ev.dataTransfer.types].includes('Files');
  let hot = null;
  const light = (el) => { if (hot !== el) { if (hot) hot.classList.remove('dropping'); hot = el; if (el) el.classList.add('dropping'); } };
  view.addEventListener('dragover', (ev) => {
    if (!hasFiles(ev)) return;
    const z = zoneOf(ev);
    if (!z) { light(null); return; }
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    light(z);
  });
  view.addEventListener('dragleave', (ev) => { if (!view.contains(ev.relatedTarget)) light(null); });
  view.addEventListener('drop', (ev) => {
    const z = zoneOf(ev);
    light(null);
    if (!z || !hasFiles(ev)) return;
    ev.preventDefault();
    const files = [...ev.dataTransfer.files];
    if (!files.length) return;
    const b = window.UI.busy('파일 ' + files.length + '개를 읽고 규격을 검사하는 중');
    const job = z.dataset.drop
      ? put(z.dataset.drop, files[0]).then((problems) => ({ placed: [files[0].name], left: files.slice(1).map((f) => f.name + ' (한 칸에 하나만)'), problems }))
      : assign(z.dataset.dropwork, files);
    job.finally(() => b.done()).then((r) => {
      const bad = r.problems && r.problems.length ? ' 규격 확인: ' + r.problems[0] : '';
      toast((r.placed.length ? r.placed.length + '개 올렸습니다.' : '올린 파일이 없습니다.') + bad + (r.left.length ? ' 못 넣은 파일: ' + r.left.join(', ') : ''));
      window.App.render(true);
    }).catch((e) => toast('올리지 못했습니다: ' + (e && e.message ? e.message : '알 수 없는 오류')));
  });
  // 칸 밖에 떨어뜨려도 브라우저가 파일을 열어 버리지 않게 한다.
  window.addEventListener('dragover', (ev) => { if (hasFiles(ev)) ev.preventDefault(); });
  window.addEventListener('drop', (ev) => { if (hasFiles(ev)) ev.preventDefault(); });

  // 작품 코드가 바뀌면 보관한 파일의 이름표도 새 코드로 옮긴다.
  async function rename(oldKey, newKey) { const f = await dbGet(oldKey); if (f) { await dbPut(newKey, f); await dbDel(oldKey); } }

  window.Assets = { cell, put, get: dbGet, raw: { put: dbPut, get: dbGet, del: dbDel }, probe, rename, check, expected, summary, assign };
})();
