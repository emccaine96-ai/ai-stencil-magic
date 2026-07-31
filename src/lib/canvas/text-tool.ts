// Canvas text rendering utility for the Vault editor.
// Frame-agnostic: pass a 2D context and options; it draws once.

export interface TextOptions {
  text: string;
  x: number;
  y: number;
  font?: string; // e.g. "Inter, system-ui, sans-serif"
  size?: number; // px
  weight?: number | string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  letterSpacing?: number; // px, applied manually per glyph
  lineHeight?: number; // multiplier
  maxWidth?: number; // wrap width in px
  stroke?: { color: string; width: number } | null;
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number } | null;
  rotation?: number; // radians, around (x,y)
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth?: number): string[] {
  const paragraphs = text.split(/\r?\n/);
  if (!maxWidth) return paragraphs;
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function drawLineWithSpacing(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  spacing: number,
  stroke: TextOptions["stroke"],
) {
  if (!spacing) {
    if (stroke) ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    return;
  }
  // Manual per-glyph advance for letter-spacing support.
  const align = ctx.textAlign;
  // Compute total width including spacing to honor align.
  let total = 0;
  for (let i = 0; i < line.length; i++) {
    total += ctx.measureText(line[i]).width;
    if (i < line.length - 1) total += spacing;
  }
  let cursor = x;
  if (align === "center") cursor = x - total / 2;
  else if (align === "right" || align === "end") cursor = x - total;
  const savedAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (stroke) ctx.strokeText(ch, cursor, y);
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = savedAlign;
}

export function drawText(ctx: CanvasRenderingContext2D, opts: TextOptions): void {
  const {
    text,
    x,
    y,
    font = "Inter, system-ui, sans-serif",
    size = 48,
    weight = 600,
    color = "#000000",
    align = "left",
    baseline = "top",
    letterSpacing = 0,
    lineHeight = 1.2,
    maxWidth,
    stroke = null,
    shadow = null,
    rotation = 0,
  } = opts;

  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  if (stroke) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineJoin = "round";
  }
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }
  if (rotation) {
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.translate(-x, -y);
  }
  const lines = wrapLines(ctx, text, maxWidth);
  const step = size * lineHeight;
  for (let i = 0; i < lines.length; i++) {
    drawLineWithSpacing(ctx, lines[i], x, y + i * step, letterSpacing, stroke);
  }
  ctx.restore();
}

export function measureText(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: Pick<TextOptions, "font" | "size" | "weight" | "letterSpacing" | "lineHeight" | "maxWidth">,
): { width: number; height: number; lines: string[] } {
  const {
    font = "Inter, system-ui, sans-serif",
    size = 48,
    weight = 600,
    letterSpacing = 0,
    lineHeight = 1.2,
    maxWidth,
  } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  const lines = wrapLines(ctx, text, maxWidth);
  let width = 0;
  for (const line of lines) {
    let w = ctx.measureText(line).width;
    if (letterSpacing) w += letterSpacing * Math.max(0, line.length - 1);
    if (w > width) width = w;
  }
  ctx.restore();
  return { width, height: lines.length * size * lineHeight, lines };
}
