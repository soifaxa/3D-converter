import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

from app.config import OUTPUT_DIR
from app.converter.processor import process_video_to_3d_sbs


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ConversionJob:
    id: str
    input_path: str
    output_path: str
    depth_intensity: float
    convergence: float
    eye_separation: float
    use_segment: bool
    segment_start: float
    segment_end: Optional[float]
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0
    message: str = "Waiting to start..."
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)


class JobManager:
    def __init__(self):
        self._jobs: dict[str, ConversionJob] = {}
        self._lock = threading.Lock()

    def create_job(
        self,
        input_path: str,
        depth_intensity: float,
        convergence: float,
        eye_separation: float,
        use_segment: bool = False,
        segment_start: float = 0,
        segment_end: Optional[float] = None,
    ) -> ConversionJob:
        job_id = str(uuid.uuid4())
        output_path = str(OUTPUT_DIR / f"{job_id}.mp4")
        job = ConversionJob(
            id=job_id,
            input_path=input_path,
            output_path=output_path,
            depth_intensity=depth_intensity,
            convergence=convergence,
            eye_separation=eye_separation,
            use_segment=use_segment,
            segment_start=segment_start,
            segment_end=segment_end,
        )
        with self._lock:
            self._jobs[job_id] = job
        thread = threading.Thread(target=self._run_job, args=(job_id,), daemon=True)
        thread.start()
        return job

    def get_job(self, job_id: str) -> Optional[ConversionJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def _update_job(self, job_id: str, **kwargs):
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                for key, value in kwargs.items():
                    setattr(job, key, value)

    def _run_job(self, job_id: str):
        job = self.get_job(job_id)
        if not job:
            return

        self._update_job(job_id, status=JobStatus.RUNNING, message="Starting conversion...")

        def on_progress(progress: float, message: str):
            self._update_job(job_id, progress=progress, message=message)

        try:
            process_video_to_3d_sbs(
                job.input_path,
                job.output_path,
                job.depth_intensity,
                job.convergence,
                job.eye_separation,
                progress_callback=on_progress,
                use_segment=job.use_segment,
                segment_start=job.segment_start,
                segment_end=job.segment_end,
            )
            self._update_job(
                job_id,
                status=JobStatus.COMPLETED,
                progress=1.0,
                message="Conversion complete",
            )
        except Exception as exc:
            self._update_job(
                job_id,
                status=JobStatus.FAILED,
                error=str(exc),
                message=f"Conversion failed: {exc}",
            )


job_manager = JobManager()
