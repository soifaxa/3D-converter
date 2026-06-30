# 2D to 3D SBS Converter

Web application that converts standard 2D videos into stereoscopic 3D Side-by-Side (SBS) format for VR viewing, using [MiDaS](https://github.com/isl-org/MiDaS) depth estimation.

Inspired by [PointerSoftware/2D-to-3D-SBS-Converter](https://github.com/PointerSoftware/2D-to-3D-SBS-Converter).

## Features

- Upload local videos (MP4, AVI, MOV, WebM, MKV — up to 500 MB)
- Adjustable 3D parameters: depth intensity, convergence, eye separation
- Live preview before full conversion
- Optional segment processing for long videos
- GPU-accelerated depth estimation (CUDA) with CPU fallback
- Audio preservation in the output
- Modern web UI with progress tracking

## Requirements

- Python 3.10+
- FFmpeg (`ffprobe` included)
- NVIDIA GPU with CUDA (recommended)

## Installation

```bash
cd /data/app/3D-converter
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On first launch, the MiDaS DPT_Large model is downloaded automatically (~1.3 GB).

## Run

```bash
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 in your browser.

## How It Works

1. **Frame extraction** — reads frames from the source video
2. **Depth estimation** — MiDaS DPT_Large generates a depth map per frame
3. **Stereoscopic synthesis** — left/right eye views via depth-based pixel displacement
4. **SBS assembly** — combines views into 1920×1080 Side-by-Side format
5. **Encoding** — H.264 MP4 with original audio (NVENC if available)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server and GPU status |
| POST | `/api/upload` | Upload a video file |
| POST | `/api/preview` | Generate preview image |
| POST | `/api/convert` | Start conversion job |
| GET | `/api/jobs/{id}` | Job status and progress |
| GET | `/api/jobs/{id}/download` | Download converted video |

## License

MIT
