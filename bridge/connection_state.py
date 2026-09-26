"""In-memory session markers for the MyTool page and browser extension."""
import threading
import time


class ConnectionState:
    def __init__(self, extension_timeout: float = 45):
        self._extension_timeout = extension_timeout
        self._lock = threading.Lock()
        self._mytool_session_id = None
        self._extension_session_id = None
        self._extension_seen_at = None

    def register_mytool(self, session_id: str):
        with self._lock:
            changed = (self._mytool_session_id is not None
                       and self._mytool_session_id != session_id)
            self._mytool_session_id = session_id
            state = self._snapshot_locked()
            state["mytool_changed"] = changed
            return state

    def register_extension(self, session_id: str):
        with self._lock:
            self._extension_session_id = session_id
            self._extension_seen_at = time.monotonic()
            return self._snapshot_locked()

    def snapshot(self):
        with self._lock:
            return self._snapshot_locked()

    def _snapshot_locked(self):
        connected = (self._extension_seen_at is not None
                     and time.monotonic() - self._extension_seen_at <= self._extension_timeout)
        return {
            "mytool_session_id": self._mytool_session_id,
            "extension_session_id": self._extension_session_id,
            "extension_connected": connected,
        }
