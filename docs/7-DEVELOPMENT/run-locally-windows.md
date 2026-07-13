# Run Construction OS Locally on Windows

A step-by-step guide to start the app for development on Windows using PowerShell.

**What this does:** runs the database, API, background worker, and frontend on your machine so you can work on the code with hot reload.

**What you do not need:** `make`, WSL, or `docker-compose.dev.yml`.

---

## What you need installed

| Tool | Why | Check it works |
|------|-----|----------------|
| **Git** | Clone the repo | `git --version` |
| **Docker Desktop** | Runs SurrealDB (the database) | Docker Desktop is open and running |
| **uv** | Python package manager | `uv --version` |
| **Node.js 18+** | Frontend dev server | `node --version` |

Install missing tools:

```powershell
winget install Git.Git
winget install OpenJS.NodeJS
pip install uv
```

---

## One-time setup

Open PowerShell and go to the project folder:

```powershell
cd C:\Users\keali\OneDrive\Desktop\construction-os
```

> Use your actual clone path if it is different.

### 1. Install dependencies

```powershell
uv sync

cd frontend
npm install
cd ..
```

### 2. Create your `.env` file

```powershell
Copy-Item .env.example .env
```

Open `.env` and confirm these values:

```env
CONSTRUCTION_OS_ENCRYPTION_KEY=change-me-to-a-secret-string

SURREAL_URL=ws://127.0.0.1:8000/rpc
SURREAL_USER=root
SURREAL_PASSWORD=root
SURREAL_NAMESPACE=construction_os
SURREAL_DATABASE=construction_os
```

**Important:** when the API runs in PowerShell (not inside Docker), `SURREAL_URL` must use `127.0.0.1`, not `surrealdb` or `localhost`.

---

## Start the app (every time you develop)

You need **four PowerShell terminals**, all opened in the project root folder.

### Terminal 1 — Database

```powershell
cd C:\Users\keali\OneDrive\Desktop\construction-os
docker compose up -d surrealdb
```

Check that it started:

```powershell
docker compose ps
```

You should see `127.0.0.1:8000->8000/tcp` in the PORTS column.

> Start **only** SurrealDB. Do not run `docker compose up -d` without a service name — that can start the published app image instead of your local code.

---

### Terminal 2 — API

```powershell
cd C:\Users\keali\OneDrive\Desktop\construction-os
uv run --env-file .env run_api.py
```

Wait until you see:

```
Application startup complete.
```

API docs: http://127.0.0.1:5055/docs

---

### Terminal 3 — Background worker

The worker handles uploads, embeddings, and generated artifacts. Without it, sources stay stuck processing.

```powershell
cd C:\Users\keali\OneDrive\Desktop\construction-os
$env:PYTHONPATH = (Get-Location).Path
$env:PYTHONIOENCODING = 'utf-8'
uv run --env-file .env python -m surreal_commands.cli.worker --import-modules commands
```

Leave this terminal open. You should see `Starting Surreal Commands worker`.

---

### Terminal 4 — Frontend

```powershell
cd C:\Users\keali\OneDrive\Desktop\construction-os\frontend
npm run dev
```

Wait until you see:

```
Local: http://localhost:3000
```

Open the app: **http://localhost:3000**

---

## Check that everything works

Run this in a fifth terminal (or after the API is up):

```powershell
Invoke-RestMethod "http://127.0.0.1:5055/api/projects" | ConvertTo-Json -Depth 3
```

| Result | Meaning |
|--------|---------|
| A list of projects (or `[]`) | API and database are connected |
| Connection error | API or database is not running, or `.env` has the wrong `SURREAL_URL` |
| `404 Not Found` on `/projects` | Use `/api/projects` — the route includes the `/api` prefix |

Quick checklist:

- [ ] http://localhost:3000 loads the UI
- [ ] http://127.0.0.1:5055/docs shows API documentation
- [ ] `docker compose ps` shows SurrealDB running with port `8000`
- [ ] Worker terminal is still open with no crash

---

## Stop everything

In each terminal, press `Ctrl+C` to stop the API, worker, and frontend.

Stop the database:

```powershell
docker compose down
```

> Do **not** use `docker compose down -v` unless you intentionally want to wipe the database volume.

---

## Common problems

### `make` is not recognized

`make` is a Unix tool. On Windows, use the four-terminal commands above instead of `make start-all`.

### `docker-compose.dev.yml` not found

That file is not in this repo. Use:

```powershell
docker compose up -d surrealdb
```

### Port already in use (8000 or 5055)

Another app (often an old Open Notebook stack) may be using the port.

```powershell
docker ps
netstat -ano | findstr ":8000"
netstat -ano | findstr ":5055"
```

Stop the conflicting container or process, then start again.

### API cannot connect to the database

```
Connect call failed ('127.0.0.1', 8000)
```

1. Confirm SurrealDB is running: `docker compose ps`
2. Confirm `.env` has `SURREAL_URL=ws://127.0.0.1:8000/rpc`
3. Recreate the database container:

```powershell
docker compose down
docker compose up -d surrealdb
```

### Worker: "Failed to canonicalize script path"

Use the module form shown in Terminal 3 above — do not run `surreal-commands-worker` directly on Windows.

### Projects list is empty (`[]`)

The app is running, but this database folder has no projects yet. Create a project in the UI, or check that `docker compose` is using the `./surreal_data` folder in this repo (not a different project's data).

---

## What each service does

| Service | Port | URL |
|---------|------|-----|
| SurrealDB | 8000 | `ws://127.0.0.1:8000/rpc` |
| API | 5055 | http://127.0.0.1:5055/docs |
| Frontend | 3000 | http://localhost:3000 |

---

## Related docs

- [From Source Installation](../1-INSTALLATION/from-source.md) — macOS/Linux equivalent
- [Windows Native (no Docker)](../1-INSTALLATION/windows-native.md) — run SurrealDB without Docker
- [Development Setup](development-setup.md) — full developer environment guide
- [Connection Issues](../6-TROUBLESHOOTING/connection-issues.md) — more troubleshooting
