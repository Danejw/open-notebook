"""RAG-012: chunk provenance offsets and best-effort page derivation."""

from __future__ import annotations

from construction_os.utils.chunking import (
    ContentType,
    attach_chunk_provenance,
    chunk_text,
)


def test_attach_chunk_provenance_cursor_with_overlap() -> None:
    text = "AAAA BBBB CCCC"
    # Overlapping-style chunks that appear in order
    chunks = attach_chunk_provenance(text, ["AAAA BBBB", "BBBB CCCC"])
    assert len(chunks) == 2
    assert chunks[0].char_start == 0
    assert text[chunks[0].char_start : chunks[0].char_end] == "AAAA BBBB"
    assert chunks[1].char_start == text.find("BBBB CCCC")
    assert text[chunks[1].char_start : chunks[1].char_end] == "BBBB CCCC"
    assert chunks[0].page is None


def test_page_from_form_feed() -> None:
    text = "page one content\fpage two has the clause\fand page three"
    chunks = attach_chunk_provenance(
        text, ["page one content", "page two has the clause", "and page three"]
    )
    assert chunks[0].page == 1
    assert chunks[1].page == 2
    assert chunks[2].page == 3


def test_chunk_text_short_doc_offsets() -> None:
    text = "Warranty period is two years."
    chunks = chunk_text(text, content_type=ContentType.PLAIN)
    assert len(chunks) == 1
    assert chunks[0].char_start == 0
    assert chunks[0].char_end == len(text)
    assert chunks[0].content == text
