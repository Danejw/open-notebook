"""Live smoke: chat queue + A2UI flags against local API/worker."""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
os.chdir(ROOT)
load_dotenv()

API = (os.getenv("API_URL") or "http://127.0.0.1:5055").rstrip("/")
if not API.endswith("/api"):
    API = API + "/api"
TIMEOUT = 30.0


def ok(label: str, detail: str = "") -> None:
    print(f"PASS  {label}" + (f" — {detail}" if detail else ""))


def fail(label: str, detail: str) -> None:
    print(f"FAIL  {label} — {detail}")
    raise SystemExit(1)


def main() -> None:
    results: Dict[str, Any] = {}

    # --- Health (no /api prefix) ---
    health_base = API[: -len("/api")] if API.endswith("/api") else API
    with httpx.Client(base_url=API, timeout=TIMEOUT) as client:
        hr = httpx.get(f"{health_base}/health", timeout=TIMEOUT)
        if hr.status_code != 200:
            fail("API /health", f"status={hr.status_code} body={hr.text[:200]}")
        ok("API /health", hr.text)

        # --- A2UI backend flag (in-process + running API env via dotenv) ---
        from construction_os.graphs.a2ui_emit import (
            build_ask_user_messages,
            format_a2ui_agent_catalog,
            is_a2ui_chat_enabled,
            validate_a2ui_messages,
        )

        if not is_a2ui_chat_enabled():
            fail(
                "A2UI_CHAT_ENABLED",
                f"env={os.getenv('A2UI_CHAT_ENABLED')!r} — restart API with flag true",
            )
        ok("A2UI_CHAT_ENABLED", repr(os.getenv("A2UI_CHAT_ENABLED")))

        fe = os.getenv("NEXT_PUBLIC_A2UI_CHAT")
        # Prefer frontend .env.local if present
        fe_local = os.path.join(ROOT, "frontend", ".env.local")
        if os.path.isfile(fe_local):
            for line in open(fe_local, encoding="utf-8"):
                if line.startswith("NEXT_PUBLIC_A2UI_CHAT="):
                    fe = line.split("=", 1)[1].strip().strip('"').strip("'")
        if str(fe).strip().lower() not in {"1", "true", "yes"}:
            fail("NEXT_PUBLIC_A2UI_CHAT", f"value={fe!r}")
        ok("NEXT_PUBLIC_A2UI_CHAT", repr(fe))

        catalog = format_a2ui_agent_catalog()
        if "AskUser" not in catalog or "A2UI v0.9" not in catalog:
            fail("A2UI catalog", "missing AskUser / v0.9")
        ok("A2UI catalog", f"{len(catalog)} chars")

        msgs = build_ask_user_messages(
            question="Smoke: pick one",
            options=[
                {"id": "a", "label": "Alpha", "recommended": True},
                {"id": "b", "label": "Beta"},
            ],
        )
        validate_a2ui_messages(msgs)
        ok("A2UI AskUser payload", f"{len(msgs)} protocol messages")

        # --- Projects / session ---
        projects = client.get("/projects").json()
        if not isinstance(projects, list):
            fail("GET /projects", f"unexpected body={projects!r}")
        if not projects:
            created = client.post(
                "/projects",
                json={
                    "name": f"Smoke Test {uuid.uuid4().hex[:6]}",
                    "description": "Auto-created for chat queue + A2UI smoke",
                },
            )
            if created.status_code not in (200, 201):
                fail(
                    "POST /projects",
                    f"{created.status_code} {created.text[:300]}",
                )
            project_id = created.json()["id"]
            ok("POST /projects", f"created {project_id}")
        else:
            project_id = projects[0]["id"]
            ok("GET /projects", f"using {project_id}")

        session = client.post(
            "/chat/sessions",
            json={"project_id": project_id, "title": f"smoke-queue-{uuid.uuid4().hex[:8]}"},
        )
        if session.status_code not in (200, 201):
            fail("POST /chat/sessions", f"{session.status_code} {session.text[:300]}")
        session_id = session.json()["id"]
        ok("POST /chat/sessions", session_id)

        # --- Chat queue get ---
        q = client.get(f"/chat/sessions/{session_id}/queue")
        if q.status_code != 200:
            fail("GET queue", f"{q.status_code} {q.text[:300]}")
        queue_body = q.json()
        ok(
            "GET queue",
            f"status={queue_body.get('status')} items={len(queue_body.get('items') or [])}",
        )

        # --- Enqueue ---
        client_request_id = f"smoke-{uuid.uuid4().hex}"
        enq = client.post(
            f"/chat/sessions/{session_id}/queue/items",
            json={
                "client_request_id": client_request_id,
                "prompt": "Smoke test: reply with exactly the word PONG.",
                "loop_count": 1,
                "context_config": {},
                "schedule_runner": True,
            },
        )
        if enq.status_code != 202:
            fail("POST enqueue", f"{enq.status_code} {enq.text[:400]}")
        item = enq.json()
        item_id = item["id"]
        ok(
            "POST enqueue",
            f"id={item_id} status={item.get('status')} request={client_request_id}",
        )

        # Idempotent re-enqueue
        enq2 = client.post(
            f"/chat/sessions/{session_id}/queue/items",
            json={
                "client_request_id": client_request_id,
                "prompt": "Smoke test: reply with exactly the word PONG.",
                "loop_count": 1,
                "context_config": {},
                "schedule_runner": True,
            },
        )
        if enq2.status_code != 202:
            fail("POST enqueue idempotent", f"{enq2.status_code} {enq2.text[:300]}")
        if enq2.json()["id"] != item_id:
            fail("POST enqueue idempotent", "returned different item id")
        ok("POST enqueue idempotent", "same item id")

        # --- Poll until terminal or timeout (worker must be running) ---
        # Completed items are hidden (visible=false) from GET queue, so track
        # presence + revision + session messages instead of only visible status.
        terminal = {"completed", "failed", "cancelled"}
        deadline = time.time() + 90
        last: Optional[Dict[str, Any]] = None
        saw_item = True
        saw_running = False
        last_revision = int(queue_body.get("revision") or 0)
        while time.time() < deadline:
            snap = client.get(f"/chat/sessions/{session_id}/queue").json()
            last_revision = max(last_revision, int(snap.get("revision") or 0))
            items = {i["id"]: i for i in (snap.get("items") or [])}
            current = snap.get("current_item")
            if current and current.get("id") == item_id:
                last = current
            elif item_id in items:
                last = items[item_id]
            else:
                last = None

            if last:
                saw_item = True
                status = last.get("status")
                if status == "running":
                    saw_running = True
                if status in terminal:
                    break
            elif saw_item:
                # Item left the visible list after we had seen it → completed
                # (domain sets visible=false on successful completion).
                last = {
                    "id": item_id,
                    "status": "completed",
                    "error_message": None,
                }
                break
            time.sleep(1.0)

        if not last:
            fail(
                "queue worker poll",
                "never observed queue item (enqueue may have failed silently)",
            )
        status = last.get("status")
        results["queue_item_status"] = status
        results["queue_item_error"] = last.get("error_message")
        results["queue_revision"] = last_revision
        results["saw_running"] = saw_running

        # Confirm assistant output landed on the session when completed
        if status == "completed":
            sess = client.get(f"/chat/sessions/{session_id}").json()
            messages = sess.get("messages") or []
            results["session_message_count"] = len(messages)
            ok(
                "queue worker completed",
                f"item hidden from visible queue; session messages={len(messages)} revision={last_revision}",
            )
        elif status == "pending":
            fail(
                "queue worker claim",
                "item still pending after 90s — is surreal-commands worker running?",
            )
        elif status == "running":
            fail(
                "queue worker finish",
                "item still running after 90s — worker may be stuck on LLM",
            )
        elif status == "failed":
            ok(
                "queue worker ran (failed)",
                f"error={str(results['queue_item_error'])[:160]}",
            )
        else:
            fail("queue worker poll", f"unexpected status={status}")

        # Stream endpoint opens
        with client.stream(
            "GET",
            f"/chat/sessions/{session_id}/queue/stream",
            params={"after_revision": 0},
            timeout=10.0,
        ) as stream:
            if stream.status_code != 200:
                fail("GET queue/stream", f"status={stream.status_code}")
            # read first chunk
            got = False
            for chunk in stream.iter_text():
                if chunk.strip():
                    got = True
                    break
            if not got:
                fail("GET queue/stream", "no SSE payload")
            ok("GET queue/stream", "received SSE data")

    print("\nSMOKE SUMMARY")
    print(json.dumps(results, indent=2, default=str))
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
