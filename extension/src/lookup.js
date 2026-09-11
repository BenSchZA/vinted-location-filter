/* Throttled, cached seller lookups.

   /api/v2/users/{id} is the only source of a seller's country and city, and it
   starts returning 429 after roughly six rapid calls. Requests therefore run
   one at a time behind a delay, results are cached across sessions, and
   repeated 429s widen the delay and eventually stop the queue instead of
   retrying into a ban. */

window.VLF_LOOKUP = window.VLF_LOOKUP || (() => {
  const BASE_DELAY_MS = 1500;
  const MAX_DELAY_MS = 60000;
  const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  const GIVE_UP_AFTER = 5;          // consecutive 429s before the queue stops

  const memory = new Map();         // userId -> { country, city }
  const pending = new Map();        // userId -> Promise
  const queue = [];                 // [{ userId, priority, resolve, reject }]

  let delay = BASE_DELAY_MS;
  let consecutive429 = 0;
  let running = false;
  let halted = false;
  let onChange = () => {};

  const key = (userId) => `s:${userId}`;

  const readCache = async (userId) => {
    if (memory.has(userId)) return memory.get(userId);
    try {
      const stored = await chrome.storage.local.get(key(userId));
      const hit = stored[key(userId)];
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
        memory.set(userId, { country: hit.country, city: hit.city });
        return memory.get(userId);
      }
    } catch { /* storage unavailable; fall through to a live lookup */ }
    return null;
  };

  const writeCache = async (userId, value) => {
    memory.set(userId, value);
    try {
      await chrome.storage.local.set({ [key(userId)]: { ...value, ts: Date.now() } });
    } catch { /* a full or disabled store only costs us the cache */ }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const notify = (payload) => {
    // A listener that throws must not kill the queue.
    try { onChange(payload); } catch { /* the caller's problem, not ours */ }
  };

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      await pump();
    } finally {
      running = false;                 // never leave the queue wedged
    }
  };

  const pump = async () => {
    while (queue.length && !halted) {
      queue.sort((a, b) => b.priority - a.priority);
      const job = queue.shift();
      try {
        const value = await VLF_API.fetchSeller(job.userId);
        await writeCache(job.userId, value);
        consecutive429 = 0;
        delay = Math.max(BASE_DELAY_MS, delay / 2);
        job.resolve(value);
      } catch (err) {
        if (err.rateLimited) {
          consecutive429 += 1;
          delay = Math.min(MAX_DELAY_MS, Math.max(delay * 2, (err.retryAfter || 0) * 1000));
          if (consecutive429 >= GIVE_UP_AFTER) {
            halted = true;
            queue.unshift(job);
            notify({ halted: true, delay });
            break;
          }
          queue.unshift(job);          // try this seller again after the wait
          notify({ throttled: true, delay });
        } else {
          job.resolve(null);           // a missing seller should not stall the queue
        }
      }
      pending.delete(job.userId);
      notify({ remaining: queue.length, delay, halted });
      if (queue.length) await sleep(delay);
    }
  };

  /* Resolve one seller. Cached sellers return immediately; the rest join the
     queue, highest priority first. Returns null if the seller cannot be read. */
  const resolve = (userId, priority = 0) => {
    if (memory.has(userId)) return Promise.resolve(memory.get(userId));
    if (pending.has(userId)) return pending.get(userId);
    // Claimed synchronously so that concurrent callers for one seller share a
    // single request instead of each queueing their own.
    const promise = (async () => {
      const cached = await readCache(userId);
      if (cached) return cached;
      return new Promise((res) => {
        queue.push({ userId, priority, resolve: res });
        drain();
      });
    })();
    pending.set(userId, promise);
    promise.finally(() => pending.delete(userId));
    return promise;
  };

  /* Drops everything still waiting. Used when the user turns an option off, so
     a cancelled request does not keep the queue busy for several minutes. */
  const clear = () => {
    queue.splice(0).forEach((job) => {
      pending.delete(job.userId);
      job.resolve(null);
    });
    notify({ remaining: 0, delay, halted });
  };

  const cachedOnly = (userId) => memory.get(userId) || null;
  const status = () => ({ remaining: queue.length, delay, halted });
  const resume = () => { halted = false; consecutive429 = 0; delay = BASE_DELAY_MS; drain(); };
  const setListener = (fn) => { onChange = fn; };

  return { resolve, clear, cachedOnly, status, resume, setListener, BASE_DELAY_MS };
})();
