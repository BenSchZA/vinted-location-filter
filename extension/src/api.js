/* Client for the Vinted search API used by the catalogue page. */

window.VLF_API = window.VLF_API || (() => {
  const PER_PAGE = 96;
  const TIMEOUT_MS = 15000;

  /* A request that never settles would stall the lookup queue behind it. */
  const request = async (path) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(path, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  /* Search parameters for the page the user is looking at. The catalogue URL
     and the API take the same parameter names, so the query string passes
     through unchanged apart from paging. */
  const searchParams = (page) => {
    const params = new URLSearchParams(location.search);
    params.delete('page');
    params.delete('per_page');
    params.set('page', String(page));
    params.set('per_page', String(PER_PAGE));
    return params;
  };

  const fetchPage = async (page) => {
    const res = await request(`/api/v2/catalog/items?${searchParams(page)}`);
    if (res.status === 429) throw Object.assign(new Error('rate limited'), { rateLimited: true });
    if (!res.ok) throw new Error(`catalog request failed: ${res.status}`);
    const body = await res.json();
    if (!body || !Array.isArray(body.items)) throw new Error('unexpected catalog response');
    return { items: body.items, pagination: body.pagination || {} };
  };

  /* Country and city for one seller. This is the only endpoint that carries
     either, and it rate limits after a handful of rapid calls, so every caller
     goes through the throttled queue in lookup.js rather than calling here. */
  const fetchSeller = async (userId) => {
    const res = await request(`/api/v2/users/${userId}`);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After')) || null;
      throw Object.assign(new Error('rate limited'), { rateLimited: true, retryAfter });
    }
    if (!res.ok) throw new Error(`seller request failed: ${res.status}`);
    const body = await res.json();
    const user = body.user || body;
    return {
      country: VLF_ORIGINS.normalise(user.country_code || ''),
      city: (user.city || '').trim(),
    };
  };

  return { PER_PAGE, fetchPage, fetchSeller };
})();
