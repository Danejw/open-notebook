"""Prompt smoke tests for HTML template injection in chat system prompts."""

from ai_prompter import Prompter


SAMPLE_HTML = """<!DOCTYPE html><html><body>
<p>Trade: <span id="trade">Carpentry</span></p>
</body></html>"""


def test_chat_system_prompt_includes_html_template_section():
    rendered = Prompter(prompt_template="chat/system").render(
        data={
            "html_template": {
                "id": "html_template:t1",
                "name": "KCDBC Bid",
                "category": "estimate",
                "html_body": SAMPLE_HTML,
            }
        }
    )
    assert "HTML BID TEMPLATE" in rendered
    assert "PRIMARY MODE" in rendered
    assert "KCDBC Bid" in rendered
    assert "estimate" in rendered
    assert SAMPLE_HTML in rendered
    assert "```html" in rendered
    assert "Do **not** answer as a normal chat message" in rendered
    assert "PDF multi-page" in rendered
    assert "break-inside" in rendered
    assert "@page" in rendered
    assert "Preserve every `<img>`" in rendered
    assert "/api/media/" in rendered


def test_chat_system_prompt_omits_html_template_when_absent():
    rendered = Prompter(prompt_template="chat/system").render(data={})
    assert "HTML BID TEMPLATE" not in rendered
