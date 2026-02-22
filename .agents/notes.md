[0] `tsx` CLI can fail in restricted macOS sandboxes with `listen EPERM` on `.../tsx-*/.pipe`; using `node --import tsx ...` avoids the IPC pipe path.
[0] `rrule` should be imported as a default object in runtime-executed TS/ESM paths here (`import rrule from 'rrule'`), then accessed as `rrule.rrulestr(...)`.
[0] `pnpm dev` port-binding failures like `listen EPERM` on `0.0.0.0:5173`/`:8787` can come from sandbox networking restrictions, not app code regressions.
[0] For nested apps, Vite reads `.env` from the app directory unless `envDir` is set; use workspace-root `envDir` when shared root env vars are expected.
[0] Drizzle SQLite schema callbacks should return an array in `sqliteTable` third argument (not an object map) to avoid deprecation warnings.
[0] Long-running CLI service orchestration should live outside the data-command `run(...)` wrapper so help-only calls keep migration laziness and process signals can be managed explicitly.
[1] In this pnpm workspace, global linking should target the package directory explicitly (`pnpm link --global ./apps/cli`); linking root can select `tithe` (no bins). zsh may need `exec zsh` or `hash -r`, and missing `PNPM_HOME` on `PATH` can still cause `command not found`.
[1] `tithe web` should preserve configured `VITE_API_BASE` by default (for remote/Tailnet clients) and only rewrite port when `--api-port` is explicitly set; always forcing localhost breaks mobile/remote dev access.
[0] Root `pnpm dev` may need a local-safe `VITE_API_BASE` override because `.env` often carries Tailnet/mobile values; defaulting `pnpm dev` to `127.0.0.1:8787` avoids loading hangs in local browser workflows.
[1] `@fastify/swagger` only captures routes after the plugin is registered; declare routes in plugins registered after Swagger (or inside `app.after(...)`) or OpenAPI docs at `/docs`/`/docs/json` will show no operations.
[0] With Fastify plugin prefixes, use an empty local route path (`''`) for collection roots; using `'/'` yields OpenAPI paths with trailing slashes (e.g. `/v1/categories/`).
[1] In zsh shell commands, unescaped backticks or unbalanced quote characters in search patterns break parsing; quote or escape `rg` patterns carefully.
[0] Fastify schema validation errors reach `setErrorHandler`; if not mapped explicitly, they can be wrapped as generic 500s and break envelope contracts.
[0] In Drizzle with better-sqlite3, transaction callbacks are synchronous; repository methods used inside transactions should execute queries explicitly with `.run()`/`.all()`/`.get()` instead of relying on awaited query builders.
[0] In this workspace, downstream package typechecks may read dependency declarations from built `dist` outputs; after API-surface changes, build producer packages (`@tithe/domain`, `@tithe/api`) before consumer typechecks, and avoid parallelizing those steps.
[0] In restricted/offline sessions, `pnpm install` can fail with registry DNS errors; avoid introducing new dependency links that require install, and prefer local source wiring plus package builds.
[0] `biome format --write` may not resolve `organizeImports` lint issues; reorder imports manually (or run an imports-aware fix step) when lint still fails after formatting.
[0] `pnpm --filter <pkg> ...` scripts may run with package-local CWD, so `.env` autoload must resolve workspace-root path explicitly instead of relying on default `process.loadEnvFile()` behavior.
[0] `dotenv@17` can print an injection banner by default; set `quiet: true` in `dotenv.config(...)` to preserve deterministic `--json` CLI output.
[0] Fastify rejects requests with `FST_ERR_CTP_EMPTY_JSON_BODY` when `Content-Type: application/json` is sent on empty-body POSTs; frontend should only set JSON content-type when a body exists.
[0] Monzo can return `forbidden.insufficient_permissions` on `/accounts`; map it to `MONZO_REAUTH_REQUIRED` with clear remediation and avoid hard-coding stored OAuth scope.
[0] `pnpm ignored-builds` can reveal `better-sqlite3` was auto-ignored during install; deleting `node_modules`/lockfile alone won't fix missing bindings unless pnpm build-script policy is updated (for example `pnpm.onlyBuiltDependencies`) and install/rebuild is rerun.
[0] Avoid naming repo scripts `setup` in pnpm workspaces when onboarding docs also reference the built-in `pnpm setup`; use a distinct name like `setup:first-time` to prevent command ambiguity.
[0] In React page components here, hooks (`useMemo`, etc.) must be declared before loading/error early returns; conditionally skipping a hook on the first render causes a blank route via hooks-order runtime crash (`Rendered more hooks than during the previous render`).
