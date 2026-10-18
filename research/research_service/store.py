"""Job store. Jobs live in memory and, when a directory is given, in one JSON file per job, so they survive a restart.

The Postgres version (research_* tables) can replace this class without changing its callers: create, get, update,
add_event, list. A run that was queued or running when the service stopped is marked failed on the next start.
"""

import copy
import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class JobStore:
    def __init__(self, directory: Path | None = None):
        self._jobs: dict[str, dict] = {}
        self._lock = threading.RLock()
        self._dir = Path(directory) if directory else None
        if self._dir:
            self._dir.mkdir(parents=True, exist_ok=True)
            self._load()

    def _load(self) -> None:
        for path in sorted(self._dir.glob("res_*.json")):
            try:
                job = json.loads(path.read_text(encoding="utf-8"))
            except ValueError:
                continue
            if job.get("status") in ("queued", "running"):
                job["status"] = "failed"
                job["error"] = "The service restarted while this run was in progress. Start it again."
                job["updated_at"] = now()
                self._persist(job)
            self._jobs[job["job_id"]] = job

    def _persist(self, job: dict) -> None:
        if not self._dir:
            return
        tmp = self._dir / f".{job['job_id']}.tmp"
        tmp.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self._dir / f"{job['job_id']}.json")

    def create(self, **fields) -> dict:
        with self._lock:
            job = {"job_id": f"res_{uuid.uuid4().hex[:6]}", "status": "queued", "progress": [], "candidates": None, "entity": None,
                   "claims": [], "report": None, "error": None, "created_at": now(), "updated_at": now(), **fields}
            self._jobs[job["job_id"]] = job
            self._persist(job)
            return copy.deepcopy(job)

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return copy.deepcopy(job) if job else None

    def update(self, job_id: str, **fields) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.update(fields)
            job["updated_at"] = now()
            self._persist(job)

    def add_event(self, job_id: str, step: str, message: str, agent: str | None = None) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job["progress"].append({"step": step, "message": message, "agent": agent, "ts": now()})
            job["updated_at"] = now()
            self._persist(job)

    def list(self, limit: int = 50) -> list[dict]:
        with self._lock:
            jobs = sorted(self._jobs.values(), key=lambda j: j["created_at"], reverse=True)[:limit]
            return [copy.deepcopy(j) for j in jobs]
