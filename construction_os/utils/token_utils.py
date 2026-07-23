"""
Token utilities for Construction OS.
Handles token counting and cost calculations for language models.
"""

from __future__ import annotations

import os
import re

from construction_os.config import TIKTOKEN_CACHE_DIR

# Set tiktoken cache directory before importing tiktoken to ensure
# tokenizer encodings are cached persistently in the data folder
os.environ["TIKTOKEN_CACHE_DIR"] = TIKTOKEN_CACHE_DIR

# Common ceiling for BERT-family / local embedders (e.g. mxbai-embed-large).
EMBEDDER_MAX_INPUT_TOKENS = 512

# Special-token overhead typical when embedding models prepend [CLS]/[SEP].
_WORDPIECE_SPECIAL_TOKEN_OVERHEAD = 2

# WordPiece unknown/long tokens are split into ~4-char pieces.
_WORDPIECE_CHARS_PER_PIECE = 4

_WORDPIECE_TOKEN_RE = re.compile(r"\w+|[^\w\s]", re.UNICODE)


def token_count(input_string: str) -> int:
    """
    Count the number of tokens in the input string using the 'o200k_base' encoding.

    Args:
        input_string (str): The input string to count tokens for.

    Returns:
        int: The number of tokens in the input string.
    """
    try:
        import tiktoken

        encoding = tiktoken.get_encoding("o200k_base")
        # disallowed_special=() treats sequences like "<|endoftext|>" as ordinary
        # text instead of raising ValueError. User/source content can legitimately
        # contain these substrings, and we only need a token count here.
        tokens = encoding.encode(input_string, disallowed_special=())
        return len(tokens)
    except (ImportError, OSError) as e:
        # Fallback: handles ImportError (tiktoken not installed) AND network/OS
        # errors such as urllib.error.URLError or ConnectionError raised in
        # offline environments when the encoding file cannot be downloaded.
        from loguru import logger

        logger.warning(
            "tiktoken unavailable, falling back to word-count estimation: {}", e
        )
        return int(len(input_string.split()) * 1.3)


def estimate_wordpiece_tokens(text: str) -> int:
    """
    Conservative WordPiece-style token estimate for BERT-family embedders.

    Chunk sizing uses ``token_count`` (tiktoken ``o200k_base``), which can
    under-count relative to WordPiece on dense construction specs (CSI codes,
    ASTM refs, mixed punctuation). This estimator intentionally over-counts
    so we can keep chunks under common 512-token embedder limits without
    requiring a HuggingFace tokenizer dependency.
    """
    if not text:
        return 0

    heuristic = _WORDPIECE_SPECIAL_TOKEN_OVERHEAD
    for tok in _WORDPIECE_TOKEN_RE.findall(text):
        length = len(tok)
        if length <= _WORDPIECE_CHARS_PER_PIECE:
            heuristic += 1
        else:
            heuristic += (
                length + _WORDPIECE_CHARS_PER_PIECE - 1
            ) // _WORDPIECE_CHARS_PER_PIECE

    # Inflate o200k to cover tokenizer mismatch (~20–30% headroom documented
    # for BERT-family embedders vs GPT BPE). Take the max so either signal wins.
    o200k = token_count(text)
    inflated = int(o200k * 1.3) + _WORDPIECE_SPECIAL_TOKEN_OVERHEAD
    return max(heuristic, inflated)


def token_cost(token_count: int, cost_per_million: float = 0.150) -> float:
    """
    Calculate the cost of tokens based on the token count and cost per million tokens.

    Args:
        token_count (int): The number of tokens.
        cost_per_million (float): The cost per million tokens. Default is 0.150.

    Returns:
        float: The calculated cost for the given token count.
    """
    return cost_per_million * (token_count / 1_000_000)
