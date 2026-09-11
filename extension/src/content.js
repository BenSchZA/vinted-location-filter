/* Takes over the catalogue grid so results can be filtered by seller location.

   Vinted renders the catalogue on the server and pages it 96 results at a
   time, so there is no client request to intercept. The extension calls the
   same search API itself, tags each result with the seller's country, and
   renders its own grid with continuous scrolling. */

(() => {
  if (window.__vlfBooted) return;
  window.__vlfBooted = true;

  const LOG = '[vinted-location-filter]';
  const GRID_SELECTOR = '[class*="feed-grid"]';

  const state = {
    items: [],
    seen: new Set(),
    origins: new Map(),      // itemId -> { country, city, certain }
    page: 0,
    totalPages: 1,
    total: 0,
    settings: { ...VLF_SETTINGS.DEFAULTS },
    loading: false,
    exhausted: false,
    error: null,
    cooldownUntil: 0,
    backoffMs: 0,
  };

  let ourGrid = null;
  let theirGrid = null;
  let sentinel = null;
  let strip = null;
  let cards = new Map();     // itemId -> element
  let visible = new Set();   // itemIds currently on screen

  /* Bumped on every navigation. Work started under an older generation is
     discarded instead of writing into a grid that no longer exists. */
  let generation = 0;
  let starting = false;
  let pendingBoot = false;
  let attempts = 0;
  let lastAttempt = 0;
  let observers = [];

  const HEAL_COOLDOWN_MS = 3000;
  const HEAL_MAX_ATTEMPTS = 5;

  let phase = 'idle';
  let prefetch = null;          // page 1, fetched while the page hydrates

  const setPhase = (next, text, busy = true) => {
    phase = next;
    if (text) VLF_UI.progress(text, busy);
  };

  /* An item page can carry search_text in its query, so rule those out first
     rather than mounting a results grid onto a single listing. */
  const isCatalogue = () => {
    if (/^\/items\//.test(location.pathname)) return false;
    if (/^\/catalog(\/|$)/.test(location.pathname)) return true;
    return new URLSearchParams(location.search).has('search_text');
  };

  /* Country from the seller's currency. Null means the currency is shared by
     several markets and only a seller lookup can name the country. */
  const originFor = (item) => {
    const known = state.origins.get(item.id);
    if (known) return known;
    const country = VLF_ORIGINS.countryFromCurrency(item);
    const origin = { country, city: '', certain: Boolean(country) };
    state.origins.set(item.id, origin);
    return origin;
  };

  const matches = (origin) => {
    if (state.settings.selected.length === 0) return true;
    if (!origin.country) return true;   // never hide a seller we could not read
    return state.settings.selected.includes(origin.country);
  };

  const counts = () => {
    const tally = {};
    let unknown = 0;
    state.items.forEach((item) => {
      const origin = originFor(item);
      if (origin.country) tally[origin.country] = (tally[origin.country] || 0) + 1;
      else unknown += 1;
    });
    return { tally, unknown };
  };

  const statusLine = () => {
    if (state.error) return state.error;
    const { unknown } = counts();
    const shown = state.items.filter((item) => matches(originFor(item))).length;
    const queue = VLF_LOOKUP.status();
    const parts = [];
    parts.push(state.settings.selected.length === 0
      ? `${state.items.length} of ${state.total} loaded`
      : `${shown} of ${state.items.length} loaded match`);
    if (queue.halted) parts.push('seller lookups paused by Vinted, try again shortly');
    else if (queue.remaining) parts.push(`${queue.remaining} sellers still to check`);
    else if (unknown && state.settings.selected.length) parts.push(`${unknown} unconfirmed`);
    return parts.join(' · ');
  };

  /* Single path for a settings change so the in-page bar and the popup cannot
     drift apart. */
  const applySettings = async (patch) => {
    state.settings = await VLF_SETTINGS.save(patch);
    VLF_LOOKUP.clear();
    requestLookups();
    redraw();
    return state.settings;
  };

  const toggleCountry = (code) => {
    const selected = new Set(state.settings.selected);
    if (code === null) selected.clear();
    else if (selected.has(code)) selected.delete(code);
    else selected.add(code);
    return applySettings({ selected: [...selected] });
  };

  const redraw = () => {
    state.items.forEach((item) => {
      const element = cards.get(item.id);
      if (!element) return;
      const origin = originFor(item);
      VLF_GRID.paint(element, origin);
      VLF_GRID.apply(element, { visible: matches(origin), mode: state.settings.mode });
    });
    const { tally, unknown } = counts();
    VLF_UI.render({
      counts: tally,
      unknown,
      total: state.total,
      loaded: state.items.length,
      market: VLF_ORIGINS.marketCurrency(),
      settings: state.settings,
      status: statusLine(),
    });
  };

  /* Whether a seller is worth a throttled request: the user asked for cities,
     or the country is unknown and a filter is active. */
  const needsLookup = (item) => {
    const origin = originFor(item);
    if (state.settings.showCity && !origin.city) return true;
    if (!origin.country && state.settings.selected.length > 0) return true;
    return false;
  };

  const requestLookups = () => {
    const queued = state.items.filter(needsLookup);
    queued.forEach((item, index) => {
      const userId = item.user && item.user.id;
      if (!userId) return;
      const priority = (visible.has(item.id) ? 1000 : 0) - index;
      VLF_LOOKUP.resolve(userId, priority).then((result) => {
        if (!result) return;
        // One seller can have several items in the grid.
        state.items.forEach((other) => {
          if (other.user && other.user.id === userId) {
            state.origins.set(other.id, {
              country: result.country, city: result.city, certain: true,
            });
          }
        });
        redraw();
      });
    });
  };

  const watchVisibility = (element) => {
    if (!watchVisibility.observer) {
      watchVisibility.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const id = Number(entry.target.dataset.itemId);
          entry.isIntersecting ? visible.add(id) : visible.delete(id);
        });
      }, { rootMargin: '200px' });
      observers.push(watchVisibility.observer);
    }
    watchVisibility.observer.observe(element);
  };

  const append = (items) => {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      if (state.seen.has(item.id)) return;
      state.seen.add(item.id);
      state.items.push(item);
      const element = VLF_GRID.card(item, originFor(item));
      cards.set(item.id, element);
      watchVisibility(element);
      fragment.appendChild(element);
    });
    ourGrid.appendChild(fragment);
  };

  const loadNextPage = async () => {
    const gen = generation;
    if (state.loading || state.exhausted) return;
    if (Date.now() < state.cooldownUntil) return;
    state.loading = true;
    redraw();
    try {
      const pending = (state.page === 0 && prefetch) ? prefetch : VLF_API.fetchPage(state.page + 1);
      prefetch = null;
      const { items, pagination } = await pending;
      if (gen !== generation) return;
      state.page += 1;
      state.total = pagination.total_entries || state.total;
      state.totalPages = pagination.total_pages || state.totalPages;
      append(items);
      if (items.length === 0 || state.page >= state.totalPages) state.exhausted = true;
      state.error = null;
    } catch (err) {
      if (err.rateLimited) {
        // Back off rather than letting the scroll observer retry immediately.
        state.backoffMs = Math.min(60000, (state.backoffMs || 5000) * 2);
        state.cooldownUntil = Date.now() + state.backoffMs;
        state.error = `Vinted is rate limiting search, retrying in ${Math.round(state.backoffMs / 1000)}s`;
        setTimeout(() => {
          if (gen !== generation) return;
          state.error = null;
          redraw();
          loadNextPage();
        }, state.backoffMs);
      } else {
        state.error = 'Could not load more results';
        state.exhausted = true;
      }
    } finally {
      state.loading = false;
      if (gen === generation) {
        requestLookups();
        redraw();
      }
    }
  };

  const hidePagination = () => {
    const link = document.querySelector('a[href*="page="]');
    if (!link) return;
    let node = link;
    for (let i = 0; i < 5 && node.parentElement; i += 1) {
      node = node.parentElement;
      if (node.querySelectorAll('a[href*="page="]').length >= 2) {
        node.setAttribute('data-vlf-hidden', '');
        return;
      }
    }
  };

  /* The page can hold several grids (a results grid, a "recently viewed"
     carousel). Take whichever holds the most item links. */
  const pickGrid = () => {
    let best = null;
    let most = 0;
    document.querySelectorAll(GRID_SELECTOR).forEach((grid) => {
      const links = grid.querySelectorAll('a[href*="/items/"]').length;
      if (links > most) { most = links; best = grid; }
    });
    return most >= 4 ? best : null;
  };

  /* React hydrates the catalogue after the server HTML arrives. Inserting
     nodes or editing className before that finishes makes hydration fail
     (React error #418) and React then re-renders the subtree, throwing our
     grid away. A hydrated node carries React's own expando key, so wait for
     it, then let the tree settle. */
  const isHydrated = (node) =>
    Object.keys(node).some((key) => key.startsWith('__reactFiber$') || key.startsWith('__reactProps$'));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const awaitHydration = async (node, gen) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (gen !== generation) return false;
      if (isHydrated(node)) break;
      await sleep(50);
    }
    return gen === generation;
  };

  /* A client side navigation renders the new catalogue in stages, so the grid
     can exist well before React has finished with it. Wait for its subtree to
     go quiet rather than mounting into a half built page. */
  const awaitStable = (node, gen, quietMs = 600, maxMs = 10000) => new Promise((resolve) => {
    const target = node.parentElement || node;
    let quiet;
    const finish = () => {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve(gen === generation);
    };
    const observer = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(finish, quietMs);
    });
    const cap = setTimeout(finish, maxMs);
    quiet = setTimeout(finish, quietMs);
    observer.observe(target, { childList: true, subtree: true });
  });

  /* Resolves once the results grid exists, or false if it never shows up. */
  const waitForGrid = (gen) => new Promise((resolve) => {
    if (pickGrid()) return resolve(true);
    let observer;
    let timer;
    const done = (found) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(found);
    };
    observer = new MutationObserver(() => {
      if (gen !== generation) return done(false);
      if (pickGrid()) done(true);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    timer = setTimeout(() => done(false), 20000);
  });

  const teardown = () => {
    generation += 1;
    attempts = 0;
    prefetch = null;
    phase = 'idle';
    VLF_UI.clearProgress();
    observers.forEach((observer) => observer.disconnect());
    observers = [];
    watchVisibility.observer = null;
    VLF_LOOKUP.clear();
    document.querySelectorAll('.vlf-grid, .vlf-bar, .vlf-sentinel').forEach((n) => n.remove());
    document.documentElement.removeAttribute('data-vlf-active');
    document.querySelectorAll('[data-vlf-hidden]').forEach((n) => n.removeAttribute('data-vlf-hidden'));
    Object.assign(state, {
      items: [], seen: new Set(), origins: new Map(), page: 0,
      totalPages: 1, total: 0, loading: false, exhausted: false, error: null,
      cooldownUntil: 0, backoffMs: 0,
    });
    cards = new Map();
    visible = new Set();
    ourGrid = null;
    theirGrid = null;
    sentinel = null;
    strip = null;
  };

  /* React can replace this part of the page at any time, including the grid's
     parent, so recover by re-attaching to whichever grid is on screen now
     instead of watching one element that may already be detached. */
  const remount = () => {
    const grid = pickGrid();
    if (!ourGrid || !grid) return;
    theirGrid = grid;                       // React may have built a new one
    const parent = theirGrid.parentElement;
    if (!parent) return;
    if (!theirGrid.hasAttribute('data-vlf-hidden')) theirGrid.setAttribute('data-vlf-hidden', '');
    if (!ourGrid.isConnected) parent.insertBefore(ourGrid, theirGrid);
    if (strip && !strip.isConnected) parent.insertBefore(strip, ourGrid);
    if (sentinel && !sentinel.isConnected) parent.insertBefore(sentinel, ourGrid.nextSibling);
  };

  const guardMount = () => {
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled || !ourGrid) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        if (!ourGrid) return;
        // The strip and sentinel are separate children of a parent React owns,
        // so either can be dropped on its own while the grid survives.
        const lost = !ourGrid.isConnected
          || !theirGrid.isConnected
          || !theirGrid.hasAttribute('data-vlf-hidden')
          || (strip && !strip.isConnected)
          || (sentinel && !sentinel.isConnected);
        if (lost) remount();
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    observers.push(observer);
  };

  const start = async (gen) => {
    theirGrid = pickGrid();
    if (!theirGrid) return false;

    state.settings = await VLF_SETTINGS.load();
    if (gen !== generation) return false;

    // Build the grid off-DOM and fill it first. The page is touched once, at
    // the end, so results appear in a single step instead of an empty frame.
    ourGrid = document.createElement('div');
    ourGrid.className = 'vlf-grid';
    sentinel = document.createElement('div');
    sentinel.className = 'vlf-sentinel';
    VLF_LOOKUP.setListener(() => redraw());

    setPhase('fetching', 'Reading results');
    await loadNextPage();
    if (gen !== generation) return false;

    if (state.items.length === 0) {        // leave Vinted's own grid in place
      console.warn(`${LOG} no results from the search API, leaving the page alone`);
      [ourGrid, strip, sentinel].forEach((node) => node && node.remove());
      ourGrid = null;
      strip = null;
      sentinel = null;
      setPhase('error', 'No results to filter', false);
      setTimeout(VLF_UI.clearProgress, 4000);
      return false;
    }

    const parent = theirGrid.parentElement;
    parent.insertBefore(ourGrid, theirGrid);
    parent.insertBefore(sentinel, ourGrid.nextSibling);
    strip = VLF_UI.mount(ourGrid, {
      onSelect: toggleCountry,
      onMode: (mode) => applySettings({ mode }),
      onCity: (showCity) => applySettings({ showCity }),
    });

    document.documentElement.setAttribute('data-vlf-active', '');
    theirGrid.setAttribute('data-vlf-hidden', '');
    hidePagination();
    guardMount();
    redraw();

    setPhase('ready', `${state.items.length} results tagged`, false);
    setTimeout(VLF_UI.clearProgress, 2500);
    console.info(`${LOG} ready: ${state.items.length} of ${state.total} results, market ${VLF_ORIGINS.marketCurrency()}`);

    const scroll = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadNextPage();
    }, { rootMargin: '600px' });
    scroll.observe(sentinel);
    observers.push(scroll);
    return true;
  };

  /* The catalogue is a single page app, so wait for the grid and restart on
     every navigation. */
  const boot = async () => {
    if (!isCatalogue()) return;
    // A navigation while a boot is in flight must not be dropped: the one in
    // flight is about to abandon itself on its generation check, so remember
    // that another run is owed and start it when this one unwinds.
    if (starting) { pendingBoot = true; return; }
    starting = true;
    attempts += 1;
    lastAttempt = Date.now();
    const gen = generation;
    try {
      // Nothing about the search request depends on the DOM, so it runs while
      // the page hydrates rather than after it.
      prefetch = VLF_API.fetchPage(1);
      prefetch.catch(() => {});            // handled where it is awaited
      setPhase('waiting', 'Waiting for the page');

      const found = await waitForGrid(gen);
      if (!found) {
        console.warn(`${LOG} no results grid on this page`);
        VLF_UI.clearProgress();
        return;
      }
      if (gen !== generation) return;
      const grid = pickGrid();
      if (grid) {
        if (!(await awaitHydration(grid, gen))) return;
        if (!(await awaitStable(grid, gen))) return;
      }
      if (!isCatalogue()) return;          // navigated away while we waited
      await start(gen);
    } catch (err) {
      console.error(`${LOG} could not start:`, err);
    } finally {
      starting = false;
      if (pendingBoot) {
        pendingBoot = false;
        boot();
      }
    }
  };

  /* Vinted rewrites the URL with a fresh search_id after each search, which is
     not a navigation as far as the results are concerned. */
  const searchIdentity = () => {
    const params = new URLSearchParams(location.search);
    params.delete('search_id');
    params.delete('page');
    params.sort();
    return `${location.pathname}?${params}`;
  };

  let lastUrl = searchIdentity();
  setInterval(() => {
    if (searchIdentity() !== lastUrl) {
      lastUrl = searchIdentity();
      teardown();
      boot();
      return;
    }
    // Safety net for any path that leaves a catalogue page unmounted. Capped
    // and spaced out so a genuine API failure cannot turn into a retry loop.
    if (ourGrid || starting || !isCatalogue()) return;
    if (attempts >= HEAL_MAX_ATTEMPTS) return;
    if (Date.now() - lastAttempt < HEAL_COOLDOWN_MS) return;
    boot();
  }, 500);

  VLF_SETTINGS.onChange((settings) => { state.settings = settings; redraw(); });

  /* The popup owns the controls, so it asks for the current tally and sends
     settings back. */
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message && message.type === 'vlf:state') {
      const { tally, unknown } = counts();
      reply({
        active: Boolean(ourGrid),
        starting,
        phase,
        catalogue: isCatalogue(),
        counts: tally,
        unknown,
        total: state.total,
        loaded: state.items.length,
        matching: state.items.filter((item) => matches(originFor(item))).length,
        settings: state.settings,
        status: statusLine(),
        market: VLF_ORIGINS.marketCurrency(),
      });
      return true;
    }
    if (message && message.type === 'vlf:apply') {
      applySettings(message.patch).then(() => reply({ ok: true }));
      return true;
    }
    return false;
  });

  boot();
})();
