"""In-memory records. JobManager owns synchronization and state transitions."""
from copy import deepcopy
from .protocol import JobRequest, JobResponse, fail

class JobStore:
    def __init__(self):
        self._records: dict[str, dict] = {}

    def create(self, request: JobRequest) -> None:
        job_id = request["job_id"]
        if job_id in self._records:
            fail(409, "DUPLICATE_JOB", "job_id already exists; use a new ID.")
        self._records[job_id] = {
            "request": deepcopy(request), "status": "queued", "result": None,
        }

    def record(self, job_id: str) -> dict:
        if job_id not in self._records:
            fail(404, "JOB_NOT_FOUND", "Job does not exist in this Bridge process.")
        return self._records[job_id]

    def snapshot(self, job_id: str) -> dict:
        record = self.record(job_id)
        return deepcopy({"job_id": job_id, "status": record["status"], "result": record["result"]})

    def get_result(self, job_id: str) -> JobResponse | None:
        return deepcopy(self.record(job_id)["result"])
