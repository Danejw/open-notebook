"""
Chunking utilities for Construction OS.

Provides content-type detection and smart text chunking for embedding operations.
Supports HTML, Markdown, and plain text with appropriate splitters for each type.

Key functions:
- detect_content_type(): Detects content type from file extension or content heuristics
- chunk_text(): Splits text into TextChunk values with char offsets / best-effort page

Environment Variables:
    CONSTRUCTION_OS_CHUNK_SIZE: Maximum chunk size in tokens (default: 400)
    CONSTRUCTION_OS_CHUNK_OVERLAP: Overlap between chunks in tokens (default: 15% of CHUNK_SIZE)
    CONSTRUCTION_OS_MIN_CHUNK_SIZE: Minimum chunk size in tokens (default: 5)
    Legacy fallback: OPEN_NOTEBOOK_CHUNK_SIZE, OPEN_NOTEBOOK_CHUNK_OVERLAP, OPEN_NOTEBOOK_MIN_CHUNK_SIZE
"""

import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from langchain_text_splitters import (
    HTMLHeaderTextSplitter,
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)
from loguru import logger

from .env import get_env
from .token_utils import EMBEDDER_MAX_INPUT_TOKENS, estimate_wordpiece_tokens, token_count


@dataclass(frozen=True)
class TextChunk:
    """A chunk of source text with optional provenance for citation deep-links."""

    content: str
    char_start: int
    char_end: int
    page: Optional[int] = None

    def __str__(self) -> str:
        return self.content


def _get_chunk_size() -> int:
    """Get chunk size from environment variable or use default."""
    chunk_size_str = get_env("CONSTRUCTION_OS_CHUNK_SIZE")
    if chunk_size_str:
        try:
            chunk_size = int(chunk_size_str)
            if chunk_size < 100:
                logger.warning(
                    f"CONSTRUCTION_OS_CHUNK_SIZE ({chunk_size}) is too small. "
                    f"Using minimum value of 100."
                )
                return 100
            if chunk_size > 8192:
                logger.warning(
                    f"CONSTRUCTION_OS_CHUNK_SIZE ({chunk_size}) is very large. "
                    f"This may cause issues with some embedding models."
                )
            logger.info(f"Using custom chunk size: {chunk_size} tokens")
            return chunk_size
        except ValueError:
            logger.warning(
                f"Invalid CONSTRUCTION_OS_CHUNK_SIZE value: '{chunk_size_str}'. "
                f"Using default: 400"
            )
    return 400


def _get_chunk_overlap(chunk_size: int) -> int:
    """Get chunk overlap from environment variable or calculate default (15% of chunk size)."""
    overlap_str = get_env("CONSTRUCTION_OS_CHUNK_OVERLAP")
    if overlap_str:
        try:
            overlap = int(overlap_str)
            if overlap < 0:
                logger.warning(
                    f"CONSTRUCTION_OS_CHUNK_OVERLAP ({overlap}) cannot be negative. "
                    f"Using 0."
                )
                return 0
            if overlap >= chunk_size:
                logger.warning(
                    f"CONSTRUCTION_OS_CHUNK_OVERLAP ({overlap}) cannot be >= chunk size ({chunk_size}). "
                    f"Using 15% of chunk size: {int(chunk_size * 0.15)}"
                )
                return int(chunk_size * 0.15)
            logger.info(f"Using custom chunk overlap: {overlap} tokens")
            return overlap
        except ValueError:
            logger.warning(
                f"Invalid CONSTRUCTION_OS_CHUNK_OVERLAP value: '{overlap_str}'. "
                f"Using default: 15% of chunk size"
            )
    return int(chunk_size * 0.15)


def _get_min_chunk_size() -> int:
    """Get minimum chunk size from environment variable or use default.

    Chunks below this token count are dropped. Some splitters (notably the
    HTML header splitter on complex pages) can emit single-character or
    punctuation-only chunks that produce useless or null embeddings —
    llama.cpp's OpenAI-compatible endpoint, for example, returns null vector
    elements for such inputs and crashes downstream parsing.
    """
    raw = get_env("CONSTRUCTION_OS_MIN_CHUNK_SIZE")
    if raw is None:
        return 5
    try:
        value = int(raw)
        if value < 0:
            logger.warning(
                f"CONSTRUCTION_OS_MIN_CHUNK_SIZE ({value}) cannot be negative. Using 0."
            )
            return 0
        return value
    except ValueError:
        logger.warning(
            f"Invalid CONSTRUCTION_OS_MIN_CHUNK_SIZE value: '{raw}'. Using default: 5"
        )
        return 5


# Constants (computed at import time from environment variables)
CHUNK_SIZE = _get_chunk_size()
CHUNK_OVERLAP = _get_chunk_overlap(CHUNK_SIZE)
MIN_CHUNK_SIZE = _get_min_chunk_size()
HIGH_CONFIDENCE_THRESHOLD = 0.8  # Threshold for heuristics to override extension

logger.debug(
    f"Chunking configuration: CHUNK_SIZE={CHUNK_SIZE}, "
    f"CHUNK_OVERLAP={CHUNK_OVERLAP}, MIN_CHUNK_SIZE={MIN_CHUNK_SIZE}"
)


class ContentType(Enum):
    """Content type for chunking strategy selection."""

    HTML = "html"
    MARKDOWN = "markdown"
    PLAIN = "plain"


# File extension mappings
_EXTENSION_TO_CONTENT_TYPE = {
    # HTML
    ".html": ContentType.HTML,
    ".htm": ContentType.HTML,
    ".xhtml": ContentType.HTML,
    # Markdown
    ".md": ContentType.MARKDOWN,
    ".markdown": ContentType.MARKDOWN,
    ".mdown": ContentType.MARKDOWN,
    ".mkd": ContentType.MARKDOWN,
    # Plain text (explicit)
    ".txt": ContentType.PLAIN,
    ".text": ContentType.PLAIN,
    # Code files (treat as plain)
    ".py": ContentType.PLAIN,
    ".js": ContentType.PLAIN,
    ".ts": ContentType.PLAIN,
    ".java": ContentType.PLAIN,
    ".c": ContentType.PLAIN,
    ".cpp": ContentType.PLAIN,
    ".go": ContentType.PLAIN,
    ".rs": ContentType.PLAIN,
    ".rb": ContentType.PLAIN,
    ".php": ContentType.PLAIN,
    ".sh": ContentType.PLAIN,
    ".bash": ContentType.PLAIN,
    ".zsh": ContentType.PLAIN,
    ".sql": ContentType.PLAIN,
    ".json": ContentType.PLAIN,
    ".yaml": ContentType.PLAIN,
    ".yml": ContentType.PLAIN,
    ".xml": ContentType.PLAIN,
    ".csv": ContentType.PLAIN,
    ".tsv": ContentType.PLAIN,
}


def detect_content_type_from_extension(
    file_path: Optional[str],
) -> Optional[ContentType]:
    """
    Detect content type from file extension.

    Args:
        file_path: Path to the file (can be full path or just filename)

    Returns:
        ContentType if extension is recognized, None otherwise
    """
    if not file_path:
        return None

    try:
        extension = Path(file_path).suffix.lower()
        return _EXTENSION_TO_CONTENT_TYPE.get(extension)
    except Exception:
        return None


def detect_content_type_from_heuristics(text: str) -> Tuple[ContentType, float]:
    """
    Detect content type using content heuristics.

    Args:
        text: The text content to analyze

    Returns:
        Tuple of (ContentType, confidence_score) where confidence is 0.0-1.0
    """
    if not text or len(text) < 10:
        return ContentType.PLAIN, 0.5

    # Sample first 5000 chars for efficiency
    sample = text[:5000]

    # Check HTML first (most specific patterns)
    html_score = _calculate_html_score(sample)
    if html_score >= HIGH_CONFIDENCE_THRESHOLD:
        return ContentType.HTML, html_score

    # Check Markdown
    markdown_score = _calculate_markdown_score(sample)
    if markdown_score >= HIGH_CONFIDENCE_THRESHOLD:
        return ContentType.MARKDOWN, markdown_score

    # Return the higher scoring type, or PLAIN if both are low
    if html_score > markdown_score and html_score > 0.3:
        return ContentType.HTML, html_score
    elif markdown_score > 0.3:
        return ContentType.MARKDOWN, markdown_score
    else:
        return ContentType.PLAIN, 0.6


def _calculate_html_score(text: str) -> float:
    """Calculate confidence score for HTML content."""
    score = 0.0
    indicators = 0

    # Strong indicators
    if re.search(r"<!DOCTYPE\s+html", text, re.IGNORECASE):
        score += 0.4
        indicators += 1

    if re.search(r"<html[\s>]", text, re.IGNORECASE):
        score += 0.3
        indicators += 1

    # Structural tags
    structural_tags = ["<head", "<body", "<div", "<span", "<p>", "<table", "<form"]
    for tag in structural_tags:
        if tag.lower() in text.lower():
            score += 0.1
            indicators += 1
            if indicators >= 5:
                break

    # Header tags
    if re.search(r"<h[1-6][\s>]", text, re.IGNORECASE):
        score += 0.15
        indicators += 1

    # Closing tags pattern
    if re.search(r"</\w+>", text):
        score += 0.1
        indicators += 1

    return min(score, 1.0)


def _calculate_markdown_score(text: str) -> float:
    """Calculate confidence score for Markdown content."""
    score = 0.0
    indicators = 0

    # Headers (# ## ###) - strong indicator
    header_matches = len(re.findall(r"^#{1,6}\s+.+", text, re.MULTILINE))
    if header_matches >= 3:
        score += 0.35
        indicators += 1
    elif header_matches >= 1:
        score += 0.2
        indicators += 1

    # Links [text](url) - strong indicator
    link_matches = len(re.findall(r"\[.+?\]\(.+?\)", text))
    if link_matches >= 2:
        score += 0.25
        indicators += 1
    elif link_matches >= 1:
        score += 0.15
        indicators += 1

    # Code blocks ``` - strong indicator
    if re.search(r"^```", text, re.MULTILINE):
        score += 0.2
        indicators += 1

    # Inline code `code`
    if re.search(r"`[^`]+`", text):
        score += 0.1
        indicators += 1

    # Lists (-, *, +, or numbered)
    list_matches = len(re.findall(r"^[\*\-\+]\s+", text, re.MULTILINE))
    list_matches += len(re.findall(r"^\d+\.\s+", text, re.MULTILINE))
    if list_matches >= 3:
        score += 0.15
        indicators += 1
    elif list_matches >= 1:
        score += 0.08
        indicators += 1

    # Bold/italic
    if re.search(r"\*\*.+?\*\*|__.+?__", text):
        score += 0.1
        indicators += 1

    # Blockquotes
    if re.search(r"^>\s+", text, re.MULTILINE):
        score += 0.1
        indicators += 1

    return min(score, 1.0)


def detect_content_type(text: str, file_path: Optional[str] = None) -> ContentType:
    """
    Detect content type using file extension (primary) and heuristics (fallback).

    Strategy:
    1. If file extension is available and recognized, use it as primary
    2. If no extension or generic extension (.txt), use heuristics
    3. Heuristics can override extension only with very high confidence

    Args:
        text: The text content
        file_path: Optional file path for extension-based detection

    Returns:
        Detected ContentType
    """
    # Try extension-based detection first
    extension_type = detect_content_type_from_extension(file_path)

    # Get heuristic-based detection
    heuristic_type, confidence = detect_content_type_from_heuristics(text)

    # If no extension or generic extension, use heuristics
    if extension_type is None:
        logger.debug(
            f"No file extension, using heuristics: {heuristic_type.value} "
            f"(confidence: {confidence:.2f})"
        )
        return heuristic_type

    # If extension suggests plain text but heuristics are very confident, override
    if extension_type == ContentType.PLAIN and confidence >= HIGH_CONFIDENCE_THRESHOLD:
        logger.debug(
            f"Extension suggests plain, but heuristics override with "
            f"{heuristic_type.value} (confidence: {confidence:.2f})"
        )
        return heuristic_type

    # Otherwise trust the extension
    logger.debug(f"Using extension-based content type: {extension_type.value}")
    return extension_type


def _get_html_splitter() -> HTMLHeaderTextSplitter:
    """Get HTML header splitter configured for h1, h2, h3."""
    headers_to_split_on = [
        ("h1", "Header 1"),
        ("h2", "Header 2"),
        ("h3", "Header 3"),
    ]
    return HTMLHeaderTextSplitter(headers_to_split_on=headers_to_split_on)


def _get_markdown_splitter() -> MarkdownHeaderTextSplitter:
    """Get Markdown header splitter configured for #, ##, ###."""
    headers_to_split_on = [
        ("#", "Header 1"),
        ("##", "Header 2"),
        ("###", "Header 3"),
    ]
    return MarkdownHeaderTextSplitter(
        headers_to_split_on=headers_to_split_on,
        strip_headers=False,
    )


def _get_plain_splitter() -> RecursiveCharacterTextSplitter:
    """Get plain text splitter using CHUNK_SIZE and CHUNK_OVERLAP constants."""
    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=token_count,
        separators=["\n\n", "\n", ". ", ", ", " ", ""],
    )


def _get_embedder_budget_splitter() -> RecursiveCharacterTextSplitter:
    """Splitter that sizes chunks with the WordPiece estimate (RAG-007)."""
    overlap = min(CHUNK_OVERLAP, max(0, EMBEDDER_MAX_INPUT_TOKENS // 10))
    return RecursiveCharacterTextSplitter(
        chunk_size=EMBEDDER_MAX_INPUT_TOKENS,
        chunk_overlap=overlap,
        length_function=estimate_wordpiece_tokens,
        separators=["\n\n", "\n", ". ", ", ", " ", ""],
    )


def _enforce_embedder_token_budget(chunks: List[str]) -> List[str]:
    """
    Re-split any chunk whose WordPiece estimate exceeds embedder max tokens.

    Primary chunking uses tiktoken ``o200k_base``. This pass closes the gap for
    BERT-family embedders (common 512-token ceiling).
    """
    if not chunks:
        return chunks

    result: List[str] = []
    budget_splitter: Optional[RecursiveCharacterTextSplitter] = None

    for chunk in chunks:
        if estimate_wordpiece_tokens(chunk) <= EMBEDDER_MAX_INPUT_TOKENS:
            result.append(chunk)
            continue
        if budget_splitter is None:
            budget_splitter = _get_embedder_budget_splitter()
        sub_chunks = budget_splitter.split_text(chunk)
        if not sub_chunks:
            result.append(chunk)
            continue
        result.extend(sub_chunks)
        logger.debug(
            "Re-split chunk exceeding embedder WordPiece budget "
            f"({estimate_wordpiece_tokens(chunk)} > {EMBEDDER_MAX_INPUT_TOKENS}) "
            f"into {len(sub_chunks)} piece(s)"
        )

    return result


def _apply_secondary_chunking(chunks: List[str]) -> List[str]:
    """
    Apply secondary chunking to ensure no chunk exceeds CHUNK_SIZE tokens.

    Used when primary splitters (HTML/Markdown) produce oversized chunks.
    """
    result = []
    secondary_splitter = _get_plain_splitter()

    for chunk in chunks:
        if token_count(chunk) > CHUNK_SIZE:
            # Split oversized chunk
            sub_chunks = secondary_splitter.split_text(chunk)
            result.extend(sub_chunks)
        else:
            result.append(chunk)

    return result


def _page_for_offset(text: str, char_start: int) -> Optional[int]:
    """Best-effort 1-based page from form-feed markers; None when absent."""
    if "\f" not in text:
        return None
    start = max(0, min(char_start, len(text)))
    return text[:start].count("\f") + 1


def attach_chunk_provenance(
    text: str, chunk_strings: Sequence[str]
) -> List[TextChunk]:
    """Locate each chunk string in ``text`` with a forward cursor (overlap-safe)."""
    if not chunk_strings:
        return []

    results: List[TextChunk] = []
    cursor = 0
    text_len = len(text)

    for raw in chunk_strings:
        content = raw.strip() if raw else ""
        if not content:
            continue

        idx = text.find(content, cursor)
        if idx < 0:
            # Strip may have changed whitespace vs original; try unstripped.
            idx = text.find(raw, cursor) if raw else -1
            if idx >= 0:
                content = raw
            else:
                # Last resort: search from start (may mis-order on duplicates).
                idx = text.find(content)
                if idx < 0:
                    idx = min(cursor, text_len)
                    end = min(idx + len(content), text_len)
                    results.append(
                        TextChunk(
                            content=content,
                            char_start=idx,
                            char_end=end,
                            page=_page_for_offset(text, idx),
                        )
                    )
                    cursor = end
                    continue

        end = idx + len(content)
        results.append(
            TextChunk(
                content=content,
                char_start=idx,
                char_end=end,
                page=_page_for_offset(text, idx),
            )
        )
        # Advance past overlap region but allow next find from near end.
        cursor = max(idx + 1, end - max(0, end - idx) // 4)

    return results


def chunk_text(
    text: str,
    content_type: Optional[ContentType] = None,
    file_path: Optional[str] = None,
) -> List[TextChunk]:
    """
    Split text into chunks using appropriate splitter for content type.

    Args:
        text: The text to chunk
        content_type: Optional explicit content type (auto-detected if not provided)
        file_path: Optional file path for content type detection

    Returns:
        List of TextChunk values with char offsets and best-effort page numbers
    """
    if not text or not text.strip():
        return []

    # Short text doesn't need primary chunking — still enforce embedder budget.
    text_tokens = token_count(text)
    if text_tokens <= CHUNK_SIZE:
        strings = _enforce_embedder_token_budget([text])
        return attach_chunk_provenance(text, strings)

    # Detect content type if not provided
    if content_type is None:
        content_type = detect_content_type(text, file_path)

    logger.debug(f"Chunking text with content type: {content_type.value}")

    # Select appropriate splitter
    if content_type == ContentType.HTML:
        splitter = _get_html_splitter()
        # HTML splitter returns Document objects
        docs = splitter.split_text(text)
        chunks = [
            doc.page_content if hasattr(doc, "page_content") else str(doc)
            for doc in docs
        ]
    elif content_type == ContentType.MARKDOWN:
        splitter = _get_markdown_splitter()
        # Markdown splitter returns Document objects
        docs = splitter.split_text(text)
        chunks = [
            doc.page_content if hasattr(doc, "page_content") else str(doc)
            for doc in docs
        ]
    else:
        # Plain text - use recursive splitter directly
        splitter = _get_plain_splitter()
        chunks = splitter.split_text(text)

    # Apply secondary chunking if needed (for HTML/Markdown that may produce large chunks)
    if content_type in (ContentType.HTML, ContentType.MARKDOWN):
        chunks = _apply_secondary_chunking(chunks)

    # Keep chunks under BERT-family embedder max (WordPiece estimate).
    chunks = _enforce_embedder_token_budget(chunks)

    # Filter out empty chunks
    chunks = [c.strip() for c in chunks if c and c.strip()]

    # Drop chunks below the minimum token threshold. These are typically
    # punctuation or single-character fragments left over from header-based
    # splitters; embedding them is wasteful and some providers return null
    # vector elements for such inputs (which then crash response parsing).
    # Only filter when more than one chunk exists and at least one chunk
    # would survive — never return an empty list because of this filter.
    if MIN_CHUNK_SIZE > 0 and len(chunks) > 1:
        kept = [c for c in chunks if token_count(c) >= MIN_CHUNK_SIZE]
        if kept:
            dropped = len(chunks) - len(kept)
            if dropped > 0:
                logger.debug(
                    f"Dropped {dropped} chunk(s) below MIN_CHUNK_SIZE={MIN_CHUNK_SIZE} tokens"
                )
            chunks = kept

    logger.debug(f"Created {len(chunks)} chunks from {text_tokens} tokens")
    return attach_chunk_provenance(text, chunks)
