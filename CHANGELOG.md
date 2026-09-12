# Changelog

## 0.2.0

- Seller lookups are limited to cards on screen. Every result on the page used
  to be queued, including rows far below the fold and results the filter had
  already removed, which spent Vinted's rate limit on listings nobody was
  looking at. On a 95 result page that is 20 lookups instead of 95, and it no
  longer grows as you scroll.
- The seller location panel closes on a click anywhere outside it, or on
  Escape, rather than only on a second click of the control.

## 0.1.0

First version.

- Tags every Vinted search result with the seller's country, taken from the
  currency in Vinted's own search response, so it costs no extra requests.
- Filters results by country, hiding or fading the rest. The country list is
  built from the current search, with counts.
- Optional city on each card, looked up one seller at a time and cached.
- Controls in a bar above the results and in the toolbar popup.
- Continuous scrolling in place of Vinted's paging.
