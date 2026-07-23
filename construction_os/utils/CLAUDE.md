# Utils Module

Utility functions and helpers for text processing, chunking, embedding, tokenization, encryption, and context-mode helpers.

## Purpose

Provides cross-cutting concerns: content-type aware text chunking, unified embedding generation with mean pooling, token counting, context-mode inclusion helpers, and version management. Chat relevance context is assembled in `graphs/chat_context.py`.

## Architecture Overview

**Core utilities**:
1. **context_mode.py**: Source/note inclusion helpers used by chat context assembly
2. **chunking.py**: Content-type detection and smart text chunking for embedding operations
3. **embedding.py**: Unified embedding generation with mean pooling for large content
4. **text_utils.py**: Text cleaning and thinking content extraction
5. **token_utils.py**: Token counting for LLM context windows (wrapper around encoding library)
6. **version_utils.py**: Version parsing, comparison, and schema compatibility checks

Chat relevance context is built in `construction_os.graphs.chat_context` (`build_relevance_context`), not in this package.

Each utility is stateless and can be imported independently.

## Configuration

### Chunking Configuration (chunking.py)

The chunking behavior can be configured via environment variables:

- **construction_os_CHUNK_SIZE**: Maximum chunk size in tokens (default: 400)
  - Minimum: 100 tokens
  - Warnings: Values > 8192 tokens or invalid values
  - Use case: Conservative baseline that leaves headroom below 512-token embedders (e.g. mxbai-embed-large). Buffer accounts for tokenizer mismatch between our `o200k_base` measurement and the embedder's own tokenizer, plus occasional splitter overshoot and special tokens.

- **construction_os_CHUNK_OVERLAP**: Overlap between chunks in tokens (default: 15% of CHUNK_SIZE)
  - Must be: >= 0 and < CHUNK_SIZE
  - Warnings: Invalid values or values >= CHUNK_SIZE
  - Use case: Control how much context is shared between adjacent chunks

Example for embedders with larger context windows (e.g. OpenAI text-embedding-3 family, 8191 tokens):
```bash
export construction_os_CHUNK_SIZE=1500
export construction_os_CHUNK_OVERLAP=150
```

Note: Changes require restart of the application.

## Component Catalog

### context_mode.py
- **is_source_included(mode)**: Whether a source context mode should be included
- **is_note_included(mode)**: Whether a note/artifact context mode should be included

Used by `construction_os.graphs.chat_context` when filtering selected context.

### chunking.py
- **ContentType**: Enum (HTML, MARKDOWN, PLAIN)
- **CHUNK_SIZE**: Configurable via `construction_os_CHUNK_SIZE` env var (default: 400)
- **CHUNK_OVERLAP**: Configurable via `construction_os_CHUNK_OVERLAP` env var (default: 15% of CHUNK_SIZE)
- **detect_content_type_from_extension(file_path)**: Detect type from file extension
- **detect_content_type_from_heuristics(text)**: Detect type from content patterns (returns type + confidence)
- **detect_content_type(text, file_path)**: Combined detection (extension primary, heuristics fallback)
- **chunk_text(text, content_type, file_path)**: Split text using appropriate splitter

**Key behavior**:
- Uses LangChain splitters: HTMLHeaderTextSplitter, MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
- Extension-based detection is primary; heuristics can override PLAIN extensions with 0.8+ confidence
- Secondary chunking applied when HTML/Markdown splitters produce oversized chunks
- Returns list of strings, each approximately ≤ CHUNK_SIZE tokens

### embedding.py
- **mean_pool_embeddings(embeddings)**: Combine multiple embeddings via normalized mean pooling
- **generate_embeddings(texts)**: Batch embedding with automatic batching (default 50 texts per batch) and per-batch retry
- **generate_embedding(text, content_type, file_path)**: Unified embedding with automatic chunking + mean pooling

**Key behavior**:
- Uses model_manager.get_model("embedding") for embedding model
- Short text (≤ CHUNK_SIZE tokens): direct embedding
- Long text: chunk → embed each → mean pool results
- Mean pooling: normalize each → mean → normalize result (using numpy)
- Raises ValueError for empty/whitespace-only text

### text_utils.py
- **remove_non_ascii(text)**: Remove non-ASCII characters from text
- **remove_non_printable(text)**: Remove non-printable characters, preserving newlines/tabs
- **parse_thinking_content(content)**: Extract `<think>` tags content from AI responses
- **clean_thinking_content(content)**: Remove `<think>` blocks, return cleaned content only

**Key behavior**:
- parse_thinking_content handles malformed output (missing opening `<think>` tag)
- Large content (>100KB) bypasses thinking extraction for performance
- Non-string input returns empty thinking and stringified content

### token_utils.py
- **token_count(text)**: Returns estimated token count for string (via tiktoken)
- **token_cost(text, model)**: Calculate cost estimate for text with given model

**Key behavior**: Uses `o200k_base` encoding; may differ slightly from actual model tokenization. If `tiktoken` is unavailable, `token_count()` falls back to a coarse estimate; this refactor keeps that existing contract.

### version_utils.py
- **compare_versions(v1, v2)**: Returns -1 (v1 < v2), 0 (equal), 1 (v1 > v2)
- **get_installed_version(package)**: Get version of installed Python package
- **get_version_from_github(url)**: Fetch latest version from GitHub releases

**Key behavior**: Uses packaging library for version parsing; supports pre-release tags

## Common Patterns

- **Content-type aware processing**: Chunking uses appropriate splitter based on detected content type
- **Mean pooling for large content**: Embedding handles arbitrarily large text via chunking + pooling
- **Error handling resilience**: token_count() returns estimate on failure
- **Pure text functions**: text_utils functions are stateless utilities (no class needed)
- **Type hints throughout**: All functions use Optional, List, Dict for clarity

## Key Dependencies

- `construction_os.ai.models`: model_manager for embedding model access
- `langchain_text_splitters`: HTMLHeaderTextSplitter, MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
- `numpy`: Mean pooling calculations
- `tiktoken`: Token encoding for GPT models
- `loguru`: Logging throughout

## Important Quirks & Gotchas

- **Token count estimation**: Uses `o200k_base` encoding; may differ slightly from actual model tokens. `estimate_wordpiece_tokens()` provides a conservative BERT-family ceiling (1.3× inflation + heuristic), and `chunk_text` re-splits any chunk over `EMBEDDER_MAX_INPUT_TOKENS` (512).
- **Chunk size semantics changed**: `construction_os_CHUNK_SIZE` and `construction_os_CHUNK_OVERLAP` are token-based, not character-based
- **Default chunk size**: The token-based default is 400 — leaves headroom below the 512-token ceiling of BERT-family embedders; WordPiece budget enforcement (RAG-007) is the hard gate when o200k under-counts
- **Content type detection order**: Extension checked first, then heuristics; high-confidence heuristics (≥0.8) can override PLAIN extensions
- **Mean pooling normalization**: Each embedding normalized before mean, result normalized after
- **No caching**: Embedding/chunk helpers are pure; callers own any cache layer

## How to Extend

1. **Add content type**: Add to ContentType enum; create splitter getter; update chunk_text()
2. **Change chunk size**: Set construction_os_CHUNK_SIZE and construction_os_CHUNK_OVERLAP environment variables
3. **Add text preprocessing**: Add new function to text_utils (e.g., remove_urls, extract_keywords)
4. **Change tokenization**: Replace tiktoken with alternative library in token_utils; update all calls
5. **Chat context selection**: Extend `graphs/chat_context.py` / retrieval — not a utils ContextBuilder

## Usage Examples

### Chunking
```python
from construction_os.utils.chunking import chunk_text, detect_content_type, ContentType

# Auto-detect content type and chunk
chunks = chunk_text(long_text, file_path="document.md")

# Explicit content type
chunks = chunk_text(html_content, content_type=ContentType.HTML)
```

### Embedding
```python
from construction_os.utils.embedding import generate_embedding, generate_embeddings

# Single text (handles chunking + mean pooling automatically)
embedding = await generate_embedding(long_text)

# Batch embedding (more efficient for multiple texts)
embeddings = await generate_embeddings(["text1", "text2", "text3"])
```

### Chat context
```python
from construction_os.graphs.chat_context import build_relevance_context

context = await build_relevance_context(
    project_id="project:123",
    question="What are the bid deadlines?",
    # ... selections and limits as used by graphs/chat.py
)
```

### encryption.py
- **get_secret_from_env(var_name)**: Retrieve secret from environment with Docker secrets support (checks VAR_FILE first, then VAR)
- **get_fernet()**: Get Fernet instance if encryption key is configured
- **encrypt_value(value)**: Encrypt a string using Fernet symmetric encryption
- **decrypt_value(value)**: Decrypt a Fernet-encrypted string; gracefully falls back to original value for legacy/unencrypted data
**Purpose**: Provides field-level encryption for sensitive data (API keys) stored in the database. Uses Fernet symmetric encryption (AES-128-CBC with HMAC-SHA256) for authenticated encryption.

**Key behavior**:
- Key source: construction_os_ENCRYPTION_KEY_FILE (Docker secrets) → construction_os_ENCRYPTION_KEY (env var)
- Accepts **any string**: always derived to a Fernet key via SHA-256
- No default key — encryption is unavailable until the env var is set
- Graceful fallback on decryption: InvalidToken errors (legacy unencrypted data) return the original value
- Lazy-loaded key: initialized on first use, not at import time

**Security considerations**:
- construction_os_ENCRYPTION_KEY must be set explicitly (no default)
- Docker secrets pattern supported for secure key injection in containerized environments
- Key rotation would require re-encrypting all stored keys (not currently implemented)
- Encryption is transparent to callers; unencrypted legacy data continues to work

**Usage Example**:
```python
from construction_os.utils.encryption import encrypt_value, decrypt_value

# Encrypt before storing in database
encrypted_api_key = encrypt_value(api_key)

# Decrypt when reading from database
decrypted_api_key = decrypt_value(encrypted_api_key)

# Set any string as encryption key:
# construction_os_ENCRYPTION_KEY=my-secret-passphrase
```
