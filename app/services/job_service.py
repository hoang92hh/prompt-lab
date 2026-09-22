"""HTTP client for the local Bridge."""
import json
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from bridge.protocol import JobRequest, JobResponse


class JobService:
    def __init__(self, endpoint: str):
        self.endpoint = endpoint.rstrip("/")

    def _request(self, path: str, payload: dict | None = None) -> dict:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(self.endpoint + path, data=body,
                          headers={"Content-Type": "application/json"},
                          method="POST" if body is not None else "GET")
        try:
            with urlopen(request, timeout=5) as response:
                return json.load(response)
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Bridge HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError("Cannot connect to the local Bridge.") from exc

    def submit(self, request: JobRequest) -> str:
        return self._request("/api/jobs", request)["job_id"]

    def get_record(self, job_id: str) -> dict:
        return self._request("/api/jobs/" + quote(job_id, safe=""))

    def get_result(self, job_id: str) -> JobResponse | None:
        return self.get_record(job_id)["result"]
