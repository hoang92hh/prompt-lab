"""Turn a user message into a ChatGPT job."""
from uuid import uuid4
from .job_service import JobService


class AIService:
    def __init__(self, jobs: JobService):
        self.jobs = jobs

    def submit(self, message: str) -> str:
        if not message.strip():
            raise ValueError("Enter a message before checking the connection.")
        return self.jobs.submit({
            "job_id": "mytool-" + uuid4().hex,
            "provider": "chatgpt",
            "action": "prompt",
            "content": message,
            "options": {},
        })

    def get_record(self, job_id: str) -> dict:
        return self.jobs.get_record(job_id)
