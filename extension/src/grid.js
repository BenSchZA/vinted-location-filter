/* Renders search results into the extension's own grid. */

window.VLF_GRID = window.VLF_GRID || (() => {
  const money = (price) => {
    if (!price) return '';
    const amount = Number(price.amount);
    try {
      return new Intl.NumberFormat(navigator.language, {
        style: 'currency', currency: price.currency_code,
      }).format(amount);
    } catch {
      return `${amount} ${price.currency_code}`;
    }
  };

  const thumbnail = (item) => {
    const photo = item.photo || (item.photos && item.photos[0]);
    if (!photo) return null;
    const sized = (photo.thumbnails || []).find((t) => t.type === 'thumb310');
    return (sized && sized.url) || photo.url || null;
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  /* One result. `origin` is { country, city, certain } where certain is false
     while the country is still only a guess from a shared currency. */
  const card = (item, origin) => {
    const root = el('div', 'vlf-card');
    root.dataset.itemId = String(item.id);
    root.dataset.userId = String(item.user && item.user.id);

    const href = item.url || `${location.origin}${item.path || ''}`;

    const imageLink = el('a', 'vlf-card__image');
    imageLink.href = href;
    const src = thumbnail(item);
    if (src) {
      const img = el('img');
      img.src = src;
      img.loading = 'lazy';
      img.alt = item.title || '';
      imageLink.appendChild(img);
    }

    const tag = el('span', 'vlf-origin');
    imageLink.appendChild(tag);
    root.appendChild(imageLink);

    const body = el('a', 'vlf-card__body');
    body.href = href;
    const box = item.item_box || {};
    body.appendChild(el('span', 'vlf-card__brand', box.first_line || item.brand_title || item.title || ''));
    body.appendChild(el('span', 'vlf-card__meta', box.second_line || item.size_title || ''));
    body.appendChild(el('span', 'vlf-card__price', money(item.price)));
    if (item.total_item_price) {
      body.appendChild(el('span', 'vlf-card__total', `${money(item.total_item_price)} incl.`));
    }
    root.appendChild(body);

    paint(root, origin);
    return root;
  };

  /* Writes the origin tag and filter state onto an existing card. */
  const paint = (root, origin) => {
    const tag = root.querySelector('.vlf-origin');
    if (!tag) return;
    root.dataset.country = origin.country || '';
    if (!origin.country) {
      tag.textContent = 'Checking';
      tag.dataset.state = 'pending';
      return;
    }
    const name = VLF_ORIGINS.countryName(origin.country);
    const flag = VLF_ORIGINS.flag(origin.country);
    tag.textContent = [flag, origin.city ? `${name}, ${origin.city}` : name]
      .filter(Boolean).join(' ');
    tag.dataset.state = origin.certain ? 'known' : 'guess';
    tag.title = origin.certain
      ? 'Country taken from the seller\'s currency'
      : 'Country not yet confirmed for this seller';
  };

  const apply = (root, { visible, mode }) => {
    root.classList.toggle('vlf-card--hidden', !visible && mode === 'remove');
    root.classList.toggle('vlf-card--faded', !visible && mode === 'fade');
  };

  return { card, paint, apply, money };
})();
