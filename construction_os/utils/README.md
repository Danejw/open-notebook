# Utils

Shared helpers for Construction OS: chunking, embeddings, text/token utilities, encryption, and context-mode helpers.

## Chat / LLM context (canonical path)

Project chat and retrieval assemble relevance context via:

```python
from construction_os.graphs.chat_context import build_relevance_context
from construction_os.utils.context_mode import is_note_included, is_source_included
```

Do not reintroduce a parallel context builder under `utils/`. Token budgeting and ranking live in `graphs/chat_context.py` and the retrieval stack.

## Common imports

```python
from construction_os.utils import token_count, compare_versions
from construction_os.utils.chunking import chunk_text, detect_content_type, ContentType
from construction_os.utils.embedding import generate_embedding, generate_embeddings
from construction_os.utils.encryption import encrypt_value, decrypt_value
```

See `CLAUDE.md` in this directory for module details.
