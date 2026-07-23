"""RAG-007: default chunks must stay under common embedder max tokens (WordPiece ~512)."""

from __future__ import annotations

from construction_os.utils.chunking import CHUNK_SIZE, ContentType, chunk_text
from construction_os.utils.token_utils import (
    EMBEDDER_MAX_INPUT_TOKENS,
    estimate_wordpiece_tokens,
    token_count,
)


def _construction_spec_blob(target_o200k_tokens: int) -> str:
    """Dense construction-spec prose; sized to at most ``target_o200k_tokens``."""
    fragment = (
        "CSI 07 54 23: TPO membrane shall be 60-mil, ASTM D6878, "
        "FM 1-90, UL Class A; fasteners #15 HD at 6\" o.c. perimeter / 12\" field; "
        "R-value ≥ R-30 continuous; ASTM C1289 Type II Class 1 Grade 2; "
        "submittals: SDS, LEED v4.1 MRc2, VOC < 50 g/L. "
    )
    text = ""
    while True:
        candidate = text + fragment
        if token_count(candidate) > target_o200k_tokens:
            return text or fragment
        text = candidate


def test_estimate_wordpiece_tokens_is_conservative_vs_o200k() -> None:
    text = _construction_spec_blob(350)
    assert estimate_wordpiece_tokens(text) >= token_count(text)


def test_default_chunk_size_leaves_headroom_below_embedder_max() -> None:
    assert CHUNK_SIZE < EMBEDDER_MAX_INPUT_TOKENS
    assert EMBEDDER_MAX_INPUT_TOKENS == 512


def test_chunk_text_stays_within_wordpiece_embedder_budget() -> None:
    """Acceptance: default chunking must not exceed 512 under WordPiece estimate."""
    text = _construction_spec_blob(CHUNK_SIZE * 3)
    chunks = chunk_text(text, content_type=ContentType.PLAIN)
    assert chunks
    for chunk in chunks:
        wp = estimate_wordpiece_tokens(chunk.content)
        assert wp <= EMBEDDER_MAX_INPUT_TOKENS, (
            f"chunk WordPiece estimate {wp} exceeds embedder max "
            f"{EMBEDDER_MAX_INPUT_TOKENS} (o200k={token_count(chunk.content)})"
        )


def test_markdown_chunks_stay_within_wordpiece_embedder_budget() -> None:
    body = _construction_spec_blob(CHUNK_SIZE * 2)
    md = f"# Spec Section\n\n{body}\n\n## Submittals\n\n{body}"
    chunks = chunk_text(md, content_type=ContentType.MARKDOWN)
    assert chunks
    for chunk in chunks:
        assert estimate_wordpiece_tokens(chunk.content) <= EMBEDDER_MAX_INPUT_TOKENS


def test_oversized_o200k_chunk_is_resplit_for_embedder_budget() -> None:
    """Near-CHUNK_SIZE o200k text can exceed WordPiece 512 after inflation; enforce splits."""
    text = _construction_spec_blob(CHUNK_SIZE)
    # Fill remaining o200k budget so 1.3× inflation clears the 512 ceiling.
    pad = " warranty submittal checklist "
    while token_count(text + pad) <= CHUNK_SIZE:
        text += pad
    assert token_count(text) <= CHUNK_SIZE
    assert estimate_wordpiece_tokens(text) > EMBEDDER_MAX_INPUT_TOKENS

    chunks = chunk_text(text, content_type=ContentType.PLAIN)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert estimate_wordpiece_tokens(chunk.content) <= EMBEDDER_MAX_INPUT_TOKENS
