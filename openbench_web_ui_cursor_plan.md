# OpenBench Web UI Build Plan (Cursor-Ready)

This document is a step-by-step implementation plan to build a web application that runs **OpenBench** benchmarks through a **visual UI** (instead of the CLI), shows **live progress/logs**, stores **artifacts**, and enables **result comparison**.

The plan is organized into milestones that follow **working-software checkpoints** (Gal’s principle): after each milestone you should have a runnable, verifiable application.

---

## 0) Product summary

### Goal
A web app where a user can:
- browse/select an OpenBench benchmark
- choose a model (`provider/model`)
- configure common run settings
- start a run asynchronously
- monitor status/progress and view logs
- view a structured results summary (plus raw artifacts)
- compare runs side-by-side

### Success criteria
- End-to-end run works from the UI (start → complete → view summary).
- Every run stores: config, exact command, stdout/stderr, raw OpenBench output, parsed summary.
- UI is stable for long runs (doesn’t freeze; logs are tailable).
- Comparison of completed runs works (at minimum primary metric side-by-side).

### Non-goals (early)
- Distributed runners / remote execution fleets.
- Fully general per-sample visualization for every benchmark type.
- Enterprise-grade RBAC and billing.

---

## 1) Recommended stack & conventions

### Stack
- **Backend**: Python + FastAPI
- **Runner integration**: `subprocess.Popen` calling `bench eval ...` (robust isolation)
- **DB**: SQLite (Milestones 0–4), Postgres later (Milestone 6+ optional)
- **Frontend**: React + Tailwind (SPA)
- **Realtime**: start with polling, upgrade to SSE (or WebSockets if preferred)
- **Charts**: Chart.js via `react-chartjs-2` (only when breakdown exists)
- **Packaging**: Docker + docker-compose once core features stabilize

### Key conventions
- Runs are identified by a **server-generated run_id** (UUID).
- All artifacts for a run live under `data/runs/<run_id>/`.
- Store **config.json** and **command.txt** for reproducibility.
- Store parsed summary under a stable schema in **summary.json**.

---

## 2) Repository structure (create this first)

```
openbench-web/
  backend/
    app/
      main.py
      core/
        config.py
      db/
        models.py
        session.py
        migrations/          # optional (Alembic) later
      runner/
        command_builder.py
        executor.py
        progress_parser.py
        artifacts.py
        summary_parser.py
      api/
        routes/
          benchmarks.py
          runs.py
          health.py
      services/
        benchmark_catalog.py
        run_store.py
    tests/
    pyproject.toml
    README.md

  frontend/
    src/
      api/
        client.ts
      pages/
        Dashboard.tsx
        NewRun.tsx
        RunDetail.tsx
        Compare.tsx
        Settings.tsx           # later
      components/
        RunTable.tsx
        RunForm.tsx
        LogTail.tsx
        MetricCards.tsx
        BreakdownChart.tsx
      router.tsx
      main.tsx
    package.json
    tailwind.config.js
    vite.config.ts

  data/
    runs/
  docker-compose.yml          # later
  README.md
```

---

## 3) Run artifact contract (must be stable)

For each run:
```
data/runs/<run_id>/
  config.json          # request payload + defaults + version
  command.txt          # exact CLI command executed
  env_keys_used.json   # optional: list of env var names injected (never values)
  stdout.log
  stderr.log
  openbench.log.json   # raw OpenBench logfile (format depends on CLI)
  summary.json         # parsed, stable schema (see below)
  meta.json            # timestamps/status/exit_code, etc.
```

### `summary.json` stable schema (v1)
Use this stable shape even if some fields are missing:

```json
{
  "schema_version": 1,
  "primary_metric": { "name": "accuracy", "value": 0.82, "unit": null },
  "metrics": [
    { "name": "accuracy", "value": 0.82, "unit": null }
  ],
  "breakdowns": [
    {
      "name": "category",
      "items": [
        { "key": "math", "value": 0.9, "unit": null }
      ]
    }
  ],
  "notes": [],
  "raw": { "source": "openbench.log.json", "hint": "best-effort extraction" }
}
```

If parsing fails, write:
- `primary_metric: null`
- `metrics: []`
- `breakdowns: []`
- and include a note explaining why.

---

## 4) Backend API contract (build incrementally)

### Benchmarks
- `GET /api/benchmarks`
  - returns list: `[{ name, category, description_short, tags? }]`
- `GET /api/benchmarks/{name}`
  - returns: `{ name, category, description, tags?, defaults?, notes? }`

### Runs
- `POST /api/runs`
  - body:
    ```json
    {
      "benchmark": "mmlu",
      "model": "openai/gpt-4o",
      "limit": 10,
      "temperature": 0.0,
      "top_p": 1.0,
      "max_tokens": 1024,
      "timeout": 120,
      "epochs": 1,
      "max_connections": 10
    }
    ```
  - returns: `{ "run_id": "<uuid>" }`
- `GET /api/runs`
  - returns list summaries: `{ run_id, benchmark, model, status, created_at, finished_at?, primary_metric? }[]`
- `GET /api/runs/{run_id}`
  - returns:
    - status & metadata
    - config & command
    - artifact URLs/paths (server-local path OK for first milestones)
    - summary (if available)
    - last N log lines (optional)
- `POST /api/runs/{run_id}/cancel` (Milestone 2+)

### Events (Milestone 2+)
- `GET /api/runs/{run_id}/events` (SSE)
  - events: `status`, `progress`, `log_line`, `completed`, `failed`, `canceled`

---

## 5) Milestone plan (Cursor implementation roadmap)

Each milestone includes:
- **Why**
- **Build tasks**
- **Manual verification checklist**
- **Definition of Done**

### Milestone 0 — Thin vertical slice (local single-user)
**Why**  
Prove the full loop: UI → start run → backend executes OpenBench → UI shows completion and artifacts.

**Build tasks**

Backend
1. FastAPI project bootstrap (`/api/health`).
2. Implement `Run` storage (SQLite or file-based JSON store).
   - Minimal Run fields: `run_id`, `benchmark`, `model`, `status`, `created_at`, `started_at`, `finished_at`, `artifact_dir`, `exit_code`, `error`.
3. Implement runner (subprocess):
   - Create run directory `data/runs/<run_id>/`.
   - Write `config.json`.
   - Build a CLI command string for OpenBench:
     - `bench eval <benchmark> --model <model> ...`
     - Add `--limit` if provided.
     - Add flags for structured logs if supported (prefer JSON).
   - Start process asynchronously (thread or background task).
   - Capture `stdout` and `stderr` to files.
   - On completion, write `meta.json` and update run status.
4. Endpoints:
   - `GET /api/benchmarks` (temporary static list is OK for M0)
   - `POST /api/runs`
   - `GET /api/runs/{id}`
   - `GET /api/runs` (recent runs)
5. Minimal benchmark catalog:
   - If OpenBench can list benchmarks via CLI (`bench list`), use that.
   - If not, ship with a small static list and upgrade in Milestone 1.

Frontend
1. Scaffold React + Tailwind (Vite).
2. Pages:
   - Dashboard: list recent runs, link to run detail, link to new run
   - New Run: benchmark dropdown, model input, limit input, Run button
   - Run Detail: show status, show stdout/stderr (tail or whole), show links to artifacts
3. Polling:
   - On Run Detail: poll `GET /api/runs/{id}` every 2s.

**Manual verification checklist**
- Start backend: `uvicorn app.main:app --reload`
- Start frontend: `npm run dev`
- Go to New Run, choose a benchmark and model, set limit=3, click Run.
- Run Detail page shows status changes: queued → running → completed/failed.
- Artifact directory exists with `config.json`, `stdout.log`, `stderr.log`, `command.txt`.

**Definition of Done**
- A user can start a run from UI and see it finish, with artifacts saved.
- Failure states are visible and don’t crash server or UI.

---

### Milestone 1 — Real benchmark discovery + run configuration + reproducibility
**Why**  
Replace placeholders with real OpenBench metadata and expose core configuration options.

**Build tasks**

Backend
1. Benchmark catalog service:
   - Implement `benchmark_catalog.py` to retrieve benchmarks dynamically.
   - Preferred approach:
     - call `bench list` and parse output
     - optionally call `bench describe <benchmark>` for details
   - Cache results in memory with TTL (e.g., 10 minutes) to avoid repeated CLI calls.
2. Expand run config:
   - Support: temperature, top_p, max_tokens, timeout, epochs, max_connections.
3. Command builder:
   - Implement `command_builder.py` that transforms config → CLI args.
   - Always write the exact command to `command.txt`.
   - Add `config.schema_version` and store it.
4. Store and expose reproducibility metadata:
   - `GET /api/runs/{id}` returns `config` + `command`.
5. Runs list:
   - `GET /api/runs` returns primary_metric if available (may be null until Milestone 3).

Frontend
1. Run configuration form:
   - Required: benchmark, model
   - Basic: limit
   - Advanced collapsible: temperature, top_p, max_tokens, timeout, epochs, max_connections
2. Benchmark detail panel:
   - When selecting benchmark, show its description and any key notes.

**Manual verification checklist**
- Benchmark list is populated dynamically.
- Configure advanced settings and confirm `command.txt` reflects them.
- Restart server and confirm run history persists (SQLite).

**Definition of Done**
- Benchmark list is real (not hardcoded) OR clearly isolated behind a service with a single place to change.
- Runs store config + exact command reliably.

---

### Milestone 2 — Live progress + log streaming + cancel
**Why**  
Make long runs workable and observable, not a “black box”.

**Build tasks**

Backend
1. Add SSE endpoint: `GET /api/runs/{id}/events`.
2. Stream:
   - periodic heartbeat (`status`)
   - `log_line` events from stdout/stderr (tailing)
   - best-effort `progress`:
     - implement `progress_parser.py` to parse common stdout patterns
     - if no parse available, emit “unknown progress” with heartbeat only
3. Cancel support:
   - Track subprocess PID/handle.
   - `POST /api/runs/{id}/cancel` terminates process and marks run canceled.
4. Avoid memory blowups:
   - do not keep full logs in RAM; stream from file.

Frontend
1. Replace polling in Run Detail with SSE subscription (fallback to polling if SSE fails).
2. Live log tail component:
   - auto-scroll toggle
   - show last N lines initially, then append
3. Cancel button:
   - only visible when running

**Manual verification checklist**
- Start a longer run and confirm UI updates without refresh.
- Cancel mid-run and confirm:
  - process stops
  - status becomes canceled
  - logs remain accessible

**Definition of Done**
- Live updates work and don’t degrade performance.
- Cancel behaves predictably and is persisted.

---

### Milestone 3 — Structured results viewer (summary + breakdown + chart)
**Why**  
Most users want the score, not just a logfile.

**Build tasks**

Backend
1. Implement `summary_parser.py` to produce `summary.json`:
   - Read OpenBench output (logfile and/or stdout) after run completes.
   - Extract:
     - primary metric (name/value)
     - additional metrics (if present)
     - breakdowns (if present)
   - Always write valid `summary.json` even on failure (notes explain missing fields).
2. Save primary metric to DB for dashboard rendering.

Frontend
1. Add a “Results” section to Run Detail:
   - Primary metric card (big)
   - Metrics table
   - Breakdown table
   - Breakdown bar chart when `breakdowns[0].items.length > 0`
2. Ensure graceful fallback:
   - If no parsed metrics, show “No structured summary available” and keep logs/artifacts.

**Manual verification checklist**
- Run a benchmark and confirm results show a primary metric.
- Dashboard shows primary metric for completed runs.
- Breakdown chart renders only when breakdown exists.

**Definition of Done**
- Summary is stable schema and never breaks the UI.
- UI makes results legible without reading logs.

---

### Milestone 4 — Compare runs
**Why**  
Comparison is a core reason to benchmark.

**Build tasks**

Backend (choose one)
- Option A (simpler): frontend fetches multiple runs and compares client-side.
- Option B: implement `POST /api/compare` that aligns:
  - metrics by name
  - breakdowns by key
  - returns a single comparison payload

Frontend
1. Dashboard supports multi-select runs.
2. Compare page:
   - summary comparison table (metrics x runs)
   - bar chart for primary metric
   - breakdown comparison if aligned
3. Warning UX:
   - if benchmarks differ, show a warning banner

**Manual verification checklist**
- Compare 2 runs of the same benchmark: table and chart make sense.
- Compare runs of different benchmarks: warning shown, still renders what it can.

**Definition of Done**
- Comparison is usable and doesn’t crash with missing fields.

---

### Milestone 5 — Multi-user authentication + secure API keys
**Why**  
Prevent key leakage and enable shared deployments.

**Build tasks**

Backend
1. Auth:
   - simple email/password + JWT or session cookies
2. User-scoped runs:
   - runs have `owner_user_id`
   - enforce access control on all run endpoints
3. API key storage:
   - store encrypted at rest
   - never return key values to frontend after save
4. Inject keys into subprocess env:
   - per run, set only the needed env var names (e.g., `OPENAI_API_KEY`) with stored values
   - write `env_keys_used.json` (names only)

Frontend
1. Login page
2. Settings page:
   - provider key forms
3. UX:
   - if provider key missing, show actionable error before run starts (best-effort)

**Manual verification checklist**
- User A cannot access User B run by changing URL.
- Runs succeed once correct key stored; fail clearly otherwise.

**Definition of Done**
- Multi-user is secure by default.
- No secrets leak through logs, endpoints, or stored artifacts.

---

### Milestone 6 — Packaging + deployment hardening
**Why**  
Make it easy to run locally and in production with persistence.

**Build tasks**
- Dockerize backend and frontend.
- docker-compose with:
  - web container
  - db container (optional if Postgres)
  - mounted volume for `data/`
- Health checks and basic monitoring logs.
- Optional: migration to Postgres with Alembic.

**Manual verification checklist**
- `docker compose up` boots the app.
- Runs persist across container restart.
- Upgrading image doesn’t wipe run history.

**Definition of Done**
- One-command deployment is reliable.

---

## 6) Cursor execution instructions (how to use this plan)
Use this workflow in Cursor for best results:
1. Implement **Milestone 0** fully.
2. Run the manual checks and fix issues until it works reliably.
3. Commit.
4. Move to the next milestone.

Keep each milestone small enough to validate quickly; avoid mixing milestones.

---

## 7) Risk list & mitigations

### CLI flag drift / output variability
OpenBench output formats and CLI flags may change across versions.
- Mitigation:
  - centralize CLI construction in `command_builder.py`
  - keep `summary_parser.py` best-effort and resilient
  - store raw artifacts always so parsing can be improved later

### Long runs producing huge logs
- Mitigation:
  - tail logs instead of loading full into UI
  - paginate sample views (later)
  - store artifacts on disk and stream on demand

### Provider API rate limits / failures
- Mitigation:
  - surface stderr clearly
  - persist failed state with error message
  - add retry UI later (optional)

### Security of keys
- Mitigation:
  - encrypt at rest
  - never store keys in run artifacts
  - strict endpoint authorization

---

## 8) “Ready-to-code” task checklist (copy into an issue tracker)

### Milestone 0
- [ ] Backend: FastAPI skeleton + /api/health
- [ ] Backend: Run store (SQLite or JSON)
- [ ] Backend: runner subprocess with artifact writing
- [ ] Backend: /api/benchmarks (static OK)
- [ ] Backend: /api/runs POST, GET list, GET detail
- [ ] Frontend: New Run page + Run Detail + Dashboard
- [ ] Frontend: polling status updates

### Milestone 1
- [ ] Backend: benchmark discovery service from OpenBench
- [ ] Backend: command builder + config schema version
- [ ] Frontend: advanced run config UI + benchmark details

### Milestone 2
- [ ] Backend: SSE events stream
- [ ] Backend: cancel endpoint
- [ ] Frontend: live logs + cancel + progress UX

### Milestone 3
- [ ] Backend: summary parser + summary.json schema
- [ ] Frontend: results viewer (cards/tables/chart)

### Milestone 4
- [ ] Frontend: compare UI
- [ ] Backend: optional compare endpoint

### Milestone 5
- [ ] Backend: auth + user-scoped runs
- [ ] Backend: encrypted key store + env injection
- [ ] Frontend: login + settings keys page

### Milestone 6
- [ ] Dockerize + compose + persistence
- [ ] Optional: Postgres + migrations

---

## 9) Local dev commands (suggested)

Backend
- Install: `pip install -e .` (or `uv pip install -e .`)
- Run: `uvicorn app.main:app --reload`

Frontend
- Install: `npm i`
- Run: `npm run dev`

---

## 10) Minimal UI routes

- `/` → Dashboard
- `/runs/new` → New Run
- `/runs/:id` → Run Detail + Results
- `/compare?ids=a,b,c` → Compare
- `/settings` → Settings (later)
- `/login` → Login (later)

---

### That’s it
Follow milestones in order and keep the app working at each checkpoint. Store artifacts and config from day one; it will save you huge time later.
