import gc
import os
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np
import torch

from app.config import SBS_HEIGHT, SBS_WIDTH
from app.converter.depth import process_batch, setup_midas
from app.converter.stereo import create_side_by_side, generate_stereo_views
from app.converter.video import (
    check_audio_stream,
    combine_video_audio,
    encode_final_video,
    extract_audio,
    extract_video_segment,
    make_temp_path,
    validate_video,
)


def _batch_size_for_resolution(width: int, height: int) -> int:
    pixel_count = width * height
    if pixel_count <= 640 * 480:
        return 8
    if pixel_count <= 1280 * 720:
        return 4
    if pixel_count <= 1920 * 1080:
        return 2
    return 1


def process_video_to_3d_sbs(
    input_path: str | Path,
    output_path: str | Path,
    depth_intensity: float,
    convergence: float,
    eye_separation: float,
    progress_callback: Optional[Callable[[float, str], None]] = None,
    use_segment: bool = False,
    segment_start: float = 0,
    segment_end: Optional[float] = None,
):
    valid, result = validate_video(input_path)
    if not valid:
        raise ValueError(result)

    video_info = result
    segment_path = None
    working_input = str(input_path)

    if use_segment and segment_end is not None and segment_start < segment_end:
        segment_path = make_temp_path("_segment.mp4")
        working_input = str(extract_video_segment(input_path, segment_path, segment_start, segment_end))
        valid, result = validate_video(working_input)
        if not valid:
            raise ValueError(f"Segment validation failed: {result}")
        video_info = result

    temp_video_path = make_temp_path("_video.mp4")
    temp_audio_path = make_temp_path("_audio.aac")
    has_audio = check_audio_stream(working_input)
    if has_audio:
        has_audio = extract_audio(working_input, temp_audio_path)

    width = video_info["width"]
    height = video_info["height"]
    fps = video_info["fps"]
    frame_count = max(int(video_info["frame_count"]), 1)

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        gc.collect()

    model, transform, device = setup_midas()
    batch_size = _batch_size_for_resolution(width, height)

    cap = cv2.VideoCapture(working_input)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(temp_video_path), fourcc, fps, (SBS_WIDTH, SBS_HEIGHT))

    frame_index = 0
    prev_depth_map = None

    while True:
        frames = []
        for _ in range(batch_size):
            ret, frame = cap.read()
            if not ret:
                break
            frames.append(frame)

        if not frames:
            break

        depth_maps = process_batch(frames, model, transform, device)

        for i, frame in enumerate(frames):
            depth_map = depth_maps[i]
            if prev_depth_map is not None:
                depth_map = 0.8 * depth_map + 0.2 * prev_depth_map
            prev_depth_map = depth_map.copy()

            left_view, right_view = generate_stereo_views(
                frame, depth_map, depth_intensity, convergence, eye_separation
            )
            sbs_frame = create_side_by_side(left_view, right_view)
            out.write(sbs_frame)
            frame_index += 1

            if progress_callback:
                progress_callback(
                    min(1.0, frame_index / frame_count),
                    f"Processing frame {frame_index}/{frame_count}",
                )

        if frame_index % 50 == 0 and torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()

    cap.release()
    out.release()

    if progress_callback:
        progress_callback(0.95, "Encoding final video...")

    if has_audio:
        if not combine_video_audio(temp_video_path, temp_audio_path, output_path):
            encode_final_video(temp_video_path, output_path)
    else:
        encode_final_video(temp_video_path, output_path)

    if segment_path and segment_path.exists():
        segment_path.unlink(missing_ok=True)
    temp_video_path.unlink(missing_ok=True)
    if temp_audio_path.exists():
        temp_audio_path.unlink(missing_ok=True)

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        gc.collect()

    if progress_callback:
        progress_callback(1.0, "Conversion complete")

    return str(output_path)


def _encode_jpeg_b64(image_bgr: np.ndarray, quality: int = 90) -> str:
    import base64

    success, buffer = cv2.imencode(".jpg", image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not success:
        raise RuntimeError("Failed to encode JPEG image")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def _encode_png_b64(image: np.ndarray) -> str:
    import base64

    success, buffer = cv2.imencode(".png", image)
    if not success:
        raise RuntimeError("Failed to encode PNG image")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def _prepare_depth_for_parallax(depth_map: np.ndarray, expand_radius: int = 3) -> np.ndarray:
    """Near = bright. Optional edge expansion reduces stretch artifacts at depth boundaries."""
    inverted = (1.0 - depth_map).astype(np.float32)
    depth_u8 = (inverted * 255).astype(np.uint8)
    if expand_radius > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (expand_radius * 2 + 1, expand_radius * 2 + 1))
        depth_u8 = cv2.dilate(depth_u8, kernel, iterations=1)
    return depth_u8


def generate_preview_data(
    input_path: str | Path,
    depth_intensity: float,
    convergence: float,
    eye_separation: float,
    frame_position: float = 0.5,
    preview_height: int = 480,
) -> dict:
    valid, result = validate_video(input_path)
    if not valid:
        raise ValueError(result)

    model, transform, device = setup_midas()
    cap = cv2.VideoCapture(str(input_path))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    target_frame = int(frame_count * frame_position)
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)

    ret, frame = cap.read()
    cap.release()
    if not ret:
        raise ValueError("Could not read frame from video")

    depth_map = process_batch([frame], model, transform, device)[0]
    left_view, right_view = generate_stereo_views(
        frame, depth_map, depth_intensity, convergence, eye_separation
    )
    sbs_frame = create_side_by_side(left_view, right_view)

    h, w = frame.shape[:2]
    preview_width = int(w * preview_height / h)
    original_resized = cv2.resize(frame, (preview_width, preview_height))
    depth_resized = cv2.resize(depth_map, (preview_width, preview_height), interpolation=cv2.INTER_LINEAR)
    depth_gray = _prepare_depth_for_parallax(depth_resized)

    sbs_preview_width = int(SBS_WIDTH * (preview_height / SBS_HEIGHT))
    sbs_preview = cv2.resize(sbs_frame, (sbs_preview_width, preview_height))

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        gc.collect()

    return {
        "width": preview_width,
        "height": preview_height,
        "sbs_width": sbs_preview_width,
        "original_jpeg": _encode_jpeg_b64(original_resized),
        "depth_png": _encode_png_b64(depth_gray),
        "sbs_jpeg": _encode_jpeg_b64(sbs_preview),
    }
