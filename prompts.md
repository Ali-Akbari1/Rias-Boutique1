## Operating Protocol
- Before any coding change or analysis, read `architecture.md`, `context.md`, `spec.md`, and `prompts.md`.

## Coding Style
- Use TypeScript + ESM; keep `.js` extensions in server-side import paths (`api/*`, `server/lib/*`).
- Use `async/await` and prefer `const` over `let`.
- Validate request payloads with Zod and return API errors via `sendError`.
- Keep API handlers thin; put shared logic in `server/lib`.
- UI: functional components + hooks; prefer shared primitives in `src/shared/ui`.
- Styling: Tailwind utilities backed by CSS variables in `src/index.css`.

## Commit Message Protocol
- Always provide a concise, imperative-mood commit message.
- Example: `feat(api): add address autocomplete via mapbox`
