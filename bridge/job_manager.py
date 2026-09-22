"""Atomic FIFO claiming: one processing job, never automatically requeued."""
import logging
import time
from collections import deque
from copy import deepcopy
from threading import Condition
from .job_store import JobStore
from .protocol import JobRequest, JobResponse, fail, validate_request, validate_response

LOG = logging.getLogger(__name__)

class JobManager:
    def __init__(self, store: JobStore | None = None):
        self.store = store if store is not None else JobStore()
        self._queue: deque[str] = deque()
        self._active: str | None = None
        self._condition = Condition()

    def enqueue(self, request: JobRequest) -> dict:
        request = validate_request(request)
        with self._condition:
            self.store.create(request)
            self._queue.append(request["job_id"])
            LOG.info("[JOB %s] RECEIVED / CREATED", ascii(request["job_id"]))
            self._condition.notify_all()
            return self.store.snapshot(request["job_id"])

    def next_job(self, timeout: float = 20) -> JobRequest | None:
        deadline = time.monotonic() + timeout
        with self._condition:
            while self._active is not None or not self._queue:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                self._condition.wait(remaining)
            job_id = self._queue.popleft()
            self._active = job_id
            record = self.store.record(job_id)
            record["status"] = "processing"
            LOG.info("[JOB %s] CLAIMED", ascii(job_id))
            return deepcopy(record["request"])

    def finish(self, job_id: str, response: JobResponse) -> dict:
        response = validate_response(response, job_id)
        with self._condition:
            record = self.store.record(job_id)
            if record["status"] in {"completed", "error"}:
                if record["result"] == response:
                    return self.store.snapshot(job_id)
                fail(409, "RESULT_CONFLICT", "A different final result already exists.")
            if record["status"] != "processing" or self._active != job_id:
                fail(409, "INVALID_STATE", "Job must be claimed before submitting a result.")
            LOG.info("[JOB %s] RESULT RECEIVED", ascii(job_id))
            record["result"] = deepcopy(response)
            record["status"] = response["status"]
            self._active = None
            LOG.info("[JOB %s] %s", ascii(job_id), response["status"].upper())
            self._condition.notify_all()
            return self.store.snapshot(job_id)

    def get(self, job_id: str) -> dict:
        with self._condition:
            return self.store.snapshot(job_id)
