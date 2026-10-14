const { p, dock, paint, px, size, hash, undoBtn, sleep, t, dims } = globalThis.H;
const W = dims.w, Hh = dims.h;
const reset = async () => { await paint(); await sleep(150); };
const undo = async () => { await undoBtn(); await sleep(300); };
const commit = async () => { /* paint() draws outside the undo stack, so push one via a no-op undoable action */ };

// ---------- GEOMETRY ----------
await reset();
{ const base = await hash();
  await dock('Tools', 'Flip H'); const h1 = await hash(); t('flipH changes pixels', h1 !== base);
  await dock('Tools', 'Flip H'); t('flipH twice restores exactly', (await hash()) === base); }

// ---------- EFFECTS (one tap, measured) ----------
const effect = async (label, check) => { await reset(); const before = await hash(); const ok = await dock('Effects', label); await sleep(300); const after = await hash(); await check({ ok, before, after }); };
await effect('Blur', ({ ok, before, after }) => t('Blur: clicked + pixels changed', ok && after !== before));
await effect('Sharpen', ({ ok, before, after }) => t('Sharpen: clicked + pixels changed', ok && after !== before));
await effect('Grain', ({ ok, before, after }) => t('Grain: clicked + pixels changed', ok && after !== before));
await effect('Pixelate', ({ ok, before, after }) => t('Pixelate: clicked + pixels changed', ok && after !== before));
await effect('Sepia', ({ ok, before, after }) => t('Sepia: clicked + pixels changed', ok && after !== before));
await effect('Glow', ({ ok, before, after }) => t('Glow: clicked + pixels changed', ok && after !== before));
await effect('Chromatic', ({ ok, before, after }) => t('Chromatic: clicked + pixels changed', ok && after !== before));
await effect('Lens Flare', ({ ok, before, after }) => t('Lens Flare: clicked + pixels changed', ok && after !== before));
await effect('Vignette', async ({ ok, before, after }) => { const corner = await px(2, 2); t('Vignette: corner darker, centre intact', ok && corner[0] < 255 && (await px(W / 2, Hh / 2))[0] === 255, `corner ${corner[0]}`); });
await effect('Edge', async ({ ok }) => { const paper = await px(W / 2, Hh / 2); t('Edge: result is white paper with dark lines', ok && paper[0] > 240); });
await effect('Thermal', async ({ ok }) => { const inkPx = await px(100, 75); t('Thermal purple: black bar becomes purple ink', ok && inkPx[2] > inkPx[1] + 60, `rgb ${inkPx.slice(0, 3)}`); });
await effect('Thermal Blue', async ({ ok }) => { const inkPx = await px(100, 75); t('Thermal blue: black bar becomes blue ink', ok && inkPx[2] > inkPx[0] + 60, `rgb ${inkPx.slice(0, 3)}`); });

// ---------- ROTATE changes canvas size, undo restores it ----------
await reset();
{ const hasRotate = await dock('Tools', 'Rotate');
  t('Rotate button exists in dock', hasRotate, hasRotate ? '' : '(dock has no Rotate entry, only Flip H)'); }
console.log('\ncanvas size now', await size());

// ---------- ROTATE: now reachable. Use a NON-square canvas to prove size handling + undo ----------
await reset();
{ // make the document non-square by flipping through the real code path is not possible, so shrink the canvas the way an imported doc would be
  await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); const x = c.getContext('2d'); const img = x.getImageData(0, 0, 1024, 600); c.width = 1024; c.height = 600; x.putImageData(img, 0, 0); });
  await sleep(200);
  // pushUndo happens on the first action, so do a flip to seed a snapshot at the new size
  await dock('Tools', 'Flip H'); await dock('Tools', 'Flip H');
  const s0 = await size(); t('canvas is non-square before rotate', s0[0] === 1024 && s0[1] === 600, s0.join('x'));
  const okR = await dock('Tools', 'Rotate'); t('Rotate button found', okR);
  const s1 = await size(); t('Rotate swaps width and height', s1[0] === 600 && s1[1] === 1024, s1.join('x'));
  await undo(); const s2 = await size(); t('Undo after rotate restores 1024x600', s2[0] === 1024 && s2[1] === 600, s2.join('x'));
  await dock('Tools', 'Rotate'); await dock('Tools', 'Rotate'); await dock('Tools', 'Rotate'); await dock('Tools', 'Rotate');
  const s3 = await size(); t('Rotate x4 returns to 1024x600', s3[0] === 1024 && s3[1] === 600, s3.join('x')); }

// ---------- FLIP V ----------
await reset();
{ const okV = await dock('Tools', 'Flip V'); t('Flip V button found', okV);
  const orig = await px(100, 75), mir = await px(100, Hh - 75 - 1);
  t('Flip V moved the bar to the bottom', okV && orig[0] > 225 && mir[0] < 30, `top ${orig[0]} bottom ${mir[0]}`); }

// ---------- FILTER GALLERY ----------
await reset();
{ const open = await dock('Effects', 'Filters'); t('Filters button now exists in Effects', open);
  await sleep(500);
  const modal = await p.evaluate(() => /Filter Gallery/.test(document.body.innerText)); t('Filter Gallery modal opens', modal);
  const tiles = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.querySelector('canvas')).length); t('gallery shows preset tiles', tiles >= 20, `${tiles} tiles`);
  const before = await hash();
  await p.evaluate(() => { const tile = [...document.querySelectorAll('button')].filter(b => b.querySelector('canvas') && /Vivid|Punch/.test(b.innerText))[0]; tile?.click(); });
  await sleep(200);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Apply')?.click()); await sleep(600);
  t('Applying a preset changes pixels', (await hash()) !== before);
  t('modal closes after Apply', !(await p.evaluate(() => /Filter Gallery/.test(document.body.innerText)))); }

// ---------- RETOUCH: smudge drag really smears ----------
await reset();
{ await dock('Retouch', 'Smudge'); await sleep(300);
  const hint = await p.evaluate(() => /Smudge/.test(document.body.innerText)); t('Smudge mode shows its Done pill', hint);
  const before = await hash();
  // drag across the black bar's edge in screen space, using the on-screen canvas rect
  const rect = await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1).getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  const sx = rect.x + (100 / 1024) * rect.w, sy = rect.y + (75 / 1024) * rect.h;
  await p.mouse.move(sx - 20, sy); await p.mouse.down(); for (let i = 0; i <= 12; i++) await p.mouse.move(sx - 20 + i * 4, sy + i * 1.5); await p.mouse.up(); await sleep(500);
  t('Smudge drag changed pixels', (await hash()) !== before); }

// ---------- UPSCALE 6K: real size, real time, memory-bounded undo ----------
await reset();
{ // use a smaller doc so the test is quick: 512x384 -> long edge 6000 => 6000x4500 = 27M px (under the cap)
  await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); const x = c.getContext('2d'); const img = x.getImageData(0, 0, 512, 384); c.width = 512; c.height = 384; x.putImageData(img, 0, 0); });
  await dock('Tools', 'Flip H'); await dock('Tools', 'Flip H'); // seed undo at this size
  const t0 = Date.now();
  const okU = await dock('Tools', 'Upscale 6K'); t('Upscale 6K button found', okU);
  // wait for the busy overlay to clear
  for (let i = 0; i < 120; i++) { const busy = await p.evaluate(() => !!document.querySelector('[role="status"]')); if (!busy) break; await sleep(500); }
  const s = await size(); const secs = ((Date.now() - t0) / 1000).toFixed(1);
  t(PLAN === 'pro' ? 'Upscale long edge reaches 6000px' : 'FREE plan: Upscale is blocked, canvas unchanged', PLAN === 'pro' ? Math.max(...s) === 6000 : (s[0] === 512 && s[1] === 384), `${s.join('x')} in ${secs}s`);
  t('Upscale keeps aspect ratio', Math.abs(s[0] / s[1] - 512 / 384) < 0.01);
  const dark = await px(Math.round(s[0] * (100 / 512)), Math.round(s[1] * (75 / 384)));
  t('Upscaled content preserved (bar still black)', dark[0] < 40, `pixel ${dark[0]}`);
  await undo(); const s2 = await size(); t('Undo after upscale restores 512x384', s2[0] === 512 && s2[1] === 384, s2.join('x')); }

// ---------- remaining RETOUCH tools: each must respond to a real drag ----------
const drag = async (fx, fy, dx, dy, steps = 14) => {
  const r = await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1).getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  const cw = (await size())[0], ch = (await size())[1];
  const sx = r.x + (fx / cw) * r.w, sy = r.y + (fy / ch) * r.h;
  await p.mouse.move(sx, sy); await p.mouse.down();
  for (let i = 0; i <= steps; i++) await p.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps);
  await p.mouse.up(); await sleep(450);
};
await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); const x = c.getContext('2d'); const img = x.getImageData(0, 0, 1024, 1024); c.width = 1024; c.height = 1024; x.putImageData(img, 0, 0); });
for (const [label, name] of [['Liquify Push', 'liquify push'], ['Inflate', 'inflate'], ['Deflate', 'deflate'], ['Heal', 'heal']]) {
  await reset(); await dock('Retouch', label); await sleep(250);
  const before = await hash();
  await drag(120, 75, 40, 10);
  t(`${name}: drag changed pixels`, (await hash()) !== before);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /· Done/.test(b.innerText))?.click()); await sleep(200);
}
// clone stamp: first tap sets source, second drag paints a copy
await reset(); await dock('Retouch', 'Clone Stamp'); await sleep(250);
{ const before = await hash();
  await drag(100, 75, 0, 0, 1);           // tap on the black bar = source
  const mid = await hash(); t('clone: first tap only sets source (no pixel change)', mid === before);
  await drag(300, 400, 30, 0);            // paint on white paper
  const painted = await px(310, 400); t('clone: painting copies the black bar onto white paper', painted[0] < 120, `pixel ${painted[0]}`); }
await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /· Done/.test(b.innerText))?.click()); await sleep(200);

// ---------- retouch must NOT leak into brush mode ----------
await reset();
{ await dock('Retouch', 'Smudge'); await sleep(200);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /· Done/.test(b.innerText))?.click()); await sleep(200);
  const gone = await p.evaluate(() => !/· Done/.test(document.body.innerText)); t('Done pill exits retouch mode', gone);
  const before = await hash(); await drag(300, 500, 40, 0);
  t('after Done, a drag pans (does NOT retouch pixels)', (await hash()) === before); }

// ---------- two-finger gesture cancels a half-made stroke ----------
await reset();
{ await dock('Retouch', 'Smudge'); await sleep(200);
  const before = await hash();
  const r = await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1).getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
  await p.touchscreen.touchStart(r.x, r.y); 
  const client = await p.target().createCDPSession();
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }, { x: r.x + 60, y: r.y, id: 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x + 20, y: r.y + 10, id: 1 }, { x: r.x + 80, y: r.y, id: 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
  t('pinch gesture does not apply a half stroke', (await hash()) === before); }

// ---------- REMOVE BG ----------
await reset();
{ // subject: a dark filled circle on white paper
  await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#222'; x.beginPath(); x.arc(512, 512, 200, 0, 7); x.fill(); });
  await dock('Tools', 'Flip H'); await dock('Tools', 'Flip H');
  const okB = await dock('Remove BG', 'Remove BG'); t('Remove BG found', okB);
  for (let i = 0; i < 60; i++) { if (!(await p.evaluate(() => !!document.querySelector('[role="status"]')))) break; await sleep(400); }
  const corner = await px(10, 10), centre = await px(512, 512);
  t(PLAN === 'pro' ? 'Remove BG: paper corner becomes transparent' : 'FREE plan: Remove BG is blocked, pixels unchanged', PLAN === 'pro' ? corner[3] < 20 : corner[3] === 255, `alpha ${corner[3]}`);
  t('Remove BG: subject stays opaque', centre[3] > 235 && centre[0] < 80, `alpha ${centre[3]} r ${centre[0]}`);
  await undo(); const back = await px(10, 10); t('Undo restores the paper', back[3] === 255 && back[0] === 255); }

// ---------- MAGIC WAND (Cutout) ----------
const tapAt = async (fx, fy) => {
  const r = await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1).getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  const [cw, ch] = await size();
  await p.mouse.click(r.x + (fx / cw) * r.w, r.y + (fy / ch) * r.h); await sleep(500);
};
const scene = async () => p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#222'; x.beginPath(); x.arc(512, 512, 200, 0, 7); x.fill(); x.fillStyle = '#222'; x.fillRect(40, 40, 80, 80); });
await scene(); await dock('Tools', 'Flip H'); await dock('Tools', 'Flip H'); await scene();
{ const okW = await dock('Cutout', 'Cutout'); await sleep(300); t('Magic Wand button found', okW);
  t('wand mode shows Done pill + tolerance', await p.evaluate(() => /Wand · Done/.test(document.body.innerText) && !!document.querySelector('[aria-label="Wand tolerance"]')));
  await tapAt(512, 512);
  const c1 = await px(512, 512), paper = await px(300, 100), sq = await px(80, 80);
  t('tap on circle cuts the circle out', c1[3] === 0, `alpha ${c1[3]}`);
  t('paper is untouched by a circle tap', paper[3] === 255 && paper[0] === 255, `alpha ${paper[3]}`);
  t('separate dark square is untouched (contiguous)', sq[3] === 255, `alpha ${sq[3]}`);
  await undo(); const back = await px(512, 512); t('undo restores the circle', back[3] === 255 && back[0] === 34, `alpha ${back[3]}`);
  await tapAt(300, 100);
  const paper2 = await px(300, 100), circ2 = await px(512, 512);
  t('tap on paper clears the paper', paper2[3] === 0, `alpha ${paper2[3]}`);
  t('circle survives a paper tap', circ2[3] === 255, `alpha ${circ2[3]}`);
  await tapAt(300, 100); t('tapping transparent area is a harmless no-op', (await px(300, 100))[3] === 0);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /Wand · Done/.test(b.innerText))?.click()); await sleep(200);
  t('Wand Done exits the mode', !(await p.evaluate(() => /Wand · Done/.test(document.body.innerText))));
  const keep = await hash(); await tapAt(512, 512); t('after Done, a tap no longer cuts', (await hash()) === keep); }

// switching to another mode must drop the wand
await scene();
{ await dock('Cutout', 'Cutout'); await sleep(200);
  await dock('Retouch', 'Smudge'); await sleep(200);
  t('starting Smudge turns the wand off', !(await p.evaluate(() => /Wand · Done/.test(document.body.innerText))));
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /· Done/.test(b.innerText))?.click()); }

// ---------- LAYOUT DIALOGS: crop / resize / border / frame ----------
const setNum = async (label, value) => {
  await p.evaluate((label, value) => {
    const lab = [...document.querySelectorAll('[role="dialog"] label')].find(l => l.innerText.trim().startsWith(label));
    const inp = lab?.querySelector('input'); if (!inp) throw new Error('no field ' + label);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, String(value));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, label, value); await sleep(60);
};
const dlg = () => p.evaluate(() => !!document.querySelector('[role="dialog"]'));
const clickIn = (txt) => p.evaluate((txt) => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === txt)?.click(), txt);
const resetSize = async () => { await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); const x = c.getContext('2d'); c.width = 1024; c.height = 1024; x.fillStyle = '#fff'; x.fillRect(0, 0, 1024, 1024); }); await dock('Tools', 'Flip H'); await dock('Tools', 'Flip H'); };
const coordScene = () => p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); const x = c.getContext('2d'); const im = x.createImageData(c.width, c.height); for (let y = 0; y < c.height; y++) for (let X = 0; X < c.width; X++) { const i = (y * c.width + X) * 4; im.data[i] = X % 256; im.data[i + 1] = y % 256; im.data[i + 2] = 9; im.data[i + 3] = 255; } x.putImageData(im, 0, 0); });

await resetSize(); await coordScene(); await dock('Tools', 'Flip H'); await dock('Tools', 'Flip H'); await coordScene();
{ // CROP numeric
  await dock('Tools', 'Crop'); await sleep(300); t('Crop dialog opens', await dlg());
  await setNum('Left', 100); await setNum('Top', 50); await setNum('Width', 300); await setNum('Height', 200);
  t('dialog previews output size', await p.evaluate(() => /1024×1024 → 300×200/.test(document.querySelector('[role="dialog"]').innerText)));
  await clickIn('Apply'); await sleep(500);
  const s = await size(); t('crop result is 300x200', s[0] === 300 && s[1] === 200, s.join('x'));
  const tl = await px(0, 0), br = await px(299, 199);
  t('crop top-left is source (100,50)', tl[0] === 100 && tl[1] === 50, tl.slice(0, 3).join());
  t('crop bottom-right is source (399,249)', br[0] === (399 % 256) && br[1] === 249, br.slice(0, 3).join());
  t('dialog closed after apply', !(await dlg()));
  await undo(); const u = await size(); t('undo restores 1024x1024', u[0] === 1024 && u[1] === 1024, u.join('x')); }
{ // CROP preset
  await dock('Tools', 'Crop'); await sleep(300); await clickIn('16:9');
  t('16:9 preset previews 1024×576', await p.evaluate(() => /→ 1024×576/.test(document.querySelector('[role="dialog"]').innerText)));
  await clickIn('Apply'); await sleep(500); const s = await size(); t('16:9 crop is 1024x576', s[0] === 1024 && s[1] === 576, s.join('x')); await undo(); }
{ // CROP cancel + invalid
  await dock('Tools', 'Crop'); await sleep(300); await setNum('Width', 99999); await setNum('Left', 5000);
  await clickIn('Apply'); await sleep(500); const s = await size(); t('absurd crop values are clamped, never an empty canvas', s[0] >= 1 && s[1] >= 1 && s[0] <= 1024, s.join('x')); await undo();
  await dock('Tools', 'Crop'); await sleep(300); await clickIn('Cancel'); t('Cancel closes without changing anything', !(await dlg()) && (await size())[0] === 1024); }
{ // RESIZE with aspect lock
  await dock('Tools', 'Resize'); await sleep(300); t('Resize dialog opens', await dlg());
  await setNum('Width', 512);
  t('aspect lock sets height to 512', await p.evaluate(() => /→ 512×512/.test(document.querySelector('[role="dialog"]').innerText)));
  await p.evaluate(() => { const cb = document.querySelector('[role="dialog"] input[type=checkbox]'); cb.click(); });
  await setNum('Height', 256);
  t('unlocked: height changes alone (512×256)', await p.evaluate(() => /→ 512×256/.test(document.querySelector('[role="dialog"]').innerText)));
  await clickIn('Apply'); await sleep(1500); const s = await size(); t('resize result is 512x256', s[0] === 512 && s[1] === 256, s.join('x')); await undo(); await sleep(300); t('undo restores 1024x1024', (await size())[0] === 1024); }
{ // RESIZE cap
  await dock('Tools', 'Resize'); await sleep(300); await setNum('Width', 50000);
  t('oversize resize shows the cap warning', await p.evaluate(() => /capped at 8192/.test(document.querySelector('[role="dialog"]').innerText)));
  await clickIn('Cancel'); }
// BORDER
await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); });
await dock('Tools', 'Flip H'); await dock('Tools', 'Flip H'); // commit the painted state to the undo stack, as a real edit would
{ await dock('Border', 'Border'); await sleep(300); t('Border dialog opens', await dlg());
  await setNum('Thickness', 30); await p.evaluate(() => { const i = document.querySelector('[role="dialog"] input[type=color]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '#ff0000'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await clickIn('Apply'); await sleep(500);
  const e = await px(5, 500), inner = await px(31, 500), mid = await px(500, 500);
  t('border edge is red', e[0] === 255 && e[1] === 0, e.slice(0, 3).join());
  t('border stops at 30px (px 30 is paper)', inner[0] === 255 && inner[1] === 255, inner.slice(0, 3).join());
  t('canvas size unchanged by border', (await size())[0] === 1024); await undo(); t('undo removes the border', (await px(5, 500))[1] === 255); }
// FRAME
{ await dock('Frame', 'Frame'); await sleep(300); t('Frame dialog opens', await dlg());
  await setNum('Corner radius', 120); await setNum('Outline', 0); await clickIn('Apply'); await sleep(500);
  const corner = await px(2, 2), edge = await px(512, 2), ctr = await px(512, 512);
  t('frame corner is transparent', corner[3] === 0, `alpha ${corner[3]}`);
  t('frame edge midpoint + centre stay opaque', edge[3] === 255 && ctr[3] === 255, `${edge[3]} ${ctr[3]}`); await undo(); }
// ESC closes
{ await dock('Border', 'Border'); await sleep(300); await p.keyboard.press('Escape'); await sleep(200); t('Escape closes the dialog', !(await dlg())); }
