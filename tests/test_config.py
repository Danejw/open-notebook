import importlib
from pathlib import Path

import construction_os.config as config


def test_langgraph_checkpoint_file_honors_environment(
    monkeypatch, tmp_path: Path
) -> None:
    """The API and worker can share an explicitly configured checkpoint file."""
    checkpoint_file = tmp_path / "nested" / "queue-checkpoints.sqlite"
    monkeypatch.setenv("LANGGRAPH_CHECKPOINT_FILE", str(checkpoint_file))

    reloaded = importlib.reload(config)

    assert reloaded.LANGGRAPH_CHECKPOINT_FILE == str(checkpoint_file)
    assert checkpoint_file.parent.is_dir()

    monkeypatch.delenv("LANGGRAPH_CHECKPOINT_FILE")
    importlib.reload(config)
