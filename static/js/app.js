const state = {
  uploadPath: null,
  videoInfo: null,
  filename: null,
  currentJobId: null,
  pollInterval: null,
  conversionStartTime: null,
  previewImage: null,
  previewOriginalWidth: 0,
  previewSbsWidth: 640,
  currentView: 'parallax',
  parallaxViewer: null,
};

const $ = (id) => document.getElementById(id);

/* ── Theme ──────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('studio-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('studio-theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  $('theme-icon-dark').classList.toggle('hidden', theme === 'light');
  $('theme-icon-light').classList.toggle('hidden', theme === 'dark');
}

/* ── Custom Range Sliders ─────────────────────────────── */
function initRangeSlider(inputId, prefix) {
  const input = $(inputId);
  const fill = $(`${prefix}-fill`);
  const thumb = $(`${prefix}-thumb`);
  const tooltip = $(`${prefix}-tooltip`);
  const valueIds = { depth: 'depth-value', convergence: 'convergence-value', eye: 'eye-value' };
  const staticVal = $(valueIds[prefix]);
  const slider = input.closest('.range-slider');
  const ticksEl = $(`${prefix}-ticks`);

  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const steps = 10;

  for (let i = 0; i <= steps; i++) {
    const tick = document.createElement('span');
    tick.className = 'range-slider__tick' + (i % 5 === 0 ? ' range-slider__tick--major' : '');
    ticksEl.appendChild(tick);
  }

  function formatValue(val) {
    const step = parseFloat(input.step);
    return step < 0.1 ? parseFloat(val).toFixed(2) : parseFloat(val).toFixed(1);
  }

  function updateUI() {
    const val = parseFloat(input.value);
    const pct = ((val - min) / (max - min)) * 100;
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    tooltip.style.left = `${pct}%`;
    tooltip.textContent = formatValue(val);
    staticVal.textContent = formatValue(val);
  }

  function showTooltip(show) {
    tooltip.classList.toggle('visible', show);
    slider.classList.toggle('is-active', show);
  }

  input.addEventListener('input', () => {
    updateUI();
    if (state.parallaxViewer && prefix === 'depth') {
      state.parallaxViewer.setStrengthFromDepthIntensity(input.value);
    }
  });
  input.addEventListener('mousedown', () => showTooltip(true));
  input.addEventListener('touchstart', () => showTooltip(true), { passive: true });
  input.addEventListener('mouseup', () => showTooltip(false));
  input.addEventListener('touchend', () => showTooltip(false));
  input.addEventListener('mouseleave', () => showTooltip(false));

  updateUI();
}

function bindSliders() {
  initRangeSlider('depth-intensity', 'depth');
  initRangeSlider('convergence', 'convergence');
  initRangeSlider('eye-separation', 'eye');
}

/* ── Setting Cards ────────────────────────────────────── */
function bindSettingCards() {
  document.querySelectorAll('.setting-card__header').forEach((header) => {
    header.addEventListener('click', () => {
      header.closest('.setting-card').classList.toggle('is-open');
    });
  });
}

/* ── Mobile Bottom Sheet ──────────────────────────────── */
function initBottomSheet() {
  const overlay = $('bottom-sheet-overlay');
  const sheet = $('bottom-sheet');
  const content = $('bottom-sheet-content');
  const depthCard = document.querySelector('[data-card="depth"] .setting-card__body');
  const segmentCard = document.querySelector('[data-card="segment"]');

  if (depthCard) {
    const depthClone = depthCard.cloneNode(true);
    const segmentClone = segmentCard.cloneNode(true);
    content.appendChild(depthClone);
    content.appendChild(segmentClone);

    content.querySelectorAll('.range-slider__input').forEach((cloneInput) => {
      const origId = cloneInput.id;
      const orig = $(origId);
      cloneInput.addEventListener('input', () => {
        orig.value = cloneInput.value;
        orig.dispatchEvent(new Event('input', { bubbles: true }));
      });
      orig.addEventListener('input', () => {
        cloneInput.value = orig.value;
      });
    });

    const cloneSegmentCheck = content.querySelector('#use-segment');
    if (cloneSegmentCheck) {
      cloneSegmentCheck.id = 'use-segment-mobile';
      cloneSegmentCheck.addEventListener('change', (e) => {
        $('use-segment').checked = e.target.checked;
        $('use-segment').dispatchEvent(new Event('change'));
      });
    }
  }

  function openSheet() {
    overlay.classList.add('is-open');
    sheet.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    overlay.classList.remove('is-open');
    sheet.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  $('mobile-settings-trigger').addEventListener('click', openSheet);
  overlay.addEventListener('click', closeSheet);

  content.querySelectorAll('.setting-card__header').forEach((header) => {
    header.addEventListener('click', () => {
      header.closest('.setting-card').classList.toggle('is-open');
    });
  });
}

/* ── Parallax Viewer ───────────────────────────────────── */
function ensureParallaxViewer() {
  if (state.parallaxViewer) return state.parallaxViewer;

  const canvas = $('preview-gl-canvas');
  state.parallaxViewer = new ParallaxViewer(canvas);
  state.parallaxViewer.bindInteraction($('preview-container'));
  state.parallaxViewer.setStrengthFromDepthIntensity($('depth-intensity').value);
  return state.parallaxViewer;
}

function showPreviewView(view) {
  const canvas2d = $('preview-canvas');
  const canvasGl = $('preview-gl-canvas');
  const hint = $('preview-parallax-hint');
  const divider = $('split-divider');
  const labels = $('preview-labels');

  const isParallax = view === 'parallax';
  canvas2d.classList.toggle('hidden', isParallax);
  canvasGl.classList.toggle('hidden', !isParallax);
  hint.classList.toggle('hidden', !isParallax);

  if (isParallax) {
    divider.style.opacity = '';
    labels.classList.add('hidden');
    if (state.parallaxViewer) state.parallaxViewer.resize();
  } else {
    divider.style.opacity = view === 'sbs' ? '1' : '';
  }
}

/* ── Preview View Modes ───────────────────────────────── */
function bindViewToggle() {
  document.querySelectorAll('.view-toggle__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-toggle__btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentView = btn.dataset.view;
      $('preview-container').className = `sbs-preview-container view-${state.currentView} has-preview`;
      showPreviewView(state.currentView);
      if (state.previewImage) renderPreview();
    });
  });
}

function renderAnaglyph(ctx, img, sbsX, sbsWidth, sbsHeight, outW, outH) {
  const offscreen = document.createElement('canvas');
  offscreen.width = sbsWidth;
  offscreen.height = sbsHeight;
  const offCtx = offscreen.getContext('2d');
  offCtx.drawImage(img, sbsX, 0, sbsWidth, sbsHeight, 0, 0, sbsWidth, sbsHeight);

  const sbsData = offCtx.getImageData(0, 0, sbsWidth, sbsHeight);
  const halfW = Math.floor(sbsWidth / 2);
  const outCanvas = document.createElement('canvas');
  outCanvas.width = halfW;
  outCanvas.height = sbsHeight;
  const outCtx = outCanvas.getContext('2d');
  const outData = outCtx.createImageData(halfW, sbsHeight);

  for (let y = 0; y < sbsHeight; y++) {
    for (let x = 0; x < halfW; x++) {
      const leftIdx = (y * sbsWidth + x) * 4;
      const rightIdx = (y * sbsWidth + x + halfW) * 4;
      const outIdx = (y * halfW + x) * 4;

      outData.data[outIdx] = sbsData.data[leftIdx];
      outData.data[outIdx + 1] = sbsData.data[rightIdx + 1];
      outData.data[outIdx + 2] = sbsData.data[rightIdx + 2];
      outData.data[outIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outData, 0, 0);
  ctx.drawImage(outCanvas, 0, 0, halfW, sbsHeight, 0, 0, outW, outH);
}

function renderPreview() {
  if (!state.previewImage) return;

  const container = $('preview-container');
  const viewport = $('preview-viewport');
  const view = state.currentView;

  if (view === 'parallax') {
    viewport.classList.remove('hidden');
    $('preview-placeholder').classList.add('hidden');
    container.classList.add('has-preview');
    showPreviewView('parallax');
    return;
  }

  const canvas = $('preview-canvas');
  const img = state.previewImage;
  const imgH = img.naturalHeight;

  const containerRect = container.getBoundingClientRect();
  const maxW = containerRect.width;
  const maxH = containerRect.height;

  let aspectW;
  let aspectH;

  if (view === 'original') {
    aspectW = state.previewOriginalWidth;
    aspectH = imgH;
  } else if (view === 'anaglyph') {
    aspectW = state.previewSbsWidth / 2;
    aspectH = imgH;
  } else {
    aspectW = state.previewSbsWidth;
    aspectH = imgH;
  }

  const scale = Math.min(maxW / aspectW, maxH / aspectH);
  const drawW = Math.round(aspectW * scale);
  const drawH = Math.round(aspectH * scale);

  canvas.width = drawW;
  canvas.height = drawH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, drawW, drawH);

  showPreviewView(view);

  if (view === 'original') {
    ctx.drawImage(img, 0, 0, state.previewOriginalWidth, imgH, 0, 0, drawW, drawH);
  } else if (view === 'anaglyph') {
    renderAnaglyph(ctx, img, state.previewOriginalWidth, state.previewSbsWidth, imgH, drawW, drawH);
  } else {
    ctx.drawImage(
      img,
      state.previewOriginalWidth, 0, state.previewSbsWidth, imgH,
      0, 0, drawW, drawH
    );
  }

  const divider = $('split-divider');
  const labels = $('preview-labels');

  if (view === 'sbs') {
    divider.style.opacity = '1';
    labels.classList.remove('hidden');
    $('label-left').textContent = 'Left Eye';
    $('label-right').textContent = 'Right Eye';
  }

  viewport.classList.remove('hidden');
  $('preview-placeholder').classList.add('hidden');
  container.classList.add('has-preview');
}

async function loadPreviewData(data) {
  const originalSrc = `data:image/jpeg;base64,${data.original_jpeg}`;
  const depthSrc = `data:image/png;base64,${data.depth_png}`;
  const sbsSrc = `data:image/jpeg;base64,${data.sbs_jpeg}`;

  const viewer = ensureParallaxViewer();
  viewer.setStrengthFromDepthIntensity($('depth-intensity').value);
  await viewer.loadImages(originalSrc, depthSrc);

  const sbsImg = await ParallaxViewer._loadImage(sbsSrc);
  const composite = document.createElement('canvas');
  composite.width = data.width + data.sbs_width;
  composite.height = data.height;
  const ctx = composite.getContext('2d');
  const originalImg = await ParallaxViewer._loadImage(originalSrc);
  ctx.drawImage(originalImg, 0, 0);
  ctx.drawImage(sbsImg, data.width, 0);

  state.previewImage = new Image();
  state.previewImage.src = composite.toDataURL('image/jpeg', 0.92);
  state.previewOriginalWidth = data.width;
  state.previewSbsWidth = data.sbs_width;
  await new Promise((resolve) => {
    state.previewImage.onload = resolve;
  });

  $('preview-container').className = `sbs-preview-container view-${state.currentView} has-preview`;
  renderPreview();
}

/* ── Error / Buttons ──────────────────────────────────── */
function showError(message) {
  const el = $('error-message');
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError() {
  $('error-message').classList.add('hidden');
}

function setButtonsEnabled(enabled) {
  $('preview-btn').disabled = !enabled;
  $('convert-btn-desktop').disabled = !enabled;
  $('convert-btn-fab').disabled = !enabled;
}

function getJobIdFromUrl() {
  return new URLSearchParams(window.location.search).get('job');
}

function setJobUrl(jobId) {
  const url = new URL(window.location.href);
  url.searchParams.set('job', jobId);
  history.replaceState({ jobId }, '', url);
}

function clearJobUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('job');
  history.replaceState({}, '', url);
}

function applyJobParams(job) {
  const sliders = [
    ['depth-intensity', job.depth_intensity],
    ['convergence', job.convergence],
    ['eye-separation', job.eye_separation],
  ];
  sliders.forEach(([id, value]) => {
    const el = $(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  $('use-segment').checked = job.use_segment;
  $('segment-controls').classList.toggle('hidden', !job.use_segment);
  $('segment-start').value = job.segment_start;
  if (job.segment_end != null) {
    $('segment-end').value = job.segment_end;
  }
}

function showProcessingUI() {
  $('download-section').classList.add('hidden');
  $('progress-section').classList.remove('hidden');
  $('preview-container').classList.add('is-processing');
  setButtonsEnabled(false);
}

function hideProcessingUI() {
  $('progress-section').classList.add('hidden');
  $('preview-container').classList.remove('is-processing');
}

function updateProgressUI(data) {
  const pct = Math.round(data.progress * 100);
  $('progress-fill').style.width = `${pct}%`;
  $('progress-message').textContent = data.message;

  const startTime = state.conversionStartTime || (data.started_at ? data.started_at * 1000 : null);
  let eta = '--:--';
  if (startTime && data.progress > 0.02) {
    const elapsed = (Date.now() - startTime) / 1000;
    const totalEst = elapsed / data.progress;
    const remaining = totalEst - elapsed;
    eta = formatTime(remaining);
  }
  $('progress-stats').textContent = `${pct}% · ETA ${eta}`;
}

function handleJobComplete() {
  if (state.pollInterval) clearInterval(state.pollInterval);
  hideProcessingUI();
  $('download-section').classList.remove('hidden');
  $('download-link').href = `/api/jobs/${state.currentJobId}/download`;
  setButtonsEnabled(true);
}

function handleJobFailed(error) {
  if (state.pollInterval) clearInterval(state.pollInterval);
  hideProcessingUI();
  showError(error || 'Conversion failed');
  setButtonsEnabled(true);
}

async function restorePreviewFromJob(job) {
  const formData = new FormData();
  formData.append('upload_path', job.upload_path);
  formData.append('depth_intensity', job.depth_intensity);
  formData.append('convergence', job.convergence);
  formData.append('eye_separation', job.eye_separation);

  const res = await fetch('/api/preview', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Preview failed');
  await loadPreviewData(data);
}

async function resumeSessionOnLoad() {
  const jobId = getJobIdFromUrl();
  if (jobId) {
    await restoreSession(jobId);
    return;
  }

  try {
    const res = await fetch('/api/jobs/active');
    const data = await res.json();
    if (res.ok && data.job_id) {
      await restoreSession(data.job_id);
    }
  } catch {
    // No active job to restore
  }
}

async function restoreSession(jobId) {
  hideError();
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    const job = await res.json();
    if (!res.ok) throw new Error(job.detail || 'Job not found');

    state.currentJobId = job.job_id;
    state.uploadPath = job.upload_path;
    state.videoInfo = job.video_info;
    state.filename = job.filename;
    setJobUrl(job.job_id);
    applyJobParams(job);

    if (job.video_info) {
      updateVideoInfoDisplay({ name: job.filename }, job.video_info);
      $('segment-end').max = job.video_info.duration_sec;
      $('segment-start').max = job.video_info.duration_sec;
    }

    await restorePreviewFromJob(job);

    if (job.status === 'completed') {
      handleJobComplete();
    } else if (job.status === 'failed') {
      handleJobFailed(job.error);
    } else {
      state.conversionStartTime = job.started_at ? job.started_at * 1000 : Date.now();
      showProcessingUI();
      updateProgressUI(job);
      pollJobStatus();
    }
  } catch (err) {
    showError(err.message);
  }
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateVideoInfoDisplay(file, info) {
  const html = `
    <strong>${file.name}</strong>
    ${info.width}×${info.height} · ${info.fps.toFixed(1)} FPS · ${info.duration_sec.toFixed(1)}s · ${info.size_mb.toFixed(1)} MB
  `;
  ['video-info', 'video-info-mobile'].forEach((id) => {
    const el = $(id);
    el.innerHTML = html;
    el.classList.remove('hidden');
  });
}

/* ── API ──────────────────────────────────────────────── */
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const badge = $('gpu-status');
    if (data.cuda_available) {
      badge.textContent = `GPU · ${data.gpu}`;
      badge.classList.add('gpu-active');
    } else {
      badge.textContent = 'CPU Mode';
      badge.classList.add('gpu-cpu');
    }
  } catch {
    $('gpu-status').textContent = 'Offline';
  }
}

async function uploadFile(file) {
  hideError();
  if (state.pollInterval) clearInterval(state.pollInterval);
  state.currentJobId = null;
  state.conversionStartTime = null;
  clearJobUrl();
  hideProcessingUI();
  $('download-section').classList.add('hidden');

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Upload failed');

  state.uploadPath = data.path;
  state.videoInfo = data.video_info;
  state.filename = data.filename;

  const info = data.video_info;
  updateVideoInfoDisplay({ name: data.filename }, info);

  $('segment-end').value = info.duration_sec.toFixed(1);
  $('segment-end').max = info.duration_sec;
  $('segment-start').max = info.duration_sec;

  setButtonsEnabled(true);
}

function handleFile(file) {
  if (!file) return;
  uploadFile(file).catch((err) => showError(err.message));
}

function getParams() {
  return {
    depth_intensity: $('depth-intensity').value,
    convergence: $('convergence').value,
    eye_separation: $('eye-separation').value,
  };
}

async function updatePreview() {
  if (!state.uploadPath) return;
  hideError();
  const btn = $('preview-btn');
  btn.disabled = true;
  if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
  btn.innerHTML = 'Generating...';

  const formData = new FormData();
  formData.append('upload_path', state.uploadPath);
  Object.entries(getParams()).forEach(([k, v]) => formData.append(k, v));

  try {
    const res = await fetch('/api/preview', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Preview failed');
    await loadPreviewData(data);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml || 'Update Preview';
  }
}

async function startConversion() {
  if (!state.uploadPath) return;
  hideError();
  showProcessingUI();
  state.conversionStartTime = Date.now();

  const formData = new FormData();
  formData.append('upload_path', state.uploadPath);
  Object.entries(getParams()).forEach(([k, v]) => formData.append(k, v));
  formData.append('use_segment', $('use-segment').checked);
  formData.append('segment_start', $('segment-start').value);
  formData.append('segment_end', $('segment-end').value);
  formData.append('filename', state.filename || 'video');

  try {
    const res = await fetch('/api/convert', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Conversion failed');

    state.currentJobId = data.job_id;
    setJobUrl(data.job_id);
    pollJobStatus();
  } catch (err) {
    showError(err.message);
    setButtonsEnabled(true);
    hideProcessingUI();
  }
}

function pollJobStatus() {
  if (state.pollInterval) clearInterval(state.pollInterval);

  state.pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/jobs/${state.currentJobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      if (data.started_at && !state.conversionStartTime) {
        state.conversionStartTime = data.started_at * 1000;
      }
      updateProgressUI(data);

      if (data.status === 'completed') {
        handleJobComplete();
      } else if (data.status === 'failed') {
        handleJobFailed(data.error);
      }
    } catch (err) {
      if (state.pollInterval) clearInterval(state.pollInterval);
      hideProcessingUI();
      showError(err.message);
      setButtonsEnabled(true);
    }
  }, 1500);
}

/* ── Upload Bindings ──────────────────────────────────── */
function bindUpload() {
  const setups = [
    { zone: 'drop-zone', input: 'file-input' },
    { zone: 'drop-zone-mobile', input: 'file-input-mobile' },
  ];

  setups.forEach(({ zone, input }) => {
    const dropZone = $(zone);
    const fileInput = $(input);
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      handleFile(e.dataTransfer.files[0]);
    });
  });

  const browseBtn = $('browse-btn');
  if (browseBtn) {
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      $('file-input').click();
    });
  }
}

function bindSegment() {
  $('use-segment').addEventListener('change', (e) => {
    $('segment-controls').classList.toggle('hidden', !e.target.checked);
  });
}

/* ── Init ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkHealth();
  bindSliders();
  bindSettingCards();
  bindViewToggle();
  bindUpload();
  bindSegment();
  initBottomSheet();

  $('theme-toggle').addEventListener('click', toggleTheme);
  $('preview-btn').addEventListener('click', updatePreview);
  $('convert-btn-desktop').addEventListener('click', startConversion);
  $('convert-btn-fab').addEventListener('click', startConversion);

  window.addEventListener('resize', () => {
    if (state.previewImage) renderPreview();
  });

  resumeSessionOnLoad();
});
