# Ria's Boutique

[![CI](https://github.com/Ali-Akbari1/Rias-Boutique1/actions/workflows/ci.yml/badge.svg)](https://github.com/Ali-Akbari1/Rias-Boutique1/actions/workflows/ci.yml)
![Lint](https://img.shields.io/badge/lint-ESLint-4B32C3)
![Typecheck](https://img.shields.io/badge/typecheck-TypeScript-3178C6)
![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18)
![Build](https://img.shields.io/badge/build-Vite-646CFF)

React + Vite storefront for handcrafted Afghan clothing, backed by Vercel serverless APIs for checkout, shipping, reviews, CMS auth, and order operations.

Live site: `https://www.riasboutique.com`

## What this repo contains

- Product catalog, collection filtering, product detail pages, and cart state.
- Hosted Clover checkout with server-side price validation and order persistence.
- Shipping quotes and label operations via EasyPost.
- Launch discount capture and transactional email delivery.
- Google Reviews ingestion through a backend wrapper.
- Decap CMS integration at `/admin`.
- Health, rate limiting, origin validation, and structured server logging.

## Stack

- React 18 + TypeScript
- Vite 5
- React Router
- Tailwind CSS + shadcn/ui
- Zod validation
- Supabase order storage
- Clover Hosted Checkout
- EasyPost shipping
- Vitest + Testing Library
- GitHub Actions CI

## Project layout

```text
api/                      Vercel serverless functions
server/                   Server-only integrations, validation, storage, logging
scripts/                  Build, sitemap, image, and media maintenance scripts
src/content/products.json Product source of truth
src/features/             Frontend feature modules
src/pages/                Route entry points
public/admin/             Decap CMS
public/uploads/           Product media served by the storefront
tests/api/                API test suites
```

## Local development

### Prerequisites

- Node.js 20 LTS recommended
- npm

### Start the app

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The storefront runs at `http://localhost:8080`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Vite dev server |
| `npm run build` | Production build with sitemap generation |
| `npm run build:dev` | Development-mode build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run app and server TypeScript checks |
| `npm run test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run sitemap:generate` | Rebuild `public/sitemap.xml` from route and product data |
| `npm run images:convert` | Generate `.webp` derivatives and normalize product image refs |
| `npm run media:hygiene` | Dry-run orphan cleanup and oversized upload compression |
| `npm run media:hygiene -- --apply` | Apply upload cleanup and compression changes |

## Environment variable matrix

`.env.example` is the exhaustive reference. The matrix below groups the variables by operational concern.

| Area | Variables | Required when | Notes |
| --- | --- | --- | --- |
| Storefront toggles | `VITE_ENABLE_CHECKOUT`, `VITE_ENABLE_SHIPPING_CHARGES`, `VITE_LAUNCH10_EXPIRES_AT` | Always | Client-visible feature flags and promo timing |
| Store metadata | `VITE_STORE_PICKUP_*`, `VITE_GOOGLE_REVIEWS_URL`, `VITE_INSTAGRAM_*`, `STORE_BRAND_NAME`, `STORE_LOCATION_DISPLAY` | Always | UI copy, pickup info, footer/social metadata |
| Origins and CORS | `ALLOWED_BROWSER_ORIGINS`, `ALLOWED_PRODUCTION_ORIGINS`, `ALLOWED_PREVIEW_ORIGINS`, `ALLOWED_DEV_ORIGINS`, `ALLOWED_CHECKOUT_ORIGINS`, `ALLOWED_PROMO_ORIGINS` | Always | Browser-facing APIs validate origin against these lists |
| Clover checkout | `CLOVER_API_BASE_URL`, `CLOVER_MERCHANT_ID`, `CLOVER_PRIVATE_TOKEN`, `CLOVER_CHECKOUT_BASE_URL`, `CLOVER_ENABLE_TIPS`, `CLOVER_PAGE_CONFIG_UUID`, `CLOVER_TIMEOUT_MS`, `CLOVER_DEBUG_LOGS` | Checkout enabled | Hosted checkout session creation and payment verification |
| Clover webhooks | `CLOVER_WEBHOOK_SECRET`, `CLOVER_WEBHOOK_SECRETS`, `CLOVER_WEBHOOK_SECRET_SANDBOX`, `CLOVER_WEBHOOK_SECRET_PRODUCTION`, `CLOVER_WEBHOOK_TOLERANCE_MS` | Webhooks enabled | Supports secret rotation and environment split |
| Pricing and discounting | `FREE_SHIPPING_THRESHOLD_MINOR`, `FLAT_SHIPPING_RATE_MINOR`, `CHECKOUT_TAX_RATE`, `LAUNCH10_EXPIRES_AT`, `DISCOUNT_CAMPAIGN_NAME` | Checkout or promo signup enabled | Server-side source of truth for pricing and discount timing |
| Order storage | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ORDER_STORE_ADAPTER` | Persistent orders | Use `ORDER_STORE_ADAPTER=memory` only for isolated local testing |
| Client Supabase access | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Only if the browser needs Supabase | Not required for the checkout flow itself |
| EasyPost shipping | `SHIPPING_PROVIDER_MODE`, `ENABLE_SHIPPING_CHARGES`, `EASYPOST_API_KEY`, `EASYPOST_API_BASE_URL`, `EASYPOST_QUOTE_SECRET`, `EASYPOST_QUOTE_TTL_MS`, `EASYPOST_CARRIER_ACCOUNT_IDS`, `EASYPOST_PREFERRED_CARRIERS`, `EASYPOST_PREFERRED_SERVICES`, `EASYPOST_FROM_*`, `EASYPOST_PARCEL_*`, `EASYPOST_ITEM_WEIGHT_OZ`, `EASYPOST_ADDITIONAL_ITEM_*`, `EASYPOST_PRODUCT_ORIGIN_COUNTRY`, `EASYPOST_DEFAULT_HS_TARIFF_NUMBER`, `EASYPOST_CUSTOMS_*` | `SHIPPING_PROVIDER_MODE=easypost` | Required for live quotes and label purchase |
| Email delivery | `MERCHANT_ORDER_EMAIL`, `CUSTOMER_ORDER_EMAIL_ENABLED`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO_EMAIL`, `SUPPORT_EMAIL`, `EMAIL_LOGO_URL` | Order or promo emails enabled | Resend is optional locally, required for live email delivery |
| Rate limiting and anti-abuse | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CHECKOUT_RATE_LIMIT`, `ORDER_STATUS_RATE_LIMIT`, `WEBHOOK_RATE_LIMIT`, `ADDRESS_*`, `SHIPPING_RATES_*`, `DISCOUNT_SIGNUP_RATE_LIMIT`, `GOOGLE_REVIEWS_RATE_LIMIT`, `CART_TOKEN_SECRET`, `CART_TOKEN_MAX_AGE_MS` | Production | Falls back to in-memory buckets when Upstash is not configured |
| Reviews | `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` | Live Google Reviews enabled | Frontend calls the local wrapper, not Google directly |
| Admin operations | `ADMIN_DASHBOARD_TOKEN` | `/orders-admin` used | Sent via `x-admin-token` or `Authorization: Bearer` |
| CMS auth | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `CMS_BASE_URL` | Decap CMS GitHub auth enabled | Used by `/api/auth` and `/api/callback` |

## Deployment runbook

1. Create the Vercel project and connect the GitHub repository.
2. Add all required environment variables from `.env.example`.
3. Scope third-party keys to the minimum required permissions and restrict them to the correct production or preview origins.
4. Run `server/db/schema.sql` against the target Supabase project before first live checkout.
5. Confirm `CLOVER_CHECKOUT_BASE_URL`, `CMS_BASE_URL`, and all allowed origin variables match the deployed domain exactly.
6. Set `SHIPPING_PROVIDER_MODE=flat_rate` first if you want to launch checkout before live carrier quoting is ready.
7. Run the local verification set before merging:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

8. Open `/api/health` after deploy and verify the reported service flags.
9. Execute a full sandbox checkout and confirm:
   - Order row is created
   - Payment status transitions to `paid`
   - Confirmation email is logged
   - Shipment data is present when EasyPost is enabled

## Operational endpoints

- `/api/health` returns a no-store health payload with service configuration flags.
- `/api/order-status` verifies pending orders and can reconcile Clover payment state.
- `/api/clover-webhook` is the primary payment confirmation path.
- `/orders-admin` is the manual operations dashboard for paid orders and shipment actions.

## Asset lifecycle policy

- Product media lives in `public/uploads`.
- Product references live in `src/content/products.json`; if a file is not referenced there or elsewhere in the repo, it is a cleanup candidate.
- `npm run images:convert` generates `.webp` derivatives and normalizes product references toward those optimized assets.
- `npm run media:hygiene` audits orphaned upload files and oversized retained media.
- `npm run media:hygiene -- --apply` deletes orphaned uploads and compresses retained images larger than 500 KB.
- Re-run `npm run sitemap:generate` or `npm run build` after adding or removing catalog routes.

## Security and platform notes

- Browser-facing APIs validate origin against environment-driven allowlists.
- Pricing, tax, shipping, and discount validation are re-computed on the server before order creation.
- Sensitive POST routes use strict Zod schemas.
- Server-side timestamps are stored and emitted in UTC ISO format.
- External provider failures are logged through the structured logger in `server/lib/logger.ts`.

## Checkout flow summary

1. The frontend requests only local `/api/*` endpoints.
2. The server validates cart contents against the catalog and recomputes pricing.
3. Shipping quotes are signed server-side before checkout creation.
4. Clover redirects the customer to the hosted payment page.
5. Webhook and order-status verification paths reconcile payment state.
6. After payment, the server decrements inventory, stores shipment data, and sends notifications.

## CMS setup

1. Configure `public/admin/config.yml` with the correct repository and branch.
2. Create a GitHub OAuth app with the live callback URL set to `/api/callback`.
3. Set `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, and `CMS_BASE_URL`.
4. Redeploy and verify login at `/admin`.

## Troubleshooting

- Checkout disabled: confirm `VITE_ENABLE_CHECKOUT=true`.
- Checkout request rejected by origin policy: verify the deployed domain is present in the allowed origin variables.
- Shipping quote failures: confirm `SHIPPING_PROVIDER_MODE`, `EASYPOST_*`, and the origin address are set correctly.
- Order emails missing: confirm `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `MERCHANT_ORDER_EMAIL`.
- CMS login fails: re-check `CMS_BASE_URL` and the GitHub OAuth callback URL.

## License

Private project.
