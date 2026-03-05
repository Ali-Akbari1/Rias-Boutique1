# Ria's Boutique

React + Vite storefront for handcrafted Afghan clothing, with product browsing, product detail pages, cart management, optional Clover Checkout, Google Reviews integration, and Decap CMS editing at `/admin`.

Live site: `https://www.riasboutique.com`

## Features

- Search, filter, and sort product collection.
- Product detail pages with gallery, zoom, sizes, colors, and care details.
- Cart drawer with quantity controls and subtotal.
- Optional Clover Checkout flow (`/checkout`, `/checkout/success`, `/checkout/cancel`).
- Admin orders dashboard (`/orders-admin`) for viewing paid/pending orders and shipping details.
- Google Reviews section with live fetch fallback to curated reviews.
- Instagram highlights driven by environment config.
- Decap CMS for non-coder product editing and media uploads.
- Vercel serverless functions for Google Places + GitHub OAuth.

## Tech stack

- React 18 + TypeScript
- Vite 5
- Tailwind CSS + shadcn/ui (Radix)
- React Router
- Clover Hosted Checkout API
- Decap CMS
- Vitest + Testing Library

## Project structure

```text
api/                     # Vercel serverless functions
server/                  # Server-only checkout/order libraries and DB schema
tests/                   # Node API test suites
public/admin/            # Decap CMS admin app/config
public/uploads/          # Uploaded product images
src/content/products.json# Product source of truth
src/features/            # Frontend features (cart, catalog, home, navigation, product, store)
src/shared/ui/           # Shared UI primitives
src/features/catalog/data/products.ts # Product normalization + runtime mapping
src/pages/               # Storefront and checkout routes
```

## Getting started

### Prerequisites

- Node.js 18+ (Node 20 LTS recommended)
- npm

### Install and run

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

App runs at `http://localhost:8080`.

## Available scripts

- `npm run dev` - Start local dev server.
- `npm run build` - Production build.
- `npm run build:dev` - Development-mode build.
- `npm run preview` - Preview built app.
- `npm run lint` - Run ESLint.
- `npm run test` - Run Vitest once.
- `npm run test:watch` - Run Vitest in watch mode.

## Environment variables

Copy `.env.example` to `.env` and fill what you need.

### Client-side (`VITE_`)

- `VITE_ENABLE_CHECKOUT`: `true` or `false` to enable checkout routes/buttons.
- `VITE_GOOGLE_REVIEWS_URL`: Fallback URL for review links.
- `VITE_GOOGLE_LEAVE_REVIEW_URL`: Optional footer "Leave a Google Review" link.
- `VITE_INSTAGRAM_PROFILE_URL`: Instagram profile link.
- `VITE_INSTAGRAM_CARDS`: Comma-separated `postUrl|thumbnailUrl|label` entries.

Example:

```env
VITE_INSTAGRAM_CARDS=https://www.instagram.com/p/POST_1/|/instagram/post-1.jpg|Blue and gold set,https://www.instagram.com/reel/REEL_1/|/instagram/reel-1.jpg|Runway reel
```

### Server-side (`api/*` on Vercel)

- `CLOVER_API_BASE_URL`: Clover API base URL. Sandbox default is `https://apisandbox.dev.clover.com`.
- `CLOVER_MERCHANT_ID`: Clover merchant ID.
- `CLOVER_PRIVATE_TOKEN`: Clover private token for Hosted Checkout.
- `CLOVER_CHECKOUT_BASE_URL`: HTTPS site URL used for success/failure redirects.
- `CLOVER_ENABLE_TIPS`: Optional `true`/`false` to enable tips in hosted checkout.
- `CLOVER_PAGE_CONFIG_UUID`: Optional Clover page config UUID.
- `CLOVER_DEBUG_LOGS`: Optional `true`/`false` to enable verbose Clover diagnostics in Vercel logs.
- `LAUNCH10_EXPIRES_AT`: Optional ISO timestamp for launch discount expiry (default `2026-03-21T05:59:59.999Z`, which is March 20, 2026 at 11:59 PM in Calgary).
- `MERCHANT_ORDER_EMAIL`: Store inbox that receives new paid order alerts.
- `CUSTOMER_ORDER_EMAIL_ENABLED`: Optional `true`/`false` (default `true`) to send customer order confirmation emails after payment.
- `RESEND_API_KEY`: Optional Resend API key to send real merchant/customer emails.
- `RESEND_FROM_EMAIL`: Optional sender identity for Resend, e.g. `Ria's Boutique <orders@riasboutique.com>`.
- `RESEND_REPLY_TO_EMAIL`: Optional reply destination for customer emails. If not set, replies default to `MERCHANT_ORDER_EMAIL`.
- `SUPPORT_EMAIL`: Optional support contact shown in customer confirmation emails.
- `EMAIL_LOGO_URL`: Optional logo URL rendered in customer confirmation email header.
- `STORE_BRAND_NAME`: Optional brand label for transactional emails (default `Ria's Boutique`).
- `STORE_LOCATION_DISPLAY`: Optional location text in email footer (default `Calgary, AB`).
- `SUPABASE_URL`: Supabase project URL for server-side order persistence.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key used by serverless checkout/webhook/order endpoints.
- `VITE_SUPABASE_URL`: Optional client URL if frontend calls Supabase directly.
- `VITE_SUPABASE_ANON_KEY`: Optional client anon key if frontend calls Supabase directly.
- `GOOGLE_PLACES_API_KEY`: For `/api/google-reviews`.
- `GOOGLE_PLACE_ID`: For `/api/google-reviews`.
- `ADMIN_DASHBOARD_TOKEN`: Required token for `/api/admin-orders` and `/orders-admin`.
- `ALLOWED_PROMO_ORIGINS`: Optional CSV list of allowed browser origins for `/api/discount-signup`.
- `DISCOUNT_SIGNUP_RATE_LIMIT`: Optional rate limit for `/api/discount-signup` (default `20`).
- `DISCOUNT_SIGNUP_RATE_WINDOW_MS`: Optional rate limit window in milliseconds for `/api/discount-signup` (default `60000`).
- `DISCOUNT_CAMPAIGN_NAME`: Optional campaign label stored with popup signups (default `launch10_2026_03_20`).
- `GITHUB_OAUTH_CLIENT_ID`: For Decap GitHub auth.
- `GITHUB_OAUTH_CLIENT_SECRET`: For Decap GitHub auth.
- `CMS_BASE_URL`: Base URL used by OAuth callbacks, e.g. `https://www.riasboutique.com`.

## Clover checkout setup

1. In Clover dashboard, enable ecommerce + Hosted Checkout and create a private token.
2. Set `VITE_ENABLE_CHECKOUT=true`.
3. Add server env vars:
   - `CLOVER_API_BASE_URL`
   - `CLOVER_MERCHANT_ID`
   - `CLOVER_PRIVATE_TOKEN`
   - `CLOVER_CHECKOUT_BASE_URL` (must be `https://...`)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Restart/redeploy.

When checkout starts, frontend posts cart/customer data to `api/clover-checkout`, the server creates a Clover checkout session, and the user is redirected to Clover's hosted payment page.

Before first live checkout, run `server/db/schema.sql` in your Supabase SQL Editor.

## Product content model

Products are managed in `src/content/products.json`.

Important rules:

- Keep `id` unique for each product.
- Keep `slug` URL-safe and unique.
- Store uploaded images under `public/uploads` (or through Decap CMS media upload).

`src/features/catalog/data/products.ts` normalizes incomplete data and provides safe defaults.

## Decap CMS setup (`/admin`)

This repo includes Decap CMS so products can be edited in a form UI.

### One-time setup

1. Verify `public/admin/config.yml` has the correct `repo`, `branch`, and `base_url`.
2. Create a GitHub OAuth App:
   - Homepage URL: `https://www.riasboutique.com`
   - Callback URL: `https://www.riasboutique.com/api/callback`
3. In Vercel project settings, set:
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - `CMS_BASE_URL=https://www.riasboutique.com`
4. Redeploy.
5. Open `/admin` and sign in with GitHub.

### Local CMS testing

```powershell
npm run dev
npx decap-server
```

Then open `http://localhost:8080/admin`.

## Deployment notes

- Recommended host: Vercel (uses `api/*.ts` serverless functions).
- Add all required env vars in the Vercel project.
- Ensure domain and callback URLs match exactly for GitHub OAuth.

## Testing

Current tests are in `src/test/` (frontend) and `tests/api/` (server/API).

```powershell
npm run test
```

## Troubleshooting

- Checkout button disabled:
  - Confirm `VITE_ENABLE_CHECKOUT=true`.
  - Confirm Clover server env vars are set in your deployment.
- Unable to start Clover checkout:
  - Confirm `CLOVER_CHECKOUT_BASE_URL` is HTTPS.
  - Confirm `CLOVER_PRIVATE_TOKEN` and `CLOVER_MERCHANT_ID` are valid.
  - Temporarily set `CLOVER_DEBUG_LOGS=true` and inspect `X-Request-Id`-correlated logs for checkout, webhook, and order-status.
  - For local testing, use an HTTPS tunnel URL (for example ngrok) as `CLOVER_CHECKOUT_BASE_URL`.
- Live Google reviews not loading:
  - Check `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID`.
  - Site will fall back to static review content if API fetch fails.
- `/admin` GitHub login fails:
  - Recheck OAuth callback URL and `CMS_BASE_URL`.
  - Verify `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`.

## License

Private project.
