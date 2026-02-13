

## Stripe checkout setup

This project now supports Stripe Checkout with product price IDs.

1. Copy `.env.example` to `.env`.
2. Set `VITE_STRIPE_PUBLISHABLE_KEY` from your Stripe dashboard.
3. Create one Stripe Price for each product and add the IDs to:
   - `VITE_STRIPE_PRICE_1`
   - `VITE_STRIPE_PRICE_2`
   - `VITE_STRIPE_PRICE_3`
   - `VITE_STRIPE_PRICE_4`
   - `VITE_STRIPE_PRICE_5`
   - `VITE_STRIPE_PRICE_6`
4. Restart the dev server.

When configured, users can go from cart to `/checkout`, then Stripe redirects back to `/checkout/success` or `/checkout/cancel`.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

