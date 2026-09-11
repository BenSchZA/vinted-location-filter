/* User settings, shared between the catalogue page and the toolbar popup. */

window.VLF_SETTINGS = window.VLF_SETTINGS || (() => {
  const KEY = 'vlf:settings';
  const DEFAULTS = {
    selected: [],        // ISO country codes to keep; empty means show everything
    mode: 'remove',      // 'remove' or 'fade'
    showCity: false,     // city needs one throttled request per seller
    resolveEuro: false,  // look sellers up when currency cannot name the country
  };

  const load = async () => {
    try {
      const stored = await chrome.storage.local.get(KEY);
      return { ...DEFAULTS, ...(stored[KEY] || {}) };
    } catch {
      return { ...DEFAULTS };
    }
  };

  const save = async (patch) => {
    const next = { ...(await load()), ...patch };
    try { await chrome.storage.local.set({ [KEY]: next }); } catch { /* not fatal */ }
    return next;
  };

  const onChange = (fn) => {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) fn({ ...DEFAULTS, ...changes[KEY].newValue });
    });
  };

  return { DEFAULTS, load, save, onChange };
})();
