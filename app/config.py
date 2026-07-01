from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
OUTPUT_DIR = DATA_DIR / "outputs"
TEMP_DIR = DATA_DIR / "temp"
STATIC_DIR = BASE_DIR / "static"

MAX_FILE_SIZE_MB = 500
VALID_EXTENSIONS = {".mp4", ".avi", ".mov", ".webm", ".mkv"}
MAX_RESOLUTION = (4096, 2160)

SBS_WIDTH = 1920
SBS_HEIGHT = 1080

DEFAULT_DEPTH_INTENSITY = 0.6
DEFAULT_CONVERGENCE = 5.0
DEFAULT_EYE_SEPARATION = 2.0

for directory in (UPLOAD_DIR, OUTPUT_DIR, TEMP_DIR):
    directory.mkdir(parents=True, exist_ok=True)
