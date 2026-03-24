## Feature: Catalog & Cart
- **Requirement 1:** Product data comes from `src/content/products.json` and is loaded by `src/features/catalog/data/products.ts` (client) and `server/lib/product-catalog.ts` (server).
- **Requirement 2:** `availability: sold_out` forces max quantity `0`; `maxQuantity` defaults to `1` and is capped at `10`.
- **API Endpoint:** Validated as part of checkout and shipping quote requests.
- **Security:** Quantity limits are enforced server-side via `getMaxQuantityForCatalogProduct`.

## Feature: Checkout (Clover)
- **Requirement 1:** Validate requests with `checkoutRequestSchema` and apply `LAUNCH10` when active.
- **Requirement 2:** Shipping requires a verified quote token; pickup does not require a shipping address.
- **Requirement 3:** Idempotency via cart + shipping fingerprint; reuse pending checkout when possible.
- **API Endpoint:** `POST /api/clover-checkout`
- **Security:** CORS allowlist + rate limiting + bot detection; optional cart token (`CART_TOKEN_SECRET`).

## Feature: Shipping Rates
- **Requirement 1:** Verify shipping address and return rates with EasyPost.
- **Requirement 2:** Return a signed quote token (required for checkout).
- **Requirement 3:** Support flat-rate fallback when configured.
- **API Endpoint:** `POST /api/shipping-rates`
- **Security:** Quote tokens are HMAC-signed; requests are rate limited.

## Feature: Address Autocomplete
- **Requirement 1:** Provide Mapbox suggestions and resolve selection details.
- **Requirement 2:** Validate address fields for verification requests.
- **API Endpoint:** `POST /api/address-autocomplete`
- **Security:** CORS + rate limit; bot detection on verification requests.

## Feature: Clover Webhook
- **Requirement 1:** Verify signatures using raw request body, apply timestamp tolerance, update order status, and send emails.
- **API Endpoint:** `POST /api/clover-webhook`
- **Security:** HMAC signature verification; webhook rate limiting.
