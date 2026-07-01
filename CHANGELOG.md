# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-01

### Added

- **Precision Studio** interface: three-panel layout (source, preview stage, parameters) with a professional editing-tool aesthetic.
- **Dark and light themes** with toggle in the header and persistence via `localStorage`.
- **Interactive WebGL depth-parallax preview** (`static/js/parallax.js`) — move the cursor to explore the 3D depth effect before conversion.
- **Multiple preview modes**: 3D parallax, side-by-side (SBS), red/cyan anaglyph, and original 2D.
- **Mobile layout**: dedicated upload zone, floating convert button, and bottom sheet for depth and segment settings.
- **Job session recovery**: active conversions are restored after a page reload via `GET /api/jobs/active`.
- **URL-based job linking**: share or bookmark a conversion with `?job=<id>` in the URL.
- **Progress time estimates**: elapsed time and ETA during conversion.
- **Custom range sliders** with live value tooltips for depth, convergence, and eye separation.
- **systemd service guide** in the README for running the app as a background Linux service.
- **Extended job API responses**: filename, video metadata, conversion parameters, and timestamps (`started_at`, `created_at`).

### Changed

- Preview endpoint (`POST /api/preview`) now returns JSON with separate base64-encoded original frame, depth map, and SBS frame instead of a single composite JPEG.
- Preview resolution increased from 360p to 480p height.
- Default **depth intensity** raised from `0.5` to `0.6`.
- Default **eye separation** lowered from `2.5` to `2.0`.
- README installation steps updated with `git clone` instructions and a direct `uvicorn` invocation without activating the virtual environment.
- Application version set to `0.1.0` (exposed via `/api/health` and FastAPI metadata).
- Maximum supported input resolution raised from 3840×2160 (UHD 4K) to 4096×2160 (DCI 4K).

### Fixed

- Depth map edge expansion reduces stretch artifacts at depth boundaries in the parallax preview.

## [0.0.0] - 2026-06-30

Initial release.

- FastAPI backend with MiDaS depth estimation and stereo SBS video conversion.
- Video upload, live JPEG preview, and downloadable 3D output.
- Configurable depth intensity, convergence, and eye separation.
- Optional segment-based conversion (time range selection).
- GPU acceleration when CUDA is available.
- Basic single-column web UI.
