// 매체별 올리기 묶음: 그 매체에 올릴 소재 파일(이름을 소재 번호로 바꾼 것)과 등록 파일, 순서 안내를
// zip 하나로 내려받는다. API 열쇠 없이 매체의 「일괄 가져오기」로 등록하기 위한 것이다.
(function () {
  const P = window.PLAN;
  const { toast } = window.UI;

  // ---------- zip 만들기 (압축 없이 묶기만 한다. 영상은 이미 압축돼 있어 차이가 없다) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  async function crc32(blob) {
    let c = 0xffffffff;
    const reader = blob.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let i = 0; i < value.length; i++) c = CRC[(c ^ value[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  async function zip(entries) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const e of entries) {
      const name = enc.encode(e.name);
      const crc = await crc32(e.blob);
      const size = e.blob.size;
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // 0x0800 = 이름이 UTF-8
      local.setUint16(8, 0, true); local.setUint16(10, time, true); local.setUint16(12, date, true);
      local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
      local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      parts.push(local, name, e.blob);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true); cd.setUint16(12, time, true); cd.setUint16(14, date, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, size, true); cd.setUint32(24, size, true);
      cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
      central.push(cd, name);
      offset += 30 + name.length + size;
    }
    const cdSize = central.reduce((a, x) => a + (x.byteLength || x.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }

  // ---------- 매체별 순서 안내 ----------
  const GUIDE = {
    meta: [
      '1. 메타 광고 관리자를 연다. 왼쪽 메뉴 「모든 도구」 → 「미디어 라이브러리」(또는 「자산 라이브러리」).',
      '2. 「1_소재파일」 폴더의 파일을 전부 끌어다 놓아 올린다. 파일 이름이 광고 이름과 같다 (예: w01_v15a.mp4).',
      '3. 광고 관리자 → 「내보내기 및 가져오기」 → 「광고 일괄 가져오기」에서 「2_등록파일/meta_bulk_import.csv」를 올린다.',
      '4. 가져온 광고마다 영상이 연결됐는지 본다. 비어 있으면 광고를 열어 라이브러리에서 같은 이름의 영상을 고른다.',
      '5. 모든 광고는 일시중지 상태로 들어간다. 내용을 확인한 뒤 12/1에 켠다.',
    ],
    youtube: [
      '1. 유튜브 스튜디오(원드라마 채널) → 「만들기」 → 「동영상 업로드」에 「1_소재파일」의 영상을 한꺼번에 끌어다 놓는다.',
      '2. 공개 범위는 「일부 공개」로 둔다 (광고에 쓸 수 있고 채널 목록에는 안 보인다).',
      '3. 영상마다 주소의 v= 뒤 11글자가 영상 ID다. 사이트 「광고 등록」의 유튜브 표에 붙여 넣고 묶음을 다시 받는다.',
      '4. 구글 애즈 에디터 → 「계정」 → 「가져오기」 → 「파일에서」로 「2_등록파일/google_ads_video.csv」를 올린다.',
      '5. 에디터에서 내용을 확인하고 「게시」한다. 광고는 일시중지 상태로 들어간다.',
    ],
    gdn: [
      '1. 구글 애즈 에디터 → 「계정」 → 「가져오기」 → 「파일에서」로 「2_등록파일/google_ads_display.csv」를 올린다.',
      '2. 만들어진 반응형 디스플레이 광고마다 「이미지」에 「1_소재파일」의 같은 이름 배너를 넣는다.',
      '3. 내용을 확인하고 「게시」한다. 광고는 일시중지 상태로 들어간다.',
    ],
    gsearch: [
      '1. 구글 애즈 에디터 → 「계정」 → 「가져오기」 → 「파일에서」로 「2_등록파일/google_ads_search.csv」를 올린다.',
      '2. 키워드와 광고 문구를 확인하고 「게시」한다. 광고는 일시중지 상태로 들어간다.',
    ],
    naver: [
      '1. 네이버 검색광고 관리자센터에서 캠페인과 광고그룹을 먼저 만든다 (이름은 사이트의 광고그룹 이름과 같게).',
      '2. 만든 광고그룹의 ID(grp-...)를 사이트 「광고 등록」의 네이버 표에 붙여 넣고 묶음을 다시 받는다.',
      '3. 「도구」 → 「대량 관리」 → 「대량 등록/수정」에서 키워드 등록에 naver_keywords.csv, 소재 등록에 naver_ads.csv를 올린다.',
    ],
  };

  // 이 매체에 올릴 소재 파일 목록 [{content, name, has}]
  function mediaFiles(m) {
    if (m.search) return [];
    const seen = new Set();
    return window.Register.fileRows(window.Register.filesOf(m.id)[0], window.Register.phaseId()).filter((r) => !seen.has(r.ad) && seen.add(r.ad)).map((r) => {
      const f = (Store.state.creatives[r.ad] || {}).file;
      return { content: r.ad, label: r.label, has: !!f, name: f ? r.ad + ((/\.[a-z0-9]+$/i.exec(f.name) || [''])[0]).toLowerCase() : '' };
    });
  }
  function readiness(m) {
    const fs = mediaFiles(m);
    return { total: fs.length, ready: fs.filter((f) => f.has).length };
  }

  async function build(m) {
    const R = window.Register;
    const ph = R.phaseId();
    const entries = [];
    const fs = mediaFiles(m);
    const missing = [];
    for (const f of fs) {
      const blob = f.has ? await window.Assets.get(f.content) : null;
      if (blob) entries.push({ name: '1_소재파일/' + f.name, blob }); else missing.push(f.content + ' (' + f.label + ')');
    }
    let rows = 0;
    R.filesOf(m.id).forEach((fk) => {
      const out = R.buildCsv(fk, ph);
      rows += out.rows.length;
      entries.push({ name: '2_등록파일/' + R.FILES[fk].file, blob: new Blob(['﻿' + out.csv], { type: 'text/csv' }) });
    });
    const probs = R.problems(m, ph);
    const txt = [
      m.name + ' 올리기 묶음 · ' + P.title,
      '만든 때: ' + new Date().toLocaleString('ko-KR'),
      '',
      '[순서]',
    ].concat(GUIDE[m.id] || [], [
      '',
      '[들어 있는 것]',
      '소재 파일 ' + (fs.length - missing.length) + '/' + fs.length + '개, 등록 파일 ' + R.filesOf(m.id).length + '개 (' + rows + '줄)',
    ], missing.length ? ['', '[아직 사이트에 올리지 않은 소재]'].concat(missing.map((x) => '- ' + x)) : [],
      probs.length ? ['', '[올리기 전에 확인]'].concat(probs.map((x) => '- ' + x)) : [], [
      '',
      '[주의]',
      '- 등록 파일의 열 이름은 매체 템플릿과 한 글자라도 다르면 무시된다. 처음에는 광고 1~2개로 먼저 올려 본다.',
      '- 메뉴 이름은 매체가 바꿀 수 있다. 위 순서와 화면이 다르면 비슷한 이름의 메뉴를 찾는다.',
    ]).join('\r\n');
    entries.push({ name: '읽어보기.txt', blob: new Blob(['﻿' + txt], { type: 'text/plain' }) });
    return { blob: await zip(entries), files: fs.length - missing.length, total: fs.length, missing };
  }

  Actions.bundleDownload = (el) => {
    const m = Calc.media(el.dataset.media);
    toast(m.name + ' 묶음을 만드는 중입니다…');
    build(m).then((r) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob);
      a.download = '원드라마_' + m.id + '_올리기묶음.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(m.name + ' 묶음을 내려받았습니다' + (r.total ? ' (소재 ' + r.files + '/' + r.total + '개)' : '') + (r.missing.length ? '. 빠진 소재 ' + r.missing.length + '개는 읽어보기에 적었습니다' : ''));
    }).catch((e) => toast('묶음을 만들지 못했습니다: ' + (e && e.message ? e.message : '알 수 없는 오류')));
    return false;
  };

  window.Bundle = { build, readiness, mediaFiles, zip, GUIDE };
})();
