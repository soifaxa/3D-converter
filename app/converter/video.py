import os
import subprocess
import time
from pathlib import Path

import cv2

from app.config import MAX_FILE_SIZE_MB, MAX_RESOLUTION, TEMP_DIR, VALID_EXTENSIONS


def validate_video(file_path: str | Path):
    file_path = str(file_path)
    if not os.path.exists(file_path):
        return False, "File does not exist"

    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext not in VALID_EXTENSIONS:
        return False, f"Unsupported format: {file_ext}. Supported: {', '.join(sorted(VALID_EXTENSIONS))}"

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        return False, "Cannot open video file"

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if width > MAX_RESOLUTION[0] or height > MAX_RESOLUTION[1]:
        cap.release()
        return False, f"Resolution ({width}x{height}) exceeds maximum ({MAX_RESOLUTION[0]}x{MAX_RESOLUTION[1]})"

    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        cap.release()
        return False, f"File size ({file_size_mb:.1f} MB) exceeds limit ({MAX_FILE_SIZE_MB} MB)"

    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = frame_count / fps if fps > 0 else 0
    cap.release()

    return True, {
        "width": width,
        "height": height,
        "fps": fps,
        "frame_count": frame_count,
        "size_mb": file_size_mb,
        "duration_sec": duration_sec,
    }


def get_video_duration(file_path: str | Path) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(file_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        return float(result.stdout.strip())
    except Exception:
        cap = cv2.VideoCapture(str(file_path))
        if not cap.isOpened():
            return 0.0
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()
        return frame_count / fps if fps > 0 else 0.0


def check_audio_stream(file_path: str | Path) -> bool:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=codec_name",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(file_path),
            ],
            capture_output=True,
            text=True,
        )
        return bool(result.stdout.strip())
    except Exception:
        return False


def extract_audio(input_path: str | Path, output_path: str | Path) -> bool:
    os.makedirs(os.path.dirname(str(output_path)), exist_ok=True)
    cmd = [
        "ffmpeg",
        "-i",
        str(input_path),
        "-vn",
        "-acodec",
        "copy",
        "-y",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0


def combine_video_audio(video_path: str | Path, audio_path: str | Path, output_path: str | Path) -> bool:
    cmd = [
        "ffmpeg",
        "-i",
        str(video_path),
        "-i",
        str(audio_path),
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-y",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0


def extract_video_segment(input_path: str | Path, output_path: str | Path, start_time: float, end_time: float):
    os.makedirs(os.path.dirname(str(output_path)), exist_ok=True)
    cmd = [
        "ffmpeg",
        "-i",
        str(input_path),
        "-ss",
        str(start_time),
        "-to",
        str(end_time),
        "-c:v",
        "copy",
        "-c:a",
        "copy",
        "-avoid_negative_ts",
        "1",
        "-y",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg segment extraction failed: {result.stderr}")
    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        raise RuntimeError("Segment extraction produced an empty file")
    return output_path


def encode_final_video(temp_video_path: str | Path, output_path: str | Path):
    nvenc_cmd = [
        "ffmpeg",
        "-i",
        str(temp_video_path),
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p2",
        "-b:v",
        "8M",
        "-y",
        str(output_path),
    ]
    result = subprocess.run(nvenc_cmd, capture_output=True, text=True)
    if result.returncode == 0:
        return

    x264_cmd = [
        "ffmpeg",
        "-i",
        str(temp_video_path),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "23",
        "-y",
        str(output_path),
    ]
    result = subprocess.run(x264_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Video encoding failed: {result.stderr}")


def make_temp_path(suffix: str) -> Path:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    return TEMP_DIR / f"temp_{int(time.time() * 1000)}{suffix}"
