/* Drives the filter from the toolbar popup. The content script holds the
   results, so the popup asks it for a tally and sends settings back. */

const els = {
  summary: document.getElementById('summary'),
  panel: document.getElementById('panel'),
  idle: document.getElementById('idle'),
  places: document.getElementById('places'),
  city: document.getElementById('city'),
  clear: document.getElementById('clear'),
};

let tabId = null;
let current = null;

const activeTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

const ask = (message) =>
  new Promise((resolve) => {
    if (tabId == null) return resolve(null);
    chrome.tabs.sendMessage(tabId, message, (reply) => {
      // A tab without the content script answers with a lastError, not a throw.
      void chrome.runtime.lastError;
      resolve(reply || null);
    });
  });

const place = (code, count, selected) => {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-pressed', String(selected));
  const name = document.createElement('span');
  name.textContent = code === null
    ? 'Everywhere'
    : `${VLF_ORIGINS.flag(code)} ${VLF_ORIGINS.countryName(code)}`;
  const tally = document.createElement('span');
  tally.className = 'count';
  tally.textContent = String(count);
  button.append(name, tally);
  button.addEventListener('click', () => toggle(code));
  item.appendChild(button);
  return item;
};

const toggle = async (code) => {
  const selected = new Set(current.settings.selected);
  if (code === null) selected.clear();
  else if (selected.has(code)) selected.delete(code);
  else selected.add(code);
  await ask({ type: 'vlf:apply', patch: { selected: [...selected] } });
  refresh();
};

const render = (state) => {
  current = state;
  const usable = state && state.active;
  els.panel.hidden = !usable;
  els.idle.hidden = Boolean(usable);

  if (!usable) {
    // No reply at all means the content script is not in this tab, which is
    // what happens to tabs that were already open when the extension loaded.
    const waiting = {
      waiting: 'Waiting for Vinted to finish loading the page...',
      fetching: 'Reading results from Vinted...',
      error: 'That search returned nothing to filter.',
    };
    if (!state) els.idle.textContent = 'Reload this tab to start the filter.';
    else if (state.starting) els.idle.textContent = waiting[state.phase] || 'Starting...';
    else if (state.catalogue) els.idle.textContent = 'No results grid found on this page.';
    else els.idle.textContent = 'Open a Vinted search to use the filter.';
    els.summary.textContent = state && state.starting ? 'Working' : 'Inactive';
    return;
  }

  els.summary.textContent = state.status;

  const selected = new Set(state.settings.selected);
  els.places.textContent = '';
  els.places.appendChild(place(null, state.loaded, selected.size === 0));
  Object.entries(state.counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, count]) => els.places.appendChild(place(code, count, selected.has(code))));

  if (state.unknown > 0) {
    const note = document.createElement('li');
    note.className = 'hint';
    note.textContent = state.market === 'EUR'
      ? `${state.unknown} sellers cannot be told apart by currency on a euro site. Turn on "Show city" to look them up.`
      : `${state.unknown} sellers still unconfirmed.`;
    els.places.appendChild(note);
  }

  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.settings.mode));
  });
  els.city.checked = state.settings.showCity;
};

const refresh = async () => render(await ask({ type: 'vlf:state' }));

document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', async () => {
    await ask({ type: 'vlf:apply', patch: { mode: button.dataset.mode } });
    refresh();
  });
});

els.city.addEventListener('change', async () => {
  await ask({ type: 'vlf:apply', patch: { showCity: els.city.checked } });
  refresh();
});

els.clear.addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const sellers = Object.keys(all).filter((key) => key.startsWith('s:'));
  await chrome.storage.local.remove(sellers);
  els.clear.textContent = `Cleared ${sellers.length}`;
});

(async () => {
  const tab = await activeTab();
  tabId = tab && tab.id;
  await refresh();
  setInterval(refresh, 1500);   // the tally grows as more pages load
})();
