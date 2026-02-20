[0] `tsx` CLI can fail in restricted macOS sandboxes with `listen EPERM` on `.../tsx-*/.pipe`; using `node --import tsx ...` avoids the IPC pipe path.
[0] `rrule` should be imported as a default object in runtime-executed TS/ESM paths here (`import rrule from 'rrule'`), then accessed as `rrule.rrulestr(...)`.
[0] `pnpm dev` port-binding failures like `listen EPERM` on `0.0.0.0:5173`/`:8787` can come from sandbox networking restrictions, not app code regressions.
[0] For nested apps, Vite reads `.env` from the app directory unless `envDir` is set; use workspace-root `envDir` when shared root env vars are expected.
[0] Drizzle SQLite schema callbacks should return an array in `sqliteTable` third argument (not an object map) to avoid deprecation warnings.
