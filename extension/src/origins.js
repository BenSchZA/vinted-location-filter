/* Mapping between Vinted domains, seller currencies and countries. */

window.VLF_ORIGINS = window.VLF_ORIGINS || (() => {
  // A seller's currency is carried on every search result. Where a currency is
  // used by exactly one Vinted market it identifies the seller's country with
  // no further requests. EUR is deliberately absent: it is shared by around
  // eighteen markets and resolves nothing on its own.
  const CURRENCY_COUNTRY = {
    GBP: 'GB', USD: 'US', AUD: 'AU', PLN: 'PL', CZK: 'CZ', SEK: 'SE',
    DKK: 'DK', HUF: 'HU', RON: 'RO', CHF: 'CH', NOK: 'NO', BGN: 'BG',
  };

  // Currency each market prices in. Items with no `conversion` block are
  // priced in the market's own currency.
  const DOMAIN_CURRENCY = {
    'vinted.co.uk': 'GBP', 'vinted.com': 'USD', 'vinted.pl': 'PLN',
    'vinted.cz': 'CZK', 'vinted.se': 'SEK', 'vinted.dk': 'DKK',
    'vinted.hu': 'HUF', 'vinted.ro': 'RON',
    'vinted.fr': 'EUR', 'vinted.de': 'EUR', 'vinted.es': 'EUR',
    'vinted.it': 'EUR', 'vinted.nl': 'EUR', 'vinted.be': 'EUR',
    'vinted.at': 'EUR', 'vinted.ie': 'EUR', 'vinted.pt': 'EUR',
    'vinted.fi': 'EUR', 'vinted.gr': 'EUR', 'vinted.lu': 'EUR',
    'vinted.sk': 'EUR', 'vinted.si': 'EUR', 'vinted.hr': 'EUR',
    'vinted.lt': 'EUR', 'vinted.lv': 'EUR', 'vinted.ee': 'EUR',
  };

  const COUNTRY_NAME = {
    GB: 'United Kingdom', UK: 'United Kingdom', US: 'United States',
    AU: 'Australia', PL: 'Poland', CZ: 'Czechia', SE: 'Sweden',
    DK: 'Denmark', HU: 'Hungary', RO: 'Romania', CH: 'Switzerland',
    NO: 'Norway', BG: 'Bulgaria', FR: 'France', DE: 'Germany',
    ES: 'Spain', IT: 'Italy', NL: 'Netherlands', BE: 'Belgium',
    AT: 'Austria', IE: 'Ireland', PT: 'Portugal', FI: 'Finland',
    GR: 'Greece', LU: 'Luxembourg', SK: 'Slovakia', SI: 'Slovenia',
    HR: 'Croatia', LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia',
  };

  // Vinted reports the United Kingdom as "UK", which is not its ISO code.
  const normalise = (code) => (code === 'UK' ? 'GB' : code);

  const flag = (code) => {
    const c = normalise(code);
    if (!/^[A-Z]{2}$/.test(c || '')) return '';
    return String.fromCodePoint(...[...c].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
  };

  const countryName = (code) => COUNTRY_NAME[normalise(code)] || normalise(code) || 'Unknown';

  const marketCurrency = () => {
    const host = location.hostname.replace(/^www\./, '');
    return DOMAIN_CURRENCY[host] || null;
  };

  /* The currency an item is priced in by its seller. */
  const sellerCurrency = (item) =>
    (item.conversion && item.conversion.seller_currency) || marketCurrency();

  /* Country inferred from currency alone, or null when the currency is shared
     by several markets and only a seller lookup can decide. */
  const countryFromCurrency = (item) => {
    const cur = sellerCurrency(item);
    return cur ? CURRENCY_COUNTRY[cur] || null : null;
  };

  return { CURRENCY_COUNTRY, DOMAIN_CURRENCY, normalise, flag, countryName,
           marketCurrency, sellerCurrency, countryFromCurrency };
})();
