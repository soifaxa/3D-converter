/**
 * WebGL depth-parallax viewer (Tiefling-style interactive 3D preview).
 */
class ParallaxViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!this.gl) throw new Error('WebGL not supported');

    this.program = this._createProgram();
    this.textures = { color: null, depth: null };
    this.imageAspect = 16 / 9;
    this.mouse = { x: 0, y: 0 };
    this.targetMouse = { x: 0, y: 0 };
    this.strength = 0.035;
    this.idleEnabled = true;
    this.isPointerOver = false;
    this.rafId = null;
    this.idleStart = performance.now();
    this._boundResize = () => this.resize();
    this._onPointerMove = (e) => this._handlePointer(e);
    this._onPointerLeave = () => {
      this.isPointerOver = false;
    };
    this._onPointerEnter = () => {
      this.isPointerOver = true;
    };

    this._initBuffers();
    this._startLoop();
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const msg = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${msg}`);
    }
    return shader;
  }

  _createProgram() {
    const gl = this.gl;
    const vsSource = `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
    const fsSource = `
      precision mediump float;
      uniform sampler2D uColor;
      uniform sampler2D uDepth;
      uniform vec2 uMouse;
      uniform float uStrength;
      varying vec2 vUv;

      vec2 mirrored(vec2 uv) {
        vec2 m = mod(uv, 2.0);
        return mix(m, 2.0 - m, step(1.0, m));
      }

      void main() {
        float depth = texture2D(uDepth, vUv).r;
        vec2 offset = uMouse * (depth - 0.5) * uStrength;
        vec2 sampleUv = mirrored(vUv + offset);
        gl_FragColor = texture2D(uColor, sampleUv);
      }
    `;

    const vs = this._compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  _initBuffers() {
    const gl = this.gl;
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.aPosition = gl.getAttribLocation(this.program, 'aPosition');
    this.uColor = gl.getUniformLocation(this.program, 'uColor');
    this.uDepth = gl.getUniformLocation(this.program, 'uDepth');
    this.uMouse = gl.getUniformLocation(this.program, 'uMouse');
    this.uStrength = gl.getUniformLocation(this.program, 'uStrength');
  }

  _createTexture(image, unit) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  bindInteraction(container) {
    this.container = container;
    container.addEventListener('pointermove', this._onPointerMove);
    container.addEventListener('pointerleave', this._onPointerLeave);
    container.addEventListener('pointerenter', this._onPointerEnter);
    window.addEventListener('resize', this._boundResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(container);
    }
  }

  unbindInteraction() {
    if (!this.container) return;
    this.container.removeEventListener('pointermove', this._onPointerMove);
    this.container.removeEventListener('pointerleave', this._onPointerLeave);
    this.container.removeEventListener('pointerenter', this._onPointerEnter);
    window.removeEventListener('resize', this._boundResize);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  _handlePointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this.targetMouse.x = nx;
    this.targetMouse.y = ny;
  }

  setStrengthFromDepthIntensity(depthIntensity) {
    this.strength = 0.02 + parseFloat(depthIntensity) * 0.08;
  }

  async loadImages(originalSrc, depthSrc) {
    const [original, depth] = await Promise.all([
      ParallaxViewer._loadImage(originalSrc),
      ParallaxViewer._loadImage(depthSrc),
    ]);

    const gl = this.gl;
    if (this.textures.color) gl.deleteTexture(this.textures.color);
    if (this.textures.depth) gl.deleteTexture(this.textures.depth);

    this.textures.color = this._createTexture(original, 0);
    this.textures.depth = this._createTexture(depth, 1);
    this.imageAspect = original.naturalWidth / original.naturalHeight;
    this.resize();
  }

  static _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load preview image'));
      img.src = src;
    });
  }

  resize() {
    const container = this.container || this.canvas.closest('.sbs-preview-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const maxW = rect.width;
    const maxH = rect.height;
    if (maxW <= 0 || maxH <= 0) {
      requestAnimationFrame(() => this.resize());
      return;
    }

    const scale = Math.min(maxW / this.imageAspect, maxH);
    const drawW = Math.max(1, Math.round(this.imageAspect * scale));
    const drawH = Math.max(1, Math.round(scale));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = drawW * dpr;
    this.canvas.height = drawH * dpr;
    this.canvas.style.width = `${drawW}px`;
    this.canvas.style.height = `${drawH}px`;

    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  _startLoop() {
    const tick = (now) => {
      if (!this.isPointerOver && this.idleEnabled) {
        const t = (now - this.idleStart) * 0.001;
        this.targetMouse.x = Math.sin(t * 0.7) * 0.35;
        this.targetMouse.y = Math.cos(t * 0.5) * 0.2;
      }

      this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.08;
      this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.08;
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  render() {
    const gl = this.gl;
    if (!this.textures.color || !this.textures.depth) return;

    gl.useProgram(this.program);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.color);
    gl.uniform1i(this.uColor, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.depth);
    gl.uniform1i(this.uDepth, 1);

    gl.uniform2f(this.uMouse, this.mouse.x, this.mouse.y);
    gl.uniform1f(this.uStrength, this.strength);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.aPosition);
    gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.unbindInteraction();
    const gl = this.gl;
    if (this.textures.color) gl.deleteTexture(this.textures.color);
    if (this.textures.depth) gl.deleteTexture(this.textures.depth);
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.positionBuffer);
  }
}

window.ParallaxViewer = ParallaxViewer;
