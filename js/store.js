// 브라우저 localStorage에 저장한다. 서버로 보내는 데이터는 없다.
(function () {
  const KEY = 'onedrama-ads-v1';

  function blank() {
    return {
      v: 1,
      checks: {},          // 체크리스트 id → true
      customChecks: [],    // [{id, section, text}]
      works: [],           // [{code, title, cp, url}]
      creatives: {},       // 'w01_v15a' → {status, qc: [bool], note}
      extraCreatives: {},  // 'w01' → ['v15c', ...] (주간 교체로 추가한 소재)
      planChecks: {},      // 'CP|작품명' → {항목 id: true} (작품별 계획의 체크)
      reports: [],         // [{id, date, media, work, creative, imp, clk, start, ep3, pay, cost}]
      settings: { ytMedium: 'paid_social', daily: {}, accounts: {} }, // accounts: 바로가기에 쓸 계정 (이 브라우저에만 저장)
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const data = JSON.parse(raw);
      const base = blank();
      return Object.assign(base, data, { settings: Object.assign(base.settings, data.settings || {}) });
    } catch (e) {
      console.error('저장된 데이터를 읽지 못했습니다', e);
      return blank();
    }
  }

  const Store = {
    state: load(),
    listeners: [],
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state));
      } catch (e) {
        console.error('저장 실패', e);
      }
      this.listeners.forEach((fn) => fn());
    },
    update(fn) {
      fn(this.state);
      this.save();
    },
    replace(data) {
      const base = blank();
      this.state = Object.assign(base, data, { settings: Object.assign(base.settings, data.settings || {}) });
      this.save();
    },
    reset() {
      this.state = blank();
      this.save();
    },
    uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },
  };

  window.Store = Store;
})();
