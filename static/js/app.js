const state = {
  uploadPath: null,
  videoInfo: null,
  currentJobId: null,
  pollInterval: null,
};

const $ = (id) => document.getElementById(id);

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
  $('convert-btn').disabled = !enabled;
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const badge = $('gpu-status');
    if (data.cuda_available) {
      badge.textContent = `GPU: ${data.gpu}`;
      badge.classList.add('gpu-active');
    } else {
      badge.textContent = 'CPU mode (slower)';
      badge.classList.add('gpu-cpu');
    }
  } catch {
    $('gpu-status').textContent = 'Server offline';
  }
}

async function uploadFile(file) {
  hideError();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Upload failed');

  state.uploadPath = data.path;
  state.videoInfo = data.video_info;

  const info = data.video_info;
  $('video-info').innerHTML = `
    <strong>${file.name}</strong><br>
    ${info.width}×${info.height} · ${info.fps.toFixed(1)} FPS · ${info.duration_sec.toFixed(1)}s · ${info.size_mb.toFixed(1)} MB
  `;
  $('video-info').classList.remove('hidden');

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
  $('preview-btn').disabled = true;
  $('preview-btn').textContent = 'Generating...';

  const formData = new FormData();
  formData.append('upload_path', state.uploadPath);
  Object.entries(getParams()).forEach(([k, v]) => formData.append(k, v));

  try {
    const res = await fetch('/api/preview', { method: 'POST', body: formData });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || 'Preview failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const img = $('preview-image');
    img.src = url;
    img.classList.remove('hidden');
    document.querySelector('.preview-placeholder').classList.add('hidden');
  } catch (err) {
    showError(err.message);
  } finally {
    $('preview-btn').disabled = false;
    $('preview-btn').textContent = 'Update Preview';
  }
}

async function startConversion() {
  if (!state.uploadPath) return;
  hideError();
  $('download-section').classList.add('hidden');
  $('progress-section').classList.remove('hidden');
  $('convert-btn').disabled = true;
  $('preview-btn').disabled = true;

  const formData = new FormData();
  formData.append('upload_path', state.uploadPath);
  Object.entries(getParams()).forEach(([k, v]) => formData.append(k, v));
  formData.append('use_segment', $('use-segment').checked);
  formData.append('segment_start', $('segment-start').value);
  formData.append('segment_end', $('segment-end').value);

  try {
    const res = await fetch('/api/convert', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Conversion failed');

    state.currentJobId = data.job_id;
    pollJobStatus();
  } catch (err) {
    showError(err.message);
    $('convert-btn').disabled = false;
    $('preview-btn').disabled = false;
    $('progress-section').classList.add('hidden');
  }
}

function pollJobStatus() {
  if (state.pollInterval) clearInterval(state.pollInterval);

  state.pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/jobs/${state.currentJobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      const pct = Math.round(data.progress * 100);
      $('progress-fill').style.width = `${pct}%`;
      $('progress-percent').textContent = `${pct}%`;
      $('progress-message').textContent = data.message;

      if (data.status === 'completed') {
        clearInterval(state.pollInterval);
        $('progress-section').classList.add('hidden');
        $('download-section').classList.remove('hidden');
        $('download-link').href = `/api/jobs/${state.currentJobId}/download`;
        setButtonsEnabled(true);
      } else if (data.status === 'failed') {
        clearInterval(state.pollInterval);
        $('progress-section').classList.add('hidden');
        showError(data.error || 'Conversion failed');
        setButtonsEnabled(true);
      }
    } catch (err) {
      clearInterval(state.pollInterval);
      showError(err.message);
      setButtonsEnabled(true);
    }
  }, 1500);
}

function bindSliders() {
  const bindings = [
    ['depth-intensity', 'depth-value'],
    ['convergence', 'convergence-value'],
    ['eye-separation', 'eye-value'],
  ];
  bindings.forEach(([inputId, labelId]) => {
    $(inputId).addEventListener('input', (e) => {
      $(labelId).textContent = e.target.value;
    });
  });
}

function bindUpload() {
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  $('browse-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

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
}

function bindSegment() {
  $('use-segment').addEventListener('change', (e) => {
    $('segment-controls').classList.toggle('hidden', !e.target.checked);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  bindSliders();
  bindUpload();
  bindSegment();
  $('preview-btn').addEventListener('click', updatePreview);
  $('convert-btn').addEventListener('click', startConversion);
});
