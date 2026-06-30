import gc
import threading

import cv2
import numpy as np
import torch

_lock = threading.Lock()
_model = None
_transform = None
_device = None


def get_device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def setup_midas():
    """Load MiDaS DPT_Large model once and reuse across requests."""
    global _model, _transform, _device

    with _lock:
        if _model is not None:
            return _model, _transform, _device

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()

        _device = get_device()

        midas = torch.hub.load("intel-isl/MiDaS", "DPT_Large", trust_repo=True)
        midas.to(_device)
        midas.eval()

        if _device.type == "cuda":
            torch.backends.cudnn.benchmark = True

        midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
        transform = midas_transforms.dpt_transform

        _model = midas
        _transform = transform
        return _model, _transform, _device


def estimate_depth(frame: np.ndarray, model, transform, device) -> np.ndarray:
    img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    input_batch = transform(img).to(device)

    with torch.no_grad():
        prediction = model(input_batch)
        prediction = torch.nn.functional.interpolate(
            prediction.unsqueeze(1),
            size=frame.shape[:2],
            mode="bicubic",
            align_corners=False,
        ).squeeze()

    depth = prediction.cpu().numpy()
    depth_min = depth.min()
    depth_max = depth.max()
    if depth_max - depth_min > 0:
        depth = (depth - depth_min) / (depth_max - depth_min)
    else:
        depth = np.zeros(depth.shape, dtype=depth.dtype)
    return depth


def process_batch(frames, model, transform, device):
    return [estimate_depth(frame, model, transform, device) for frame in frames]
