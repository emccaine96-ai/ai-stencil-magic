/**
 * Tile-based canvas backing store — the heart of the Phase 6 GPU pipeline.
 * Document divided into TILE_SIZE × TILE_SIZE tiles, each its own offscreen
 * canvas. Strokes only paint into intersecting tiles; viewport composites
 * only visible tiles. Enables 16k² documents on a phone.
 */

export const TILE_SIZE = 256;

export type TileKey = string;

export type TileSnapshot = { key: TileKey; data: ImageData };

export class TileEngine {
  readonly width: number;
  readonly height: number;
  readonly cols: number;
  readonly rows: number;
  private tiles = new Map<TileKey, HTMLCanvasElement>();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / TILE_SIZE);
    this.rows = Math.ceil(height / TILE_SIZE);
  }

  static key(tx: number, ty: number): TileKey { return tx + "," + ty; }

  getTile(tx: number, ty: number): HTMLCanvasElement {
    const k = TileEngine.key(tx, ty);
    let c = this.tiles.get(k);
    if (!c) {
      c = document.createElement("canvas");
      c.width = TILE_SIZE; c.height = TILE_SIZE;
      this.tiles.set(k, c);
    }
    return c;
  }

  hasTile(tx: number, ty: number) { return this.tiles.has(TileEngine.key(tx, ty)); }

  tilesInRect(x: number, y: number, w: number, h: number) {
    const x0 = Math.max(0, Math.floor(x / TILE_SIZE));
    const y0 = Math.max(0, Math.floor(y / TILE_SIZE));
    const x1 = Math.min(this.cols - 1, Math.floor((x + w) / TILE_SIZE));
    const y1 = Math.min(this.rows - 1, Math.floor((y + h) / TILE_SIZE));
    const out: { tx: number; ty: number }[] = [];
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) out.push({ tx, ty });
    return out;
  }

  snapshot(tx: number, ty: number): TileSnapshot {
    const c = this.getTile(tx, ty);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    return { key: TileEngine.key(tx, ty), data: ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE) };
  }

  restore(snap: TileSnapshot) {
    const [tx, ty] = snap.key.split(",").map(Number);
    const c = this.getTile(tx, ty);
    c.getContext("2d")!.putImageData(snap.data, 0, 0);
  }

  composite(dest: CanvasRenderingContext2D, viewX: number, viewY: number, viewW: number, viewH: number, scale: number) {
    const docX = viewX / scale, docY = viewY / scale;
    const docW = viewW / scale, docH = viewH / scale;
    for (const { tx, ty } of this.tilesInRect(docX, docY, docW, docH)) {
      if (!this.hasTile(tx, ty)) continue;
      const c = this.getTile(tx, ty);
      const dx = tx * TILE_SIZE * scale - viewX;
      const dy = ty * TILE_SIZE * scale - viewY;
      dest.drawImage(c, dx, dy, TILE_SIZE * scale, TILE_SIZE * scale);
    }
  }

  flatten(): HTMLCanvasElement {
    const out = document.createElement("canvas");
    out.width = this.width; out.height = this.height;
    const ctx = out.getContext("2d")!;
    for (const [k, c] of this.tiles) {
      const [tx, ty] = k.split(",").map(Number);
      ctx.drawImage(c, tx * TILE_SIZE, ty * TILE_SIZE);
    }
    return out;
  }

  loadFromImage(img: HTMLImageElement | HTMLCanvasElement) {
    this.tiles.clear();
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const c = this.getTile(tx, ty);
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
        ctx.drawImage(img, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  totalTiles() { return this.tiles.size; }
}
