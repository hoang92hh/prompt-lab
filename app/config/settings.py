"""Local Bridge configuration."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    bridge_endpoint: str = "http://127.0.0.1:8765"
