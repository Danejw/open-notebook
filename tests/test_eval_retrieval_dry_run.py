"""Tests for RAG retrieval eval dry-run gate (RAG-004 / RAG-010)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.eval_retrieval import (
    CORPUS_PATH,
    DEFAULT_MIN_RECALL,
    EVAL_PATH,
    EVAL_PROJECT_ID,
    EVAL_SOURCE_ID_PREFIX,
    EvalDatasetError,
    EvalRecallThresholdError,
    assert_dataset_ids_in_corpus,
    assert_recall_meets_threshold,
    load_eval_corpus,
    load_eval_dataset,
    parse_min_recall,
    summarize_dataset,
    validate_eval_corpus,
    validate_eval_dataset,
)


def test_validate_eval_dataset_accepts_baseline_file() -> None:
    dataset = load_eval_dataset(EVAL_PATH)
    validate_eval_dataset(dataset)
    summary = summarize_dataset(dataset)
    assert summary["total"] == len(dataset)
    assert summary["total"] > 0
    assert "semantic" in summary["by_class"]
    assert "identifier" in summary["by_class"]


def test_baseline_uses_seeded_fixture_ids_only() -> None:
    dataset = load_eval_dataset(EVAL_PATH)
    validate_eval_dataset(dataset)
    for item in dataset:
        assert item["project_id"] == EVAL_PROJECT_ID
        for eid in item["expected_source_ids"]:
            assert eid.startswith(EVAL_SOURCE_ID_PREFIX)


def test_corpus_and_baseline_are_consistent() -> None:
    corpus = load_eval_corpus(CORPUS_PATH)
    validate_eval_corpus(corpus)
    dataset = load_eval_dataset(EVAL_PATH)
    assert_dataset_ids_in_corpus(dataset, corpus)


def test_validate_eval_dataset_rejects_placeholder_project() -> None:
    with pytest.raises(EvalDatasetError, match="project_id must be"):
        validate_eval_dataset(
            [
                {
                    "id": "bad",
                    "question": "What is warranty?",
                    "query_class": "semantic",
                    "project_id": "project:eval-sample",
                    "expected_source_ids": [f"{EVAL_SOURCE_ID_PREFIX}warranty"],
                }
            ]
        )


def test_validate_eval_dataset_rejects_placeholder_source_ids() -> None:
    with pytest.raises(EvalDatasetError, match="must start with"):
        validate_eval_dataset(
            [
                {
                    "id": "bad",
                    "question": "What is warranty?",
                    "query_class": "semantic",
                    "project_id": EVAL_PROJECT_ID,
                    "expected_source_ids": ["source:warranty-doc"],
                }
            ]
        )


def test_validate_eval_dataset_rejects_missing_fields() -> None:
    with pytest.raises(EvalDatasetError, match="missing required field"):
        validate_eval_dataset(
            [{"id": "bad", "question": "x", "query_class": "semantic"}]
        )


def test_validate_eval_dataset_rejects_empty_expected_ids() -> None:
    with pytest.raises(EvalDatasetError, match="expected_source_ids"):
        validate_eval_dataset(
            [
                {
                    "id": "bad",
                    "question": "What is warranty?",
                    "query_class": "semantic",
                    "project_id": EVAL_PROJECT_ID,
                    "expected_source_ids": [],
                }
            ]
        )


def test_assert_dataset_ids_in_corpus_rejects_unknown() -> None:
    with pytest.raises(EvalDatasetError, match="not in the eval corpus"):
        assert_dataset_ids_in_corpus(
            [
                {
                    "id": "q1",
                    "expected_source_ids": [f"{EVAL_SOURCE_ID_PREFIX}missing"],
                }
            ],
            [{"id": f"{EVAL_SOURCE_ID_PREFIX}warranty", "title": "W", "full_text": "t"}],
        )


def test_load_eval_dataset_rejects_non_list(tmp_path: Path) -> None:
    path = tmp_path / "bad.json"
    path.write_text(json.dumps({"not": "a list"}), encoding="utf-8")
    with pytest.raises(EvalDatasetError, match="JSON array"):
        load_eval_dataset(path)


def test_parse_min_recall_defaults_to_point_nine() -> None:
    assert parse_min_recall("") == DEFAULT_MIN_RECALL
    assert parse_min_recall(None) == DEFAULT_MIN_RECALL
    assert parse_min_recall("0.85") == 0.85


def test_parse_min_recall_rejects_out_of_range() -> None:
    with pytest.raises(EvalDatasetError, match=r"\[0, 1\]"):
        parse_min_recall("1.5")


def test_assert_recall_meets_threshold_passes_at_floor() -> None:
    assert_recall_meets_threshold(
        {"vector": 0.9, "hybrid": 1.0},
        min_recall=0.9,
    )


def test_assert_recall_meets_threshold_fails_below_floor() -> None:
    with pytest.raises(EvalRecallThresholdError, match="vector ALL=0.800"):
        assert_recall_meets_threshold(
            {"vector": 0.8, "hybrid": 1.0},
            min_recall=0.9,
        )
