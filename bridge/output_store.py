"""Persist user-selected step outputs as JSON files."""
import json
import re
from datetime import datetime
from pathlib import Path
from threading import Lock

from .protocol import fail


OUTPUT_ROOT = Path(__file__).parent.parent / "output"
STEP_PATTERN = re.compile(r"step[1-9][0-9]*")
INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


class OutputStore:
    def __init__(self, root: Path = OUTPUT_ROOT):
        self.root = root
        self._lock = Lock()

    def save(self, step: str, value) -> dict:
        if not STEP_PATTERN.fullmatch(step):
            fail(404, "NOT_FOUND", "Unknown output step.")
        if not isinstance(value, dict) or set(value) != {"name", "sections"}:
            fail(400, "INVALID_REQUEST", "Output requires name and sections.")
        name = value["name"]
        sections = value["sections"]
        if not isinstance(name, str) or len(name) > 100:
            fail(400, "INVALID_REQUEST", "Output name must be a string of at most 100 characters.")
        if not isinstance(sections, list) or not sections or len(sections) > 100:
            fail(400, "INVALID_REQUEST", "Output requires between 1 and 100 sections.")
        for section in sections:
            if (not isinstance(section, dict) or set(section) != {"title", "content"}
                    or not isinstance(section["title"], str)
                    or not section["title"].strip() or len(section["title"]) > 200
                    or not isinstance(section["content"], str)):
                fail(400, "INVALID_REQUEST", "Each section requires a title and string content.")
        if not any(section["content"].strip() for section in sections):
            fail(400, "INVALID_REQUEST", "Cannot save an empty output.")

        base_name = self._safe_name(name) or step
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        directory = self.root / step
        payload = {"sections": sections}
        with self._lock:
            directory.mkdir(parents=True, exist_ok=True)
            for number in range(1, 1000):
                suffix = "" if number == 1 else f"_{number}"
                filename = f"{base_name}_{timestamp}{suffix}.json"
                path = directory / filename
                try:
                    with path.open("x", encoding="utf-8", newline="\n") as handle:
                        json.dump(payload, handle, ensure_ascii=False, indent=2)
                        handle.write("\n")
                    return {"filename": filename, "path": path.relative_to(self.root.parent).as_posix()}
                except FileExistsError:
                    continue
        fail(500, "INTERNAL_ERROR", "Could not allocate a unique output filename.")

    @staticmethod
    def _safe_name(value: str) -> str:
        value = INVALID_FILENAME_CHARS.sub("_", value.strip())
        value = re.sub(r"\s+", "_", value)
        value = re.sub(r"_+", "_", value).strip(" ._")
        return value[:80].rstrip(" ._")
