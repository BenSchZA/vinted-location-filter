# Chrome Web Store privacy practices

Copy each block into the matching field on the Privacy practices tab. None of
this lives in the manifest; the store keeps it as listing metadata.

## Single purpose description

Vinted Location Filter has one purpose: to show which country each Vinted
search result is sold from, and to let the user filter the results by that
country.

## Permission justification: storage

Two things are kept in chrome.storage.local. The first is the user's own filter
settings: which countries they selected, whether non-matching results are
hidden or faded, and whether cities are shown. The second is a cache of the
country and city already looked up for a seller, so the same seller is not
requested from Vinted again on a later search. Vinted rate limits that endpoint,
so the cache is what keeps the extension within those limits.

Both are local to the user's browser. Nothing is transmitted anywhere, and the
cache can be cleared at any time from the extension popup.

## Permission justification: host permissions

The extension runs only on Vinted's own sites, each listed explicitly:
vinted.co.uk, vinted.com, vinted.de, vinted.fr and the other country domains,
26 in total. No wildcard host and no non-Vinted host is requested.

Access to those pages is needed to read the search results the user is viewing,
tag each result with the seller's country, and hide or fade the ones that do not
match the filter. The extension also calls Vinted's own catalogue API on that
same site to retrieve the results and, when the user turns the option on, the
seller's city. Every request goes to the Vinted site the user already has open.
No request is made to any third party.

## Remote code justification

No remote code is used. All JavaScript and CSS ships inside the extension
package. The extension does not call eval or new Function, does not use dynamic
import, and never injects or loads an externally hosted script. There is no CDN
dependency.

It does make network requests, but only to Vinted's own JSON API on the site the
user is viewing. Those responses are parsed as JSON data and are never executed
as code.

## Data usage

The extension collects no user data. Nothing is sent to the developer or to any
third party, and nothing is sold or transferred. Filter settings and the seller
cache stay in the user's own browser.

On the data types list, none should be selected. The three certification
checkboxes (data is not sold or transferred to third parties, not used or
transferred for purposes unrelated to the item's single purpose, not used or
transferred to determine creditworthiness or for lending) all apply and can be
certified.
