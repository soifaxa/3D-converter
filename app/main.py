import time
from pathlib import Path
from typing import Optional

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.config import (
    DEFAULT_CONVERGENCE,
    DEFAULT_DEPTH_INTENSITY,
    DEFAULT_EYE_SEPARATION,
    MAX_FILE_SIZE_MB,
    STATIC_DIR,
    UPLOAD_DIR,
    VALID_EXTENSIONS,
)
from app.converter.depth import setup_midas
from app.converter.processor import generate_preview_data
from app.converter.video import get_video_duration, validate_video
from app.jobs import JobStatus, job_manager

app = FastAPI(title="2D to 3D SBS Converter", version=__version__)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.on_event("startup")
def load_model_on_startup():
    setup_midas()


@app.get("/api/health")
def health():
    gpu_name = None
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
    return {
        "status": "ok",
        "version": __version__,
        "cuda_available": torch.cuda.is_available(),
        "gpu": gpu_name,
    }


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in VALID_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Supported: {', '.join(sorted(VALID_EXTENSIONS))}",
        )

    upload_id = f"{int(time.time() * 1000)}"
    dest = UPLOAD_DIR / f"{upload_id}{ext}"

    size = 0
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_FILE_SIZE_MB * 1024 * 1024:
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=400,
                    detail=f"File exceeds {MAX_FILE_SIZE_MB} MB limit",
                )
            out.write(chunk)

    valid, result = validate_video(dest)
    if not valid:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=result)

    duration = result.get("duration_sec") or get_video_duration(dest)
    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "path": str(dest),
        "video_info": {**result, "duration_sec": duration},
    }


@app.post("/api/preview")
def preview(
    upload_path: str = Form(...),
    depth_intensity: float = Form(DEFAULT_DEPTH_INTENSITY),
    convergence: float = Form(DEFAULT_CONVERGENCE),
    eye_separation: float = Form(DEFAULT_EYE_SEPARATION),
    frame_position: float = Form(0.5),
):
    path = Path(upload_path)
    if not path.exists() or not str(path.resolve()).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid upload path")

    try:
        preview_data = generate_preview_data(
            path, depth_intensity, convergence, eye_separation, frame_position
        )
        return JSONResponse(preview_data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/convert")
def start_conversion(
    upload_path: str = Form(...),
    depth_intensity: float = Form(DEFAULT_DEPTH_INTENSITY),
    convergence: float = Form(DEFAULT_CONVERGENCE),
    eye_separation: float = Form(DEFAULT_EYE_SEPARATION),
    use_segment: bool = Form(False),
    segment_start: float = Form(0),
    segment_end: Optional[float] = Form(None),
    filename: str = Form("video"),
):
    path = Path(upload_path)
    if not path.exists() or not str(path.resolve()).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid upload path")

    valid, result = validate_video(path)
    if not valid:
        raise HTTPException(status_code=400, detail=result)

    if use_segment and segment_end is not None and segment_start >= segment_end:
        raise HTTPException(status_code=400, detail="Segment end must be greater than start")

    job = job_manager.create_job(
        str(path),
        depth_intensity,
        convergence,
        eye_separation,
        use_segment,
        segment_start,
        segment_end,
        filename=filename,
        video_info=result,
    )
    return {
        "job_id": job.id,
        "status": job.status,
        "message": job.message,
    }


def _job_to_response(job) -> dict:
    return {
        "job_id": job.id,
        "status": job.status,
        "progress": job.progress,
        "message": job.message,
        "error": job.error,
        "download_ready": job.status == JobStatus.COMPLETED,
        "upload_path": job.input_path,
        "filename": job.filename,
        "video_info": job.video_info,
        "depth_intensity": job.depth_intensity,
        "convergence": job.convergence,
        "eye_separation": job.eye_separation,
        "use_segment": job.use_segment,
        "segment_start": job.segment_start,
        "segment_end": job.segment_end,
        "started_at": job.started_at,
        "created_at": job.created_at,
    }


@app.get("/api/jobs/active")
def get_active_job():
    job = job_manager.get_active_job()
    if not job:
        return {"job_id": None}
    return _job_to_response(job)


@app.get("/api/jobs/{job_id}")
def get_job_status(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


@app.get("/api/jobs/{job_id}/download")
def download_result(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not completed yet")
    output = Path(job.output_path)
    if not output.exists():
        raise HTTPException(status_code=404, detail="Output file not found")
    return FileResponse(
        path=str(output),
        media_type="video/mp4",
        filename=f"3d_sbs_{job_id[:8]}.mp4",
    )


@app.get("/")
def index():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return JSONResponse({"message": "2D to 3D SBS Converter API", "docs": "/docs"})
