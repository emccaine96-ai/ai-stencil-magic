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

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth || 320;
    const H = 260;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0613);
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera.position.set(0, 0, 5.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffe8d0, 1.0);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8a5cff, 0.6);
    rim.position.set(-4, 2, -3);
    scene.add(rim);

    let geom: THREE.BufferGeometry;
    if (part === "forearm") geom = new THREE.CylinderGeometry(0.7, 0.85, 3.2, 48, 1, true);
    else if (part === "bicep") geom = new THREE.CapsuleGeometry(1.0, 1.6, 12, 32);
    else if (part === "calf") geom = new THREE.CylinderGeometry(0.6, 1.1, 3.0, 48, 1, true);
    else geom = new THREE.SphereGeometry(1.7, 48, 32);

    const skin = new THREE.MeshStandardMaterial({
      color: 0xdfb18f,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, skin);
    scene.add(mesh);

    // Stencil decal as a second mesh with multiply blending, slightly larger.
    let decal: THREE.Mesh | null = null;
    let tex: THREE.Texture | null = null;
    if (stencilUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(stencilUrl, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        tex = t;
        const decalMat = new THREE.MeshBasicMaterial({
          map: t,
          transparent: true,
          blending: THREE.MultiplyBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        decal = new THREE.Mesh(geom.clone(), decalMat);
        decal.scale.multiplyScalar(1.005);
        scene.add(decal);
      });
    }

    // Lightweight orbit by drag.
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
    const tick = () => {
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
  }, [part, stencilUrl]);

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
      <div ref={mountRef} className="rounded-2xl overflow-hidden border border-border bg-background" style={{ height: 260 }} />
      <p className="text-[10px] text-muted-foreground">Drag to rotate. Stencil projected via multiply blending onto a procedural skin mesh.</p>
    </div>
  );
}