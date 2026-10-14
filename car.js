import * as THREE from './vendor/three.module.min.js';

export function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, mid);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sideExtrude(shape, width, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, bevel
    ? { depth: width, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.06, bevelSegments: 6, curveSegments: 14 }
    : { depth: width, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

export function makeCar() {
  const car = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe6e6ea, metalness: 1, roughness: 0.12, envMapIntensity: 1.8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1620, metalness: 0.3, roughness: 0.04, transparent: true, opacity: 0.72, envMapIntensity: 1.8 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.92 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xece7d9, roughness: 0.75 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xa3141c, roughness: 0.5 });
  const interior = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.9 });

  // body
  const s = new THREE.Shape();
  s.moveTo(-2.02, 0.36);
  s.lineTo(2.02, 0.36);
  s.lineTo(2.10, 0.50);
  s.lineTo(2.08, 0.86);
  s.quadraticCurveTo(1.70, 1.02, 1.20, 1.04);
  s.lineTo(0.62, 1.05);
  s.lineTo(0.34, 1.46);
  s.quadraticCurveTo(0.25, 1.55, 0.0, 1.56);
  s.lineTo(-0.70, 1.56);
  s.quadraticCurveTo(-1.35, 1.52, -1.62, 1.14);
  s.lineTo(-1.80, 0.98);
  s.quadraticCurveTo(-2.02, 0.94, -2.08, 0.80);
  s.lineTo(-2.10, 0.50);
  s.closePath();
  const body = new THREE.Mesh(sideExtrude(s, 1.46, true), paint);
  car.add(body);

  // side glass
  const gs = new THREE.Shape();
  gs.moveTo(0.52, 1.16);
  gs.lineTo(0.31, 1.45);
  gs.lineTo(-0.64, 1.47);
  gs.quadraticCurveTo(-1.22, 1.43, -1.48, 1.14);
  gs.closePath();
  car.add(new THREE.Mesh(sideExtrude(gs, 1.80, false), glass));

  // windshield + rear window
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.52), glass);
  ws.position.set(0, 1.29, 0.50);
  ws.rotation.x = -0.56;
  car.add(ws);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.58), glass);
  rw.position.set(0, 1.33, -1.52);
  rw.rotation.set(0.82, Math.PI, 0);
  car.add(rw);

  // interior hint
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 0.9), interior);
  seat.position.set(0, 1.1, -0.35);
  car.add(seat);

  // fenders
  const fenderGeo = new THREE.SphereGeometry(1, 36, 22);
  const fenders = [
    [0.74, 0.84, 1.38, 0.30, 0.34, 0.86],
    [-0.74, 0.84, 1.38, 0.30, 0.34, 0.86],
    [0.76, 0.80, -1.36, 0.26, 0.36, 0.78],
    [-0.76, 0.80, -1.36, 0.26, 0.36, 0.78],
  ];
  for (const f of fenders) {
    const m = new THREE.Mesh(fenderGeo, paint);
    m.position.set(f[0], f[1], f[2]);
    m.scale.set(f[3], f[4], f[5]);
    car.add(m);
  }

  // running boards
  for (const sx of [-1, 1]) {
    const rb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 1.9), paint);
    rb.position.set(sx * 0.96, 0.36, -0.05);
    car.add(rb);
  }

  // grille + bumpers
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.1), chrome);
  grille.position.set(0, 0.68, 2.12);
  car.add(grille);
  const slatMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.6 });
  for (let i = -4; i <= 4; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.56, 0.04), slatMat);
    slat.position.set(i * 0.085, 0.68, 2.18);
    car.add(slat);
  }
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.11, 0.14), chrome);
  bumperF.position.set(0, 0.40, 2.22);
  car.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.set(0, 0.42, -2.20);
  car.add(bumperR);

  // lamps
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffe2a0, emissiveIntensity: 2.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a0a0a, emissive: 0xff1a1a, emissiveIntensity: 1.6 });
  const lamps = [];
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), lampMat);
    hl.position.set(sx * 0.72, 1.07, 1.72);
    hl.scale.set(1, 1, 0.8);
    car.add(hl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), chrome);
    ring.position.copy(hl.position);
    ring.position.z += 0.07;
    car.add(ring);
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), tailMat);
    tl.position.set(sx * 0.66, 0.78, -2.16);
    car.add(tl);
    const spot = new THREE.SpotLight(0xffe2b0, 90, 70, 0.42, 0.65, 1.4);
    spot.position.set(sx * 0.72, 1.07, 1.8);
    spot.target.position.set(sx * 0.9, 0.2, 14);
    car.add(spot, spot.target);
    lamps.push(spot);
  }

  // wheels
  const glowTex = glowTexture('rgba(150,205,255,1)', 'rgba(55,130,255,0.6)');
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.24, 30).rotateZ(Math.PI / 2);
  const whiteGeo = new THREE.CylinderGeometry(0.285, 0.285, 0.252, 30).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.15, 0.16, 0.262, 22).rotateZ(Math.PI / 2);
  const capGeo = new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2);
  const ringGeo = new THREE.TorusGeometry(0.215, 0.012, 8, 36).rotateY(Math.PI / 2);
  const treadGeo = new THREE.BoxGeometry(0.2, 0.035, 0.07);
  const defs = [[1, 1.36], [-1, 1.36], [1, -1.36], [-1, -1.36]];
  for (const [side, z] of defs) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.84, 0.37, z);
    const spin = new THREE.Group();
    pivot.add(spin);
    spin.add(new THREE.Mesh(tireGeo, tireMat));
    spin.add(new THREE.Mesh(whiteGeo, whiteMat));
    for (const dx of [-1, 1]) {
      const r = new THREE.Mesh(ringGeo, redMat);
      r.position.x = dx * 0.128;
      spin.add(r);
    }
    spin.add(new THREE.Mesh(hubGeo, chrome));
    const cap = new THREE.Mesh(capGeo, chrome);
    cap.position.x = side * 0.131;
    cap.scale.x = side;
    spin.add(cap);
    const treads = new THREE.InstancedMesh(treadGeo, tireMat, 22);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      e.set(a, 0, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(0, Math.cos(a) * 0.372, Math.sin(a) * 0.372), q, new THREE.Vector3(1, 1, 1));
      treads.setMatrixAt(k, m);
    }
    spin.add(treads);

    // thruster plume (shown when wheels fold)
    const plume = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 2.4, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x2f7dff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    cone.position.y = -1.3;
    cone.rotation.z = Math.PI;
    plume.add(cone);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x3d8fff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.set(1.5, 1.5, 1);
    glow.position.y = -0.18;
    plume.add(glow);
    car.add(pivot);
    // plume is a sibling positioned under the wheel in car space (not rotated by pivot)
    plume.position.set(side * 1.02, 0.28, z);
    car.add(plume);
    wheels.push({ pivot, spin, side, front: z > 0, plume, cone, glow });
  }

  // fire (re-entry) sprites
  const fireTex = glowTexture('rgba(255,235,170,1)', 'rgba(255,120,30,0.55)');
  const fire = [];
  const fireGroup = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, color: i % 3 ? 0xff7a1a : 0xffc060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.userData.seed = Math.random() * 100;
    fireGroup.add(sp);
    fire.push(sp);
  }
  car.add(fireGroup);

  // underglow light
  const under = new THREE.PointLight(0x4f9dff, 0, 18, 2);
  under.position.set(0, 0.1, 0);
  car.add(under);

  return { car, wheels, lamps, fire, fireGroup, under, paint, glass };
}
