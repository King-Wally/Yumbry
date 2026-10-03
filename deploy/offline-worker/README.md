# Offline page Worker

A Cloudflare Worker that sits in front of Yumbry. It passes traffic through to the origin, and when
the origin is unreachable (tunnel or server down) it serves `offline.html` instead of Cloudflare's
generic error page.

- Triggers on 502, 504 and 520–530 except 524 (and network errors). Not on 503, which the app uses for AI errors, nor on 524, an origin timeout.
- Returns `503` with `Retry-After: 300` and `Cache-Control: no-store`.
- Page text is en/nl/fr/es, chosen from `Accept-Language`. The page has inline CSS, no JS, no external requests.
- Non-HTML requests (API, assets) get a plain-text 503.

## Setup

1. **Prerequisites.** Your domain's DNS is on Cloudflare and the Yumbry hostname is proxied
   (orange cloud, the Tunnel's CNAME). Node 18+.
2. **Log in.** `cd deploy/offline-worker && npx wrangler login`
   (for CI, set `CLOUDFLARE_API_TOKEN` with _Workers Scripts: Edit_ and _Workers Routes: Edit_).
3. **Set your route.** In `wrangler.toml`, change `pattern` and `zone_name` to your hostname and domain.
4. **Deploy.** `npx wrangler deploy`
5. **Check the route.** Dashboard → Workers & Pages → `yumbry-offline` → Settings → Domains & Routes.
6. **Test.** Stop `cloudflared` (or the `app` container), load the site in a browser and confirm the
   offline page. Try `curl -si -H 'Accept: text/html' -H 'Accept-Language: nl' https://your-host/`.
   Then start it again and confirm the app loads normally.
7. **Optional alert.** Zero Trust → Networks → Tunnels → notifications, or Notifications → add a
   Tunnel health alert, so you hear when it goes down.

## Notes

- Every request to the route counts towards Workers' free-tier limit (100k requests/day).
- Editing `offline.html` or the strings in `worker.js` needs a new `npx wrangler deploy`.
- The favicon is the 96px PNG from `frontend/public`, inlined as a data URI.
