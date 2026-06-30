import cv2
import numpy as np

from app.config import SBS_HEIGHT, SBS_WIDTH


def create_depth_based_disparity(depth_map, depth_intensity, convergence, eye_separation):
    inverted_depth = 1.0 - depth_map
    disparity = inverted_depth * depth_intensity
    return disparity * eye_separation / convergence


def generate_stereo_views(frame, depth_map, depth_intensity, convergence, eye_separation):
    h, w = frame.shape[:2]
    disparity = create_depth_based_disparity(depth_map, depth_intensity, convergence, eye_separation)
    max_shift = int(w * 0.05)
    disparity_scaled = (disparity * max_shift).astype(np.float32)

    x_coords = np.tile(np.arange(w, dtype=np.float32), (h, 1))
    y_coords = np.tile(np.arange(h, dtype=np.float32).reshape(-1, 1), (1, w))

    left_map_x = np.clip(x_coords - disparity_scaled / 2, 0, w - 1)
    right_map_x = np.clip(x_coords + disparity_scaled / 2, 0, w - 1)

    left_view = cv2.remap(frame, left_map_x, y_coords, cv2.INTER_LINEAR)
    right_view = cv2.remap(frame, right_map_x, y_coords, cv2.INTER_LINEAR)

    left_mask = np.all(left_view == 0, axis=2).astype(np.uint8) * 255
    right_mask = np.all(right_view == 0, axis=2).astype(np.uint8) * 255

    if np.any(left_mask):
        left_view = cv2.inpaint(left_view, left_mask, 3, cv2.INPAINT_TELEA)
    if np.any(right_mask):
        right_view = cv2.inpaint(right_view, right_mask, 3, cv2.INPAINT_TELEA)

    return left_view, right_view


def create_side_by_side(left_view, right_view):
    total_width = SBS_WIDTH
    total_height = SBS_HEIGHT
    eye_width = total_width // 2
    content_height = int(eye_width * 3 / 4)

    left_resized = cv2.resize(left_view, (eye_width, content_height))
    right_resized = cv2.resize(right_view, (eye_width, content_height))

    sbs_frame = np.zeros((total_height, total_width, 3), dtype=np.uint8)
    vertical_offset = (total_height - content_height) // 2
    sbs_frame[vertical_offset : vertical_offset + content_height, 0:eye_width] = left_resized
    sbs_frame[vertical_offset : vertical_offset + content_height, eye_width:total_width] = right_resized
    return sbs_frame
