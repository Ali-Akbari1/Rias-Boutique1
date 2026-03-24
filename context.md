## Current Status
- Storefront + API implemented in this repo; payments via Clover, shipping via EasyPost, address autocomplete via Mapbox, reviews via Google Places.
- Product catalog managed via Decap CMS (`public/admin/config.yml`) and `src/content/products.json`.
- Cart and API enforce per-product max quantity (default 1, sold_out -> 0; hard cap 10).
- Vercel Analytics + Speed Insights integrated in `src/App.tsx`.
- `vercel.json` redirects apex to `https://www.riasboutique.com/`.
- Tests: `npm run test` passing locally on 2026-03-23.

## Known Constraints
- Checkout requires `CLOVER_MERCHANT_ID`, `CLOVER_PRIVATE_TOKEN`, `CLOVER_CHECKOUT_BASE_URL` (HTTPS). Optional: `CLOVER_PAGE_CONFIG_UUID`, `CLOVER_ENABLE_TIPS`.
- Webhooks require `CLOVER_WEBHOOK_SECRET` or `CLOVER_WEBHOOK_SECRETS` and pass timestamp tolerance.
- Shipping rates require `EASYPOST_API_KEY` and origin address fields; international quotes require `EASYPOST_DEFAULT_HS_TARIFF_NUMBER`.
- Address autocomplete requires `MAPBOX_ACCESS_TOKEN`; Google reviews require `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID`.
- Orders require Supabase admin config: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- API calls are CORS-guarded and rate-limited; checkout may require a cart token when `CART_TOKEN_SECRET` is set.
