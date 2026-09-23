"""Persist confirmed ChatGPT projects only."""
import json
import os
from pathlib import Path
from threading import Lock

from .protocol import fail


class ProjectStore:
    def __init__(self, path: Path | None = None):
        self.path = path or Path(__file__).parent.parent / "config" / "projects.json"
        self.lock = Lock()

    def list(self) -> list[dict]:
        with self.lock:
            if not self.path.exists():
                return []
            value = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(value, list):
                raise ValueError("Invalid projects JSON")
            return value

    def save(self, project: dict) -> None:
        with self.lock:
            items = []
            if self.path.exists():
                items = json.loads(self.path.read_text(encoding="utf-8"))
            if any(item["id"] == project["id"] for item in items):
                return
            items.append(project)
            temp = self.path.with_suffix(".json.tmp")
            temp.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(temp, self.path)

    def get(self, project_id: str) -> dict:
        for project in self.list():
            if project["id"] == project_id:
                return project
        fail(404, "PROJECT_NOT_FOUND", "Project is not registered in MyTool.")
