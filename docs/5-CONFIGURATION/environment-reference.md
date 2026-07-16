# Complete Environment Reference

Comprehensive list of all environment variables available in Construction OS.

---

## API Configuration

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `API_URL` | No | Auto-detected | URL where frontend reaches API (e.g., http://localhost:5055) |
| `INTERNAL_API_URL` | No | http://localhost:5055 | Internal API URL for Next.js server-side proxying, including reconnectable chat queue streams |
| `API_CLIENT_TIMEOUT` | No | 300 | Client timeout in seconds (how long to wait for API response) |
| `CONSTRUCTION_OS_PASSWORD` | No | None | Password to protect Construction OS instance |
| `CONSTRUCTION_OS_ENCRYPTION_KEY` | **Yes** | None | Secret string to encrypt credentials stored in database (any string works). **Required** for the credential system. Supports Docker secrets via `_FILE` suffix. |
| `HOSTNAME` | No | `0.0.0.0` (in Docker) | Network interface for Next.js to bind to. Default `0.0.0.0` ensures accessibility from reverse proxies |

> **Important**: `CONSTRUCTION_OS_ENCRYPTION_KEY` is required for storing AI provider credentials via the Settings UI. Without it, you cannot save credentials. If you change or lose this key, all stored credentials become unreadable.

---

## Database: SurrealDB

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `SURREAL_URL` | Yes | ws://surrealdb:8000/rpc | SurrealDB WebSocket connection URL |
| `SURREAL_USER` | Yes | root | SurrealDB username |
| `SURREAL_PASSWORD` | Yes | root | SurrealDB password |
| `SURREAL_NAMESPACE` | Yes | construction_os | SurrealDB namespace |
| `SURREAL_DATABASE` | Yes | construction_os | SurrealDB database name |

---

## Database: Retry Configuration

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `SURREAL_COMMANDS_RETRY_ENABLED` | No | true | Enable retries on failure |
| `SURREAL_COMMANDS_RETRY_MAX_ATTEMPTS` | No | 3 | Maximum retry attempts |
| `SURREAL_COMMANDS_RETRY_WAIT_STRATEGY` | No | exponential_jitter | Retry wait strategy (exponential_jitter/exponential/fixed/random) |
| `SURREAL_COMMANDS_RETRY_WAIT_MIN` | No | 1 | Minimum wait time between retries (seconds) |
| `SURREAL_COMMANDS_RETRY_WAIT_MAX` | No | 30 | Maximum wait time between retries (seconds) |

---

## Database: Concurrency

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `SURREAL_COMMANDS_MAX_TASKS` | No | 5 | Maximum concurrent worker tasks. Separate chat sessions may drain concurrently, but each session runs one queued message at a time. |

---

## Chat Queue and Checkpoints

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `LANGGRAPH_CHECKPOINT_FILE` | No | `./data/sqlite-db/checkpoints.sqlite` | Persistent SQLite checkpoint file used for conversation history and crash-safe chat queue recovery. The API and worker must use the same durable file. |

### A2UI generative chat surfaces

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `A2UI_CHAT_ENABLED` | No | false | When `true`/`1`/`yes`, project chat enables A2UI v0.9 (AskUser + Basic catalog) over AG-UI `CUSTOM` events (`a2ui`). |
| `NEXT_PUBLIC_A2UI_CHAT` | No | unset | Frontend gate for rendering A2UI surfaces. Set to `1` or `true` in the Next.js env. Both flags should be enabled together. |

Queued chat execution also requires the `surreal-commands` worker. The queue
itself is stored in SurrealDB; the checkpoint file records LangGraph turns so
a retried worker can recover without duplicating a response. Keep both stores
on persistent volumes in production.

---

## LLM Timeouts

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `ESPERANTO_LLM_TIMEOUT` | No | 60 | LLM inference timeout in seconds |
| `ESPERANTO_SSL_VERIFY` | No | true | Verify SSL certificates (false = development only) |
| `ESPERANTO_SSL_CA_BUNDLE` | No | None | Path to custom CA certificate bundle |

---

## Embeddings

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `CONSTRUCTION_OS_EMBEDDING_BATCH_SIZE` | No | 50 | Number of texts sent per embedding batch. Lower this for CPU-only or stricter OpenAI-compatible embedding providers. |
| `CONSTRUCTION_OS_MIN_CHUNK_SIZE` | No | 5 | Minimum chunk size in tokens. Chunks below this threshold are dropped before embedding to avoid degenerate single-character fragments that some providers (e.g. llama.cpp) return null embeddings for. Set to `0` to disable filtering. |

---

## MCP Client (remote tool connections)

Construction OS can connect to **remote** MCP servers (Streamable HTTP) as a client. Configure these variables on the API service.

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS` | No | `false` | When `true`, allow MCP endpoint URLs that resolve to private, loopback, link-local, or cloud metadata addresses. **Leave disabled in production** unless you intentionally connect to local MCP servers. |
| `CONSTRUCTION_OS_MCP_MAX_SELECTED_TOOLS` | No | 8 | Maximum MCP tools a user may attach to one chat message. |
| `CONSTRUCTION_OS_MCP_MAX_ITERATIONS` | No | 6 | Maximum model↔tool loop iterations per chat turn. |
| `CONSTRUCTION_OS_MCP_MAX_CALLS` | No | 12 | Maximum MCP tool executions per chat turn. |
| `CONSTRUCTION_OS_MCP_REQUEST_TIMEOUT_SECONDS` | No | 30 | Timeout for each MCP HTTP request. |
| `CONSTRUCTION_OS_MCP_MAX_RESULT_CHARS` | No | 8000 | Maximum characters from a tool result passed back to the model. |
| `CONSTRUCTION_OS_MCP_MAX_ERROR_CHARS` | No | 500 | Maximum characters stored in safe MCP error messages. |
| `CONSTRUCTION_OS_MCP_PROTOCOL_VERSION` | No | `2025-03-26` | MCP protocol version sent during `initialize`. |

**Local development example** (connect to a fake or local MCP server on localhost):

```bash
CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS=true
```

---

## API / CORS

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `CORS_ORIGINS` | No | `*` | Comma-separated list of origins allowed to call the API (e.g. `https://app.example.com,https://www.example.com`). Default `*` accepts any origin; **for production, set this explicitly to your frontend origin(s)**. Changes require an API restart. The API logs a warning on startup when unset. |

**When to change this**:
- You access the UI at a custom domain (reverse proxy, HTTPS, public deployment).
- The frontend runs on a different port than `3000`.
- You serve the frontend from a different host than the API (e.g. CDN).

Example for a production deployment behind a reverse proxy:

```bash
CORS_ORIGINS=https://project.example.com
```

---

## Text-to-Speech (TTS)

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `TTS_BATCH_SIZE` | No | 5 | Concurrent TTS requests (1-5, depends on provider) |
| `ESPERANTO_TTS_TIMEOUT` | No | 300 | Text-to-speech request timeout in seconds (passed through to Esperanto). Increase it for slow or self-hosted TTS providers that take longer than 5 minutes to synthesize a segment, otherwise long podcast segments can fail with a timeout. |

---

## Content Extraction

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `FIRECRAWL_API_KEY` | No | None | Firecrawl API key for advanced web scraping |
| `JINA_API_KEY` | No | None | Jina AI API key for web extraction |

**Setup:**
- Firecrawl: https://firecrawl.dev/
- Jina: https://jina.ai/

---

## Network / Proxy

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `HTTP_PROXY` | No | None | HTTP proxy URL for outbound HTTP requests |
| `HTTPS_PROXY` | No | None | HTTPS proxy URL for outbound HTTPS requests |
| `NO_PROXY` | No | None | Comma-separated list of hosts to bypass proxy |

Route all outbound HTTP requests through a proxy server. Useful for corporate/firewalled environments.

The underlying libraries (esperanto, content-core, podcast-creator) automatically detect proxy settings from these standard environment variables.

**Affects:**
- AI provider API calls (OpenAI, Anthropic, Google, Groq, etc.)
- Content extraction from URLs (web scraping, YouTube transcripts)
- Podcast generation (LLM and TTS provider calls)

**Format:** `http://[user:pass@]host:port` or `https://[user:pass@]host:port`

**Examples:**
```bash
# Basic proxy
HTTP_PROXY=http://proxy.corp.com:8080
HTTPS_PROXY=http://proxy.corp.com:8080

# Authenticated proxy
HTTP_PROXY=http://user:password@proxy.corp.com:8080
HTTPS_PROXY=http://user:password@proxy.corp.com:8080

# Bypass proxy for local hosts
NO_PROXY=localhost,127.0.0.1,.local
```

---

## Debugging & Monitoring

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `LANGCHAIN_TRACING_V2` | No | false | Enable LangSmith tracing |
| `LANGCHAIN_ENDPOINT` | No | https://api.smith.langchain.com | LangSmith endpoint |
| `LANGCHAIN_API_KEY` | No | None | LangSmith API key |
| `LANGCHAIN_PROJECT` | No | Construction OS | LangSmith project name |

**Setup:** https://smith.langchain.com/

---

## Environment Variables by Use Case

### Minimal Setup (New Installation)
```
CONSTRUCTION_OS_ENCRYPTION_KEY=my-secret-key
SURREAL_URL=ws://surrealdb:8000/rpc
SURREAL_USER=root
SURREAL_PASSWORD=password
SURREAL_NAMESPACE=construction_os
SURREAL_DATABASE=construction_os
```
Then configure AI providers via **Settings → API Keys** in the browser.

### Production Deployment
```
CONSTRUCTION_OS_ENCRYPTION_KEY=your-strong-secret-key
CONSTRUCTION_OS_PASSWORD=your-secure-password
API_URL=https://myproject.example.com
SURREAL_USER=production_user
SURREAL_PASSWORD=secure_password
```

### Self-Hosted Behind Reverse Proxy
```
CONSTRUCTION_OS_ENCRYPTION_KEY=your-secret-key
API_URL=https://myproject.example.com
```

### Corporate Environment (Behind Proxy)
```
CONSTRUCTION_OS_ENCRYPTION_KEY=your-secret-key
HTTP_PROXY=http://proxy.corp.com:8080
HTTPS_PROXY=http://proxy.corp.com:8080
NO_PROXY=localhost,127.0.0.1
```

### High-Performance Deployment
```
CONSTRUCTION_OS_ENCRYPTION_KEY=your-secret-key
SURREAL_COMMANDS_MAX_TASKS=10
TTS_BATCH_SIZE=5
API_CLIENT_TIMEOUT=600
```

### Debugging
```
CONSTRUCTION_OS_ENCRYPTION_KEY=your-secret-key
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-key
```

---

## Validation

Check if a variable is set:

```bash
# Check single variable
echo $CONSTRUCTION_OS_ENCRYPTION_KEY

# Check multiple
env | grep -E "construction_os|API_URL"

# Print all config
env | grep -E "^[A-Z_]+=" | sort
```

---

## Notes

- **Case-sensitive:** `CONSTRUCTION_OS_ENCRYPTION_KEY` ≠ `construction_os_encryption_key`
- **No spaces:** `CONSTRUCTION_OS_ENCRYPTION_KEY=my-key` not `CONSTRUCTION_OS_ENCRYPTION_KEY = my-key`
- **Quote values:** Use quotes for values with spaces: `API_URL="http://my server:5055"`
- **Restart required:** Changes take effect after restarting services
- **Secrets:** Don't commit encryption keys or passwords to git
- **AI Providers:** Configure via **Settings → API Keys** in the browser (not via env vars)
- **Migration:** Use Settings UI to migrate existing env vars to the credential system. See [API Configuration](../3-USER-GUIDE/api-configuration.md#migrating-from-environment-variables)

---

## Quick Setup Checklist

- [ ] Set `CONSTRUCTION_OS_ENCRYPTION_KEY` in docker-compose.yml
- [ ] Set database credentials (`SURREAL_*`)
- [ ] Start services
- [ ] Open browser → Go to **Settings → API Keys**
- [ ] **Add Credential** for your AI provider
- [ ] **Test Connection** to verify
- [ ] **Discover & Register Models**
- [ ] Set `API_URL` if behind reverse proxy
- [ ] Change `SURREAL_PASSWORD` in production
- [ ] Try a test chat

Done!

---

## Legacy: AI Provider Environment Variables (Deprecated)

> **Deprecated**: The following AI provider API key environment variables are deprecated. Configure providers via the Settings UI instead. These variables may still work as a fallback but are no longer recommended.

If you have these variables configured from a previous installation, click the **Migrate to Database** button in **Settings → API Keys** to import them into the credential system, then remove them from your configuration.

| Variable | Provider | Replacement |
|----------|----------|-------------|
| `OPENAI_API_KEY` | OpenAI | Settings → API Keys → Add OpenAI Credential |
| `ANTHROPIC_API_KEY` | Anthropic | Settings → API Keys → Add Anthropic Credential |
| `GOOGLE_API_KEY` | Google Gemini | Settings → API Keys → Add Google Credential |
| `GEMINI_API_BASE_URL` | Google Gemini | Configure in Google Gemini credential |
| `VERTEX_PROJECT` | Vertex AI | Settings → API Keys → Add Vertex AI Credential |
| `VERTEX_LOCATION` | Vertex AI | Configure in Vertex AI credential |
| `GOOGLE_APPLICATION_CREDENTIALS` | Vertex AI | Configure in Vertex AI credential |
| `GROQ_API_KEY` | Groq | Settings → API Keys → Add Groq Credential |
| `MISTRAL_API_KEY` | Mistral | Settings → API Keys → Add Mistral Credential |
| `DEEPSEEK_API_KEY` | DeepSeek | Settings → API Keys → Add DeepSeek Credential |
| `XAI_API_KEY` | xAI | Settings → API Keys → Add xAI Credential |
| `OLLAMA_API_BASE` | Ollama | Settings → API Keys → Add Ollama Credential |
| `OPENROUTER_API_KEY` | OpenRouter | Settings → API Keys → Add OpenRouter Credential |
| `OPENROUTER_BASE_URL` | OpenRouter | Configure in OpenRouter credential |
| `VOYAGE_API_KEY` | Voyage AI | Settings → API Keys → Add Voyage AI Credential |
| `ELEVENLABS_API_KEY` | ElevenLabs | Settings → API Keys → Add ElevenLabs Credential |
| `OPENAI_COMPATIBLE_BASE_URL` | OpenAI-Compatible | Settings → API Keys → Add OpenAI-Compatible Credential |
| `OPENAI_COMPATIBLE_API_KEY` | OpenAI-Compatible | Configure in OpenAI-Compatible credential |
| `OPENAI_COMPATIBLE_BASE_URL_LLM` | OpenAI-Compatible | Configure per-service URL in credential |
| `OPENAI_COMPATIBLE_API_KEY_LLM` | OpenAI-Compatible | Configure per-service key in credential |
| `OPENAI_COMPATIBLE_BASE_URL_EMBEDDING` | OpenAI-Compatible | Configure per-service URL in credential |
| `OPENAI_COMPATIBLE_API_KEY_EMBEDDING` | OpenAI-Compatible | Configure per-service key in credential |
| `OPENAI_COMPATIBLE_BASE_URL_STT` | OpenAI-Compatible | Configure per-service URL in credential |
| `OPENAI_COMPATIBLE_API_KEY_STT` | OpenAI-Compatible | Configure per-service key in credential |
| `OPENAI_COMPATIBLE_BASE_URL_TTS` | OpenAI-Compatible | Configure per-service URL in credential |
| `OPENAI_COMPATIBLE_API_KEY_TTS` | OpenAI-Compatible | Configure per-service key in credential |
| `DASHSCOPE_API_KEY` | DashScope (Qwen) | Settings → API Keys → Add DashScope Credential |
| `MINIMAX_API_KEY` | MiniMax | Settings → API Keys → Add MiniMax Credential |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI | Settings → API Keys → Add Azure OpenAI Credential |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI | Configure in Azure OpenAI credential |
| `AZURE_OPENAI_API_VERSION` | Azure OpenAI | Configure in Azure OpenAI credential |
| `AZURE_OPENAI_API_KEY_LLM` | Azure OpenAI | Configure per-service in credential |
| `AZURE_OPENAI_ENDPOINT_LLM` | Azure OpenAI | Configure per-service in credential |
| `AZURE_OPENAI_API_VERSION_LLM` | Azure OpenAI | Configure per-service in credential |
| `AZURE_OPENAI_API_KEY_EMBEDDING` | Azure OpenAI | Configure per-service in credential |
| `AZURE_OPENAI_ENDPOINT_EMBEDDING` | Azure OpenAI | Configure per-service in credential |
| `AZURE_OPENAI_API_VERSION_EMBEDDING` | Azure OpenAI | Configure per-service in credential |
