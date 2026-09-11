/* The in-page control bar, plus a progress pill while we wait.

   The bar and the toolbar popup are two views of the same settings: both send
   changes through the same save path, so whichever one you use, the other
   catches up on its next render. */

window.VLF_UI = window.VLF_UI || (() => {
  const COFFEE_URL = 'https://buymeacoffee.com/benscholtz';

  let root = null;
  let pill = null;
  let handlers = {};

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const build = () => {
    root = el('div', 'vlf-bar');

    const picker = el('details', 'vlf-picker');
    const summary = el('summary', 'vlf-picker__summary');
    summary.appendChild(el('span', 'vlf-picker__label', 'Seller location'));
    summary.appendChild(el('span', 'vlf-picker__value', 'Everywhere'));
    picker.appendChild(summary);
    picker.appendChild(el('div', 'vlf-picker__list'));
    root.appendChild(picker);

    const modes = el('div', 'vlf-modes');
    [['remove', 'Hide others'], ['fade', 'Fade others']].forEach(([mode, label]) => {
      const button = el('button', 'vlf-mode', label);
      button.type = 'button';
      button.dataset.mode = mode;
      button.addEventListener('click', () => handlers.onMode && handlers.onMode(mode));
      modes.appendChild(button);
    });
    root.appendChild(modes);

    const city = el('label', 'vlf-city');
    const box = el('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => handlers.onCity && handlers.onCity(box.checked));
    city.appendChild(box);
    city.appendChild(el('span', null, 'Show city'));
    city.title = 'One throttled request per seller, so cities fill in as you scroll.';
    root.appendChild(city);

    root.appendChild(el('span', 'vlf-status'));

    const coffee = el('a', 'vlf-coffee', 'Buy me a coffee');
    coffee.href = COFFEE_URL;
    coffee.target = '_blank';
    coffee.rel = 'noopener noreferrer';
    root.appendChild(coffee);

    // Clicking a country should not also close the panel mid-update.
    root.addEventListener('click', (event) => event.stopPropagation());
    return root;
  };

  const option = (code, count, selected) => {
    const label = code === null
      ? `Everywhere (${count})`
      : `${VLF_ORIGINS.flag(code)} ${VLF_ORIGINS.countryName(code)} (${count})`;
    const button = el('button', 'vlf-option', label);
    button.type = 'button';
    button.classList.toggle('vlf-option--on', selected);
    button.addEventListener('click', () => handlers.onSelect && handlers.onSelect(code));
    return button;
  };

  const renderPicker = (state) => {
    const list = root.querySelector('.vlf-picker__list');
    const value = root.querySelector('.vlf-picker__value');
    const selected = new Set(state.settings.selected);

    list.textContent = '';
    list.appendChild(option(null, state.loaded, selected.size === 0));
    Object.entries(state.counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([code, count]) => list.appendChild(option(code, count, selected.has(code))));

    if (state.unknown > 0) {
      list.appendChild(el('p', 'vlf-picker__note', state.market === 'EUR'
        ? `${state.unknown} sellers cannot be told apart by currency on a euro site. Turn on "Show city" to look them up.`
        : `${state.unknown} sellers still unconfirmed.`));
    }

    value.textContent = selected.size === 0
      ? 'Everywhere'
      : [...selected].map((code) => VLF_ORIGINS.countryName(code)).join(', ');
  };

  const render = (state) => {
    if (!root) return;
    renderPicker(state);
    root.querySelectorAll('.vlf-mode').forEach((button) => {
      button.classList.toggle('vlf-mode--on', button.dataset.mode === state.settings.mode);
    });
    root.querySelector('.vlf-city input').checked = state.settings.showCity;
    root.querySelector('.vlf-status').textContent = state.status || '';
    root.dataset.filtered = String(state.settings.selected.length > 0);
  };

  const mount = (anchor, callbacks) => {
    handlers = callbacks || {};
    const bar = build();
    anchor.parentElement.insertBefore(bar, anchor);
    return bar;
  };

  const progress = (text, busy = true) => {
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'vlf-progress';
      pill.innerHTML = '<span class="vlf-progress__spin"></span><span class="vlf-progress__text"></span>';
    }
    if (!pill.isConnected) document.body.appendChild(pill);
    pill.querySelector('.vlf-progress__text').textContent = text;
    pill.dataset.busy = String(busy);
  };

  const clearProgress = () => {
    if (pill) pill.remove();
    pill = null;
  };

  return { mount, render, progress, clearProgress, COFFEE_URL };
})();
