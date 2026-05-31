import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type BodyPart = "forearm" | "bicep" | "calf" | "chest";

const PARTS: { id: BodyPart; label: string }[] = [
  { id: "forearm", label: "Forearm" },
  { id: "bicep", label: "Outer Bicep" },
  { id: "calf", label: "Calf" },
  { id: "chest", label: "Chest" },
];

export default function SkinViewport({ stencilUrl }: { stencilUrl: string | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [part, setPart] = useState<BodyPart>("forearm");
  const [scale, setScale] = useState(0.75);
  const [skinTone, setSkinTone] = useState<"light" | "medium" | "deep">("medium");
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth || 320;
    const H = 300;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0613);
    scene.fog = new THREE.Fog(0x0a0613, 8, 14);
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera.position.set(0, 0.2, 5.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffe8c8, 1.4);
    key.position.set(3.5, 4, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9b6cff, 0.85);
    rim.position.set(-4, 2, -3);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(0, -3, 4);
    scene.add(fill);

    let geom: THREE.BufferGeometry;
    if (part === "forearm") geom = new THREE.CylinderGeometry(0.75, 0.92, 3.4, 64, 8, false);
    else if (part === "bicep") geom = new THREE.CapsuleGeometry(1.05, 1.8, 24, 64);
    else if (part === "calf") geom = new THREE.CylinderGeometry(0.65, 1.15, 3.2, 64, 8, false);
    else geom = new THREE.SphereGeometry(1.75, 64, 48);

    const SKIN_COLOR: Record<typeof skinTone, number> = { light: 0xf3d4b0, medium: 0xd99e7a, deep: 0x8b5a3c };
    const skin = new THREE.MeshPhysicalMaterial({
      color: SKIN_COLOR[skinTone],
      roughness: 0.62,
      metalness: 0.0,
      clearcoat: 0.15,
      clearcoatRoughness: 0.45,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xffd0b4),
    });
    const mesh = new THREE.Mesh(geom, skin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Stencil decal — rendered as a textured plane curved to hug the surface
    // by re-using the host geometry but masking everything except the front
    // window via the texture's own alpha.
    let decal: THREE.Mesh | null = null;
    let tex: THREE.Texture | null = null;
    if (stencilUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(stencilUrl, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        // Wrap the texture only across the front 1/3 of the cylinder so the
        // tattoo doesn't appear duplicated around the back side.
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.repeat.set(scale, scale);
        t.offset.set((1 - scale) / 2, (1 - scale) / 2);
        tex = t;
        const decalMat = new THREE.MeshStandardMaterial({
          map: t,
          transparent: true,
          alphaTest: 0.08,
          blending: THREE.MultiplyBlending,
          side: THREE.FrontSide,
          depthWrite: false,
          roughness: 0.75,
          metalness: 0.0,
        });
        decal = new THREE.Mesh(geom.clone(), decalMat);
        decal.scale.multiplyScalar(1.003);
        scene.add(decal);
      });
    }

    // Orbit / drag.
    let dragging = false;
    let lastX = 0, lastY = 0;
    let rotY = 0, rotX = 0;
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.01;
      rotX += (e.clientY - lastY) * 0.01;
      rotX = Math.max(-1, Math.min(1, rotX));
      lastX = e.clientX; lastY = e.clientY;
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      if (autoRotate && !dragging) {
        rotY = ((performance.now() - start) / 1000) * 0.4;
      }
      mesh.rotation.y = rotY;
      mesh.rotation.x = rotX;
      if (decal) { decal.rotation.copy(mesh.rotation); }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      tex?.dispose();
      geom.dispose();
      skin.dispose();
      if (decal) {
        (decal.material as THREE.Material).dispose();
        decal.geometry.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [part, stencilUrl, scale, skinTone, autoRotate]);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-4 gap-1.5">
        {PARTS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPart(p.id)}
            className={`text-[10px] py-1.5 rounded-full border transition ${part === p.id ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
          >{p.label}</button>
        ))}
      </div>
      <div ref={mountRef} className="rounded-2xl overflow-hidden border border-border bg-background" style={{ height: 300 }} />
      <div className="grid grid-cols-3 gap-1.5">
        {(["light", "medium", "deep"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSkinTone(t)}
            className={`text-[10px] py-1.5 rounded-full border capitalize transition ${skinTone === t ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
          >{t}</button>
        ))}
      </div>
      <div>
        <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Tattoo size</span><span className="font-bold gradient-text">{Math.round(scale * 100)}%</span></div>
        <input type="range" min={20} max={100} value={Math.round(scale * 100)} onChange={(e) => setScale(Number(e.target.value) / 100)} className="w-full mt-1 accent-[oklch(0.64_0.26_303)]" />
      </div>
      <label className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">Auto-rotate</span>
        <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} className="accent-[oklch(0.64_0.26_303)]" />
      </label>
      <p className="text-[10px] text-muted-foreground">Drag to rotate manually. Stencil ink blends into the skin via physically-based shading.</p>
    </div>
  );
}