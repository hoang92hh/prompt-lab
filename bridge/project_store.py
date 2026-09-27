"""Persist confirmed provider projects and their step scope."""
import json
import os
import re
from pathlib import Path
from threading import Lock

from .protocol import fail


class ProjectStore:
    def __init__(self, path: Path | None = None):
        self.path = path or Path(__file__).parent.parent / "config" / "projects.json"
        self.lock = Lock()

    @staticmethod
    def _normalize(project: dict) -> dict:
        if not isinstance(project, dict):
            raise ValueError("Invalid project record")
        required = ("id", "name", "url")
        if any(not isinstance(project.get(key), str) or not project[key].strip()
               for key in required):
            raise ValueError("Invalid project record")
        provider = project.get("provider", "chatgpt")
        step_id = project.get("step_id", "*")
        if not isinstance(provider, str) or provider not in {"chatgpt", "claude"}:
            raise ValueError("Invalid project provider")
        if step_id != "*" and not (isinstance(step_id, str)
                                    and re.fullmatch(r"step[1-9][0-9]*", step_id)):
            raise ValueError("Invalid project step")
        return {
            "id": project["id"].strip(),
            "name": project["name"].strip(),
            "url": project["url"].strip(),
            "provider": provider,
            "step_id": step_id,
        }

    def _read(self) -> list[dict]:
        if not self.path.exists():
            return []
        value = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(value, list):
            raise ValueError("Invalid projects JSON")
        return [self._normalize(project) for project in value]

    def _write(self, items: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".json.tmp")
        temp.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temp, self.path)

    def list(self) -> list[dict]:
        with self.lock:
            return self._read()

    def save(self, project: dict, provider: str = "chatgpt", step_id: str = "*") -> None:
        with self.lock:
            item = self._normalize({**project, "provider": provider, "step_id": step_id})
            items = self._read()
            if any(existing["provider"] == item["provider"] and existing["id"] == item["id"]
                   for existing in items):
                return
            items.append(item)
            self._write(items)

    def get(self, project_id: str, provider: str = "chatgpt") -> dict:
        for project in self.list():
            if project["provider"] == provider and project["id"] == project_id:
                return project
        fail(404, "PROJECT_NOT_FOUND", "Project is not registered in MyTool.")

    def delete(self, provider: str, project_id: str) -> dict:
        with self.lock:
            items = self._read()
            for index, project in enumerate(items):
                if project["provider"] == provider and project["id"] == project_id:
                    deleted = items.pop(index)
                    self._write(items)
                    return deleted
        fail(404, "PROJECT_NOT_FOUND", "Project is not registered in MyTool.")
