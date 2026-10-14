import * as THREE from './vendor/three.module.min.js';
import { CARDS } from './content.js';

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return '#' + c.getHexString();
}

function wrap(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function cardTexture(card) {
  const W = 600, H = 800, R = 54;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.beginPath();
  g.roundRect(0, 0, W, H, R);
  g.clip();
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, shade(card.color, 0.07));
  gr.addColorStop(0.55, card.color);
  gr.addColorStop(1, shade(card.color, -0.08));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // soft highlight
  const hl = g.createRadialGradient(W * 0.2, 0, 10, W * 0.2, 0, W * 0.9);
  hl.addColorStop(0, 'rgba(255,255,255,0.20)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, W, H);
  g.fillStyle = card.titleColor;
  g.globalAlpha = 0.7;
  g.font = '500 34px "Space Grotesk", sans-serif';
  g.textBaseline = 'alphabetic';
  g.fillText(card.n, 52, 92);
  g.globalAlpha = 1;
  g.font = '700 74px "Space Grotesk", sans-serif';
  const lines = wrap(g, card.title, W - 104);
  const lh = 84;
  let y = H - 56 - (lines.length - 1) * lh;
  for (const l of lines) { g.fillText(l, 52, y); y += lh; }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildOrbitCards() {
  const group = new THREE.Group();
  const items = [];
  const geo = new THREE.PlaneGeometry(3.0, 4.0);
  CARDS.filter((c) => c.id !== 'why').forEach((card, i) => {
    const holder = new THREE.Group();
    const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: cardTexture(card), transparent: true, alphaTest: 0.5, side: THREE.FrontSide, toneMapped: false }));
    const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(card.color).multiplyScalar(0.55), side: THREE.BackSide }));
    holder.add(front, back);
    group.add(holder);
    items.push({ holder, front, i, hover: 0 });
  });
  group.visible = false;

  const center = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const look = new THREE.Object3D();

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverIdx = -1;
  function pick(x, y, camera) {
    if (!group.visible) return -1;
    ndc.set(x, y);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(items.map((it) => it.front), false);
    if (!hits.length) return -1;
    const it = items.find((o) => o.front === hits[0].object);
    return it ? it.i : -1;
  }
  function setHover(i) { hoverIdx = i; }

  function update(center_, camera, vis, spin, time) {
    group.visible = vis > 0.001;
    if (!group.visible) return;
    center.copy(center_);
    const n = items.length;
    const port = THREE.MathUtils.clamp((0.95 - camera.aspect) / 0.5, 0, 1);
    for (const it of items) {
      const a = spin + (it.i / n) * Math.PI * 2;
      const R = 9.4 * (1 - 0.28 * port) + (1 - vis) * 46;
      const wob = Math.sin(time * 0.7 + it.i * 1.7) * 0.35;
      // tilted ring
      const ringTilt = 0.34 + 0.4 * port;
      const x = Math.cos(a) * R;
      const zr = Math.sin(a) * R;
      const y = zr * Math.sin(ringTilt) + wob;
      const z = zr * Math.cos(ringTilt);
      it.holder.position.set(center.x + x, center.y + 0.6 + y, center.z + z);
      it.hover += ((hoverIdx === it.i ? 1 : 0) - it.hover) * 0.2;
      const s = Math.max(0.0001, vis) * (1 + 0.1 * it.hover) * (1 + 0.3 * port);
      it.holder.scale.setScalar(s);
      // orientation: outward-facing pinwheel blended with a billboard toward the camera
      look.position.copy(it.holder.position);
      tmp.set(center.x + x * 2, center.y + y * 2, center.z + z * 2);
      look.lookAt(tmp);
      look.rotateY(0.9);
      look.rotateX(-0.28);
      const qA = look.quaternion.clone();
      look.lookAt(camera.position);
      const qB = look.quaternion.clone();
      it.holder.quaternion.copy(qA).slerp(qB, 0.62);
    }
  }
  return { group, update, pick, setHover, count: items.length, items };
}
