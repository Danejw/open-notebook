# MCP client authorization (Construction OS)

Pinned security and authorization rules for the in-app MCP **client**.

Related: [architecture.md](./architecture.md) · [extending.md](./extending.md)

---

## Hard rules

1. **Server allowlist is the only authorization source** — never trust model-proposed tool names alone.
2. **v1 auto-executes only `risk_level == "read"`** — `action` / `unknown` are visible in admin but not bound as executable tools.
3. **Validate args before network** — schema failures and duplicates never hit MCP.
4. **Audit every attempt** — `ChatToolCall` + AG-UI `mcp_tool_call` snapshots (requested / running / succeeded / failed / rejected).
5. **No secrets in public DTOs or logs** — tokens encrypted at rest; errors redact Authorization-looking text.
6. **SSRF-safe URLs by default** — private/loopback/metadata hosts blocked unless opted in.
7. **Bounded loops and payloads** — selection, iterations, calls, result chars, timeouts are capped.

---

## Risk levels

| Level | Meaning | Executable in chat (v1)? |
|-------|---------|--------------------------|
| **read** | Safe to auto-run | Yes |
| **action** | Mutating / side-effecting | No (rejected if somehow requested) |
| **unknown** | Ambiguous | No |

**Classifier:** `classify_tool_risk` in `construction_os/mcp/risk.py`

Order of precedence:

1. MCP annotations: `readOnlyHint: true` → `read`; `destructiveHint: true` or `readOnlyHint: false` → `action`
2. Name/description heuristics (`get`/`list`/… vs `create`/`delete`/…)
3. Mixed hints → prefer `action`; else `unknown`

Risk is recomputed on every sync. Changing classifier behavior is a security change — update tests and this doc together.

---

## Allowlist construction

**Function:** `build_allowlist(tool_ids, strict_selected_tools=…)`

Per selected `mcp_tool` id:

| Check | Lenient (live chat) | Strict (queue) |
|-------|---------------------|----------------|
| Tool missing | Skip | `McpToolSelectionError` |
| `available=false` | Skip | Error |
| Connection missing | Skip | Error |
| Connection not `connected` | Skip | Error |
| `risk_level != read` | Entry may exist but `executable=false` | Error |
| Over `MAX_SELECTED_TOOLS` | Truncate | Error |

**Runtime name:** `mcp__<conn_short>__<sanitized_tool_name>`

Only `executable_entries()` become LangChain tools. Unauthorized model tool calls → `reject_unauthorized` (audit + ToolMessage; no MCP contact).

---

## Execution gates

Inside `execute_allowlisted_tool`:

1. Persist audit `requested` → emit progress
2. Reject if not executable / not `read`
3. Reject duplicate `(runtime_name, args)` in the same turn (`DuplicateCallGuard`)
4. `validate_tool_arguments` against discovered `input_schema` (JSON Schema subset)
5. Status `running` → `McpClient.connect` + `call_tool`
6. Bound `result_text` via `mcp_result_to_text`; status `succeeded` or `failed`
7. Emit progress on every status transition

---

## URL / SSRF policy

**Function:** `validate_mcp_url`

| Rule | Default |
|------|---------|
| Scheme | `http` / `https` only |
| Embedded credentials in URL | Rejected |
| Private / loopback / link-local / metadata IPs | Blocked |
| Hostname resolving to blocked IP | Blocked |

Opt-in for local MCP servers:

```text
CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS=true
```

---

## Limits (env-tunable)

| Constant | Env | Default |
|----------|-----|---------|
| `MAX_SELECTED_TOOLS` | `CONSTRUCTION_OS_MCP_MAX_SELECTED_TOOLS` | 8 |
| `MAX_TOOL_ITERATIONS` | `CONSTRUCTION_OS_MCP_MAX_ITERATIONS` | 6 |
| `MAX_TOOL_CALLS` | `CONSTRUCTION_OS_MCP_MAX_CALLS` | 12 |
| `MCP_REQUEST_TIMEOUT_SECONDS` | `CONSTRUCTION_OS_MCP_REQUEST_TIMEOUT_SECONDS` | 30 |
| `MAX_RESULT_CHARS` | `CONSTRUCTION_OS_MCP_MAX_RESULT_CHARS` | 8000 |
| `MAX_ERROR_CHARS` | `CONSTRUCTION_OS_MCP_MAX_ERROR_CHARS` | 500 |
| `MCP_PROTOCOL_VERSION` | `CONSTRUCTION_OS_MCP_PROTOCOL_VERSION` | `2025-03-26` |

Defined in `construction_os/mcp/limits.py`.

---

## Audit statuses

| Status | Meaning |
|--------|---------|
| `requested` | Audit created |
| `running` | Remote call in flight |
| `succeeded` | Tool returned non-error result |
| `failed` | Transport/error/`isError` |
| `rejected` | Allowlist / risk / duplicate / schema / unauthorized |

Public shape: `public_tool_call` (no huge `raw_result` on the wire).

---

## What is intentionally not allowed (v1)

- Auto-executing `action` / `unknown` tools (no approval UI yet)
- Stdio / SSE-only / WebSocket transports (Streamable HTTP only)
- Model inventing tools outside the allowlist
- Silent “best effort” tool selection on the **queue** path (`strict_mcp_tools`)

When you change any rule above, update this file and the matching tests (`tests/test_mcp_*.py`) in the same PR.
