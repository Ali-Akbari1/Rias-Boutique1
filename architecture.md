## Tech Stack
- **Frontend:** React 18 + TypeScript (Vite). React Router for routing, Tailwind CSS with CSS variable tokens in `src/index.css`, Radix UI primitives and shadcn-style components in `src/shared/ui`, React Query for async state.
- **Backend/DB:** Vercel-style serverless API routes in `/api` (Node ESM). Shared business logic in `/server/lib`. Supabase Postgres for order storage via service-role client (`server/lib/supabase-admin.ts`).
- **CMS/Content:** Decap CMS (GitHub backend) configured in `public/admin/config.yml`. Product catalog lives in `src/content/products.json` with uploads in `public/uploads`.
- **Build/Tooling:** Vite build, Vitest, ESLint, TypeScript.

## Integrations
- Clover Checkout + webhooks for payments.
- EasyPost for shipping rates, address verification, and labels.
- Mapbox Searchbox for address autocomplete.
- Google Places for storefront reviews.
- Vercel Analytics + Speed Insights.

## Design Patterns
- Feature-based UI organization in `src/features/*`; shared UI primitives in `src/shared/ui`.
- API handlers are thin; validation uses Zod and shared logic in `server/lib`.
- Product catalog loaded on client (`src/features/catalog/data/products.ts`) and server (`server/lib/product-catalog.ts`).
- Styling uses Tailwind utilities backed by CSS variables and custom font utilities.
