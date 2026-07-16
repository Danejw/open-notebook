# /start

Start the full Construction OS local development stack so the app is usable in a browser. Do not stop until every Done criterion passes, or you have a concrete blocker the user must fix (missing install, credentials, etc.).

## Goal

Bring up everything needed for development:

1. Docker Desktop (if needed for SurrealDB)
2. Free port 5055 from conflicting Docker containers
3. SurrealDB
4. Frontend API URL env (`127.0.0.1`, not `localhost`)
5. API server
6. Background worker
7. Frontend (Next.js)

Do the work yourself. Do not tell the user to run these commands unless a step requires interactive approval or a missing install they must fix.

## Preconditions

- Working directory: repo root (`construction-os`)
- Shell: PowerShell on Windows
- Repo root `.env` must exist with `SURREAL_URL=ws://127.0.0.1:8000/rpc` (copy from `.env.example` if missing)
- Frontend deps: `frontend/node_modules` present (`npm install` in `frontend/` if missing)
- Python env: `uv` available (`uv sync` if needed)

## Success contract

`/start` is **not done** until all of these return success:

| Check | Must pass |
|-------|-----------|
| Docker | `docker info` succeeds |
| SurrealDB | this project's `surrealdb` container is Up on `127.0.0.1:8000` |
| Port 5055 | no Docker container publishes host port `5055` |
| API health | `http://127.0.0.1:5055/health` → HTTP 200 |
| API via localhost | `http://localhost:5055/health` → HTTP 200 (proves nothing else stole the port) |
| Projects API | `http://127.0.0.1:5055/api/projects` succeeds |
| Worker | a `surreal_commands.cli.worker` process is running |
| Frontend | `http://127.0.0.1:3000` → HTTP 200 |
| Frontend proxy | `http://127.0.0.1:3000/api/config` → HTTP 200 with `dbStatus` present |
| Runtime API URL | `http://127.0.0.1:3000/config` → `apiUrl` is `http://127.0.0.1:5055` |

If any check fails after start attempts, fix the cause and re-verify. Do not report success with a failing check.

## Steps

Run in order. Skip starting a service only when its success-contract check already passes.

### 1. Probe current state

```powershell
try { Invoke-WebRequest "http://127.0.0.1:5055/health" -TimeoutSec 5 -UseBasicParsing | Select-Object StatusCode, Content } catch { "API down" }
try { Invoke-WebRequest "http://localhost:5055/health" -TimeoutSec 5 -UseBasicParsing | Select-Object StatusCode, Content } catch { "localhost API down / stolen" }
try { Invoke-WebRequest "http://127.0.0.1:3000" -TimeoutSec 5 -UseBasicParsing | Select-Object StatusCode } catch { "Frontend down" }
docker info 2>&1 | Out-Null; if ($LASTEXITCODE -eq 0) { "Docker ready" } else { "Docker not ready" }
docker ps --format "{{.Names}} {{.Ports}}" | Select-String "5055"
```

### 2. Docker Desktop

If `docker info` fails:

1. Start Docker Desktop:

```powershell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

2. Poll every ~5s until `docker info` succeeds (up to ~3 minutes). If it never becomes ready, stop and report Docker as the blocker.

### 3. Free port 5055 (mandatory)

On Windows, `localhost:5055` often resolves via IPv6 to Docker's `[::]:5055` mapping. A leftover container (commonly `open-notebook`) publishing `0.0.0.0:5055` / `[::]:5055` causes **Unable to Connect to API Server** even when the local API is healthy on `127.0.0.1:5055`.

**Always** clear host port 5055 before trusting the API:

```powershell
$owners = docker ps --format "{{.ID}}|{{.Names}}|{{.Ports}}" | Where-Object { $_ -match '5055' }
foreach ($row in $owners) {
  $id = ($row -split '\|')[0]
  $name = ($row -split '\|')[1]
  Write-Host "Stopping container stealing :5055 -> $name ($id)"
  docker stop $id
}
```

Re-check until `docker ps` shows **no** host binding for `5055`. Do not continue until this is true.

### 4. SurrealDB

Start **only** the database service (never bare `docker compose up -d`):

```powershell
docker compose up -d surrealdb
docker compose ps
```

Confirm this project's SurrealDB container is Up with `127.0.0.1:8000->8000/tcp`.

### 5. Guarantee frontend API URLs use 127.0.0.1

Ensure `frontend/.env.local` contains these exact values (create the file if missing; merge if it exists without replacing unrelated keys such as `NEXT_PUBLIC_A2UI_CHAT`):

```env
INTERNAL_API_URL=http://127.0.0.1:5055
API_URL=http://127.0.0.1:5055
NEXT_PUBLIC_API_URL=http://127.0.0.1:5055
```

**Why:** Next.js rewrites and the browser runtime config must not use `localhost:5055`, which can hit Docker/IPv6 instead of the local API.

If you change `frontend/.env.local` and the frontend is already running, restart the frontend (stop its node/next processes, then start again in step 8) so `next.config.ts` reloads `INTERNAL_API_URL`.

### 6. API server

If `http://127.0.0.1:5055/health` is not HTTP 200, start in a background terminal from the repo root:

```powershell
$env:API_RELOAD = 'false'
uv run --env-file .env run_api.py
```

Wait for `Application startup complete` / `Uvicorn running on http://127.0.0.1:5055` (or health 200), up to ~2 minutes.

Then verify **both**:

```powershell
Invoke-WebRequest "http://127.0.0.1:5055/health" -TimeoutSec 5 -UseBasicParsing
Invoke-WebRequest "http://localhost:5055/health" -TimeoutSec 5 -UseBasicParsing
```

If `127.0.0.1` works but `localhost` fails, return to step 3 (something still owns `:5055`), then re-check. Do not proceed while localhost is broken.

### 7. Background worker

Needed for uploads, embeddings, chat queue, and other async jobs.

Detect an existing worker:

```powershell
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
  Where-Object { $_.CommandLine -match 'surreal_commands\.cli\.worker' } |
  Select-Object ProcessId, CommandLine
```

If none, start in a background terminal from the repo root:

```powershell
$env:PYTHONPATH = (Get-Location).Path
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
uv run --env-file .env python -m surreal_commands.cli.worker --import-modules commands
```

Confirm logs show `Starting Surreal Commands worker` and the LIVE query listener, and re-check the process list.

### 8. Frontend

If `http://127.0.0.1:3000` is not up, or you changed `frontend/.env.local` and need a restart, start in a background terminal:

```powershell
cd frontend
npm run dev
```

Wait for `Local: http://localhost:3000` / Ready.

### 9. Verify end-to-end (required)

Run every check. All must pass:

```powershell
# API
Invoke-WebRequest "http://127.0.0.1:5055/health" -TimeoutSec 5 -UseBasicParsing
Invoke-WebRequest "http://localhost:5055/health" -TimeoutSec 5 -UseBasicParsing
Invoke-RestMethod "http://127.0.0.1:5055/api/projects" -TimeoutSec 10

# Frontend + proxy path the UI actually uses
Invoke-WebRequest "http://127.0.0.1:3000" -TimeoutSec 5 -UseBasicParsing
Invoke-WebRequest "http://127.0.0.1:3000/api/config" -TimeoutSec 5 -UseBasicParsing
(Invoke-RestMethod "http://127.0.0.1:3000/config" -TimeoutSec 5).apiUrl

# Infra
docker compose ps
docker ps --format "{{.Names}} {{.Ports}}" | Select-String "5055"
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
  Where-Object { $_.CommandLine -match 'surreal_commands\.cli\.worker' } |
  Select-Object ProcessId
```

Pass conditions:

- Both health URLs → 200
- `/api/projects` succeeds
- Frontend → 200
- `/api/config` → 200 (not 500 / socket hang up)
- `/config` → `apiUrl` equals `http://127.0.0.1:5055`
- No Docker container lists host port `5055`
- Worker process exists
- This project's SurrealDB is Up

If `/api/config` fails or `/config` still returns `localhost:5055`, fix env (step 5), free port 5055 (step 3), restart frontend (step 8), and re-run this section.

## Done criteria

Only after the success contract passes, report:

| Service | Status |
|---------|--------|
| App | http://localhost:3000 |
| API | http://127.0.0.1:5055 (health 200; localhost also 200) |
| API docs | http://127.0.0.1:5055/docs |
| SurrealDB | `127.0.0.1:8000` via Docker |
| Worker | Running |
| Runtime apiUrl | `http://127.0.0.1:5055` |

## Rules

- Prefer starting missing services over restarting healthy ones, **except** when env changed or a success-contract check fails
- Prefer `API_RELOAD=false` for a clean import of command modules
- Start only `surrealdb` via compose — do not start the published app container
- Always clear Docker owners of host port `5055` before declaring the API usable
- Always keep frontend API URLs on `127.0.0.1`, never rely on bare `localhost` for the API
- If something fails, fix or surface the concrete error; do not report partial success
- Keep the final reply concise: what is running and the browser URL
