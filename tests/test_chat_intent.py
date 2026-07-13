"""Tests for project-chat intent gating."""

from construction_os.graphs.chat_intent import (
    latest_user_message,
    needs_project_context,
)


def test_greetings_skip_context():
    for msg in ("HI", "hi", "Hello!", "hey there", "thanks", "thank you", "ok"):
        assert needs_project_context(msg) is False, msg


def test_project_questions_need_context():
    assert needs_project_context(
        "what does the contract say about retainage?"
    ) is True
    assert needs_project_context("Summarize the drawing notes") is True
    assert needs_project_context("How is RFI-12 answered?") is True


def test_long_message_needs_context():
    long = "Please walk me through the sequencing for the facade work on level 3."
    assert needs_project_context(long) is True


def test_follow_up_after_project_question():
    history = [
        {"role": "user", "content": "What does the contract say about retainage?"},
        {"role": "assistant", "content": "Retainage is 10% per section 9."},
    ]
    assert needs_project_context("tell me more", history) is True


def test_casual_after_project_question_still_casual():
    history = [
        {"role": "user", "content": "What does the contract say about retainage?"},
        {"role": "assistant", "content": "Retainage is 10%."},
    ]
    assert needs_project_context("thanks", history) is False


def test_latest_user_message():
    messages = [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "ok"},
        {"role": "user", "content": "second"},
    ]
    assert latest_user_message(messages) == "second"
