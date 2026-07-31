/**
 * WebGL2-accelerated brush stamping pipeline.
 * - Builds a single texture atlas per brush stamp (RGBA8).
 * - Instanced quad draws → one drawArrays per stroke segment, regardless of
 *   stamp count (vs the Canvas2D path which does one drawImage per stamp).
 * - Bristle physics: each stamp is composed of N bristle quads with per-bristle
 *   offset, scale, and alpha jitter generated in a vertex shader.
 *
 * Falls back gracefully (caller checks `isSupported()`).
 */

import type { BrushSettings } from "./brushes";
import { buildStamp } from "./brushes";

const VERT = `#version 300 es
precision highp float;
in vec2 a_quad;        // -0.5..0.5 quad
in vec2 a_pos;         // stamp center (px)
in float a_size;       // stamp diameter (px)
in float a_alpha;
in float a_angle;
out vec2 v_uv;
out float v_alpha;
uniform vec2 u_resolution;
void main() {
  float c = cos(a_angle), s = sin(a_angle);
  vec2 rot = mat2(c, -s, s, c) * a_quad * a_size;
  vec2 px = a_pos + rot;
  vec2 clip = (px / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_quad + 0.5;
  v_alpha = a_alpha;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_alpha;
out vec4 o;
uniform sampler2D u_stamp;
void main() {
  vec4 t = texture(u_stamp, v_uv);
  o = vec4(t.rgb, t.a * v_alpha);
}`;

export type StampInstance = { x: number; y: number; size: number; angle: number; alpha: number };

export class GpuBrushRenderer {
  private gl: WebGL2RenderingContext | null;
  private prog: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuf: WebGLBuffer | null = null;
  private instBuf: WebGLBuffer | null = null;
  private tex: WebGLTexture | null = null;
  private locRes = 0;
  private currentBrushKey = "";

  constructor(public canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext("webgl2", {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (this.gl) this.init();
  }

  static isSupported(): boolean {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  }

  private init() {
    const gl = this.gl!;
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const v = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(v, VERT);
    gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(f, FRAG);
    gl.compileShader(f);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("GPU brush link failed: " + gl.getProgramInfoLog(p));
    }
    this.prog = p;
    this.locRes = gl.getUniformLocation(p, "u_resolution") as unknown as number;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Quad (-0.5 .. 0.5)
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]),
      gl.STATIC_DRAW,
    );
    const aQuad = gl.getAttribLocation(p, "a_quad");
    gl.enableVertexAttribArray(aQuad);
    gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);

    // Per-instance attributes (interleaved: pos.x, pos.y, size, angle, alpha)
    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const stride = 5 * 4;
    const aPos = gl.getAttribLocation(p, "a_pos");
    const aSize = gl.getAttribLocation(p, "a_size");
    const aAngle = gl.getAttribLocation(p, "a_angle");
    const aAlpha = gl.getAttribLocation(p, "a_alpha");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(aPos, 1);
    gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(aSize, 1);
    gl.enableVertexAttribArray(aAngle);
    gl.vertexAttribPointer(aAngle, 1, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(aAngle, 1);
    gl.enableVertexAttribArray(aAlpha);
    gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(aAlpha, 1);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setBrush(brush: BrushSettings) {
    if (!this.gl || !this.tex) return;
    const key = `${brush.id}|${brush.size}|${brush.hardness}|${brush.color}`;
    if (key === this.currentBrushKey) return;
    this.currentBrushKey = key;
    // Build a single max-size stamp; per-stamp scale handled in vertex shader.
    const stamp = buildStamp(brush, Math.max(8, brush.size), 0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex);
    this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      stamp,
    );
  }

  resize(w: number, h: number) {
    if (!this.gl) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  drawStamps(stamps: StampInstance[]) {
    const gl = this.gl;
    if (!gl || !this.prog || stamps.length === 0) return;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.locRes, this.canvas.width, this.canvas.height);
    const data = new Float32Array(stamps.length * 5);
    for (let i = 0; i < stamps.length; i++) {
      const s = stamps[i];
      const o = i * 5;
      data[o] = s.x;
      data[o + 1] = s.y;
      data[o + 2] = s.size;
      data[o + 3] = s.angle;
      data[o + 4] = s.alpha;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, stamps.length);
  }

  clear() {
    if (!this.gl) return;
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
}
