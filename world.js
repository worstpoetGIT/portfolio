import * as THREE from './vendor/three.module.min.js';

const { MathUtils } = THREE;

function hash(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); f *= 2; a *= 0.5; }
  return s;
}
const smooth = (a, b, x) => { const t = MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const roadCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 70),
  new THREE.Vector3(0, 0.4, 12),
  new THREE.Vector3(16, 3.5, -42),
  new THREE.Vector3(-12, 10, -100),
  new THREE.Vector3(14, 18, -158),
  new THREE.Vector3(-8, 27, -214),
  new THREE.Vector3(10, 37, -268),
  new THREE.Vector3(0, 46, -318),
  new THREE.Vector3(0, 50, -338),
  new THREE.Vector3(0, 60, -360),
], false, 'catmullrom', 0.5);
export const ROAD_LEN = roadCurve.getLength();

const SAMPLES = 520;
const sx = new Float32Array(SAMPLES + 1), sy = new Float32Array(SAMPLES + 1), sz = new Float32Array(SAMPLES + 1);
for (let i = 0; i <= SAMPLES; i++) {
  const p = roadCurve.getPointAt(i / SAMPLES);
  sx[i] = p.x; sy[i] = p.y; sz[i] = p.z;
}

export function terrainY(x, z) {
  let best = 1e12, by = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const dx = x - sx[i], dz = z - sz[i];
    const d = dx * dx + dz * dz;
    if (d < best) { best = d; by = sy[i]; }
  }
  const d = Math.sqrt(best);
  const far = MathUtils.clamp(-z * 0.17, -6, 58) + Math.min(Math.abs(x), 260) * 0.11 + (fbm(x * 0.018, z * 0.018) - 0.5) * 46;
  return MathUtils.lerp(by - 0.35, far, smooth(5, 58, d));
}

export function nearestRoadDist(x, z) {
  let best = 1e12;
  for (let i = 0; i <= SAMPLES; i++) {
    const dx = x - sx[i], dz = z - sz[i];
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

function ribbonArrays(tStart, tEnd, n, halfWidth, offset, lift) {
  const pos = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const t = MathUtils.lerp(tStart, tEnd, i / n);
    const p = roadCurve.getPointAt(t);
    const tan = roadCurve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const c = p.clone().addScaledVector(side, offset);
    const l = c.clone().addScaledVector(side, -halfWidth);
    const r = c.clone().addScaledVector(side, halfWidth);
    pos.push(l.x, l.y + lift, l.z, r.x, r.y + lift, r.z);
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  return { pos, idx };
}

function mergeRibbons(list) {
  const pos = [], idx = [];
  let base = 0;
  for (const r of list) {
    pos.push(...r.pos);
    for (const k of r.idx) idx.push(k + base);
    base += r.pos.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildWorld(scene) {
  const world = new THREE.Group();
  scene.add(world);

  // terrain
  const SIZE = 780, SEG = 180;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  tg.translate(0, 0, -150);
  const tp = tg.attributes.position;
  const colors = new Float32Array(tp.count * 4);
  const kArr = new Float32Array(tp.count), vArr = new Float32Array(tp.count);
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const y = terrainY(x, z);
    tp.setY(i, y);
    kArr[i] = MathUtils.clamp(y / 60, 0, 1);
    vArr[i] = 0.85 + 0.3 * hash(Math.floor(x / 4), Math.floor(z / 4));
    colors[i * 4 + 3] = 1 - smooth(290, 380, Math.max(Math.abs(x), Math.abs(z + 150)));
  }
  const colorAttr = new THREE.BufferAttribute(colors, 4);
  tg.setAttribute('color', colorAttr);
  tg.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, envMapIntensity: 0.25, transparent: true });
  const terrain = new THREE.Mesh(tg, terrainMat);
  world.add(terrain);

  // road
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 0.5, metalness: 0.1, envMapIntensity: 1.0 });
  const asphalt = new THREE.Mesh(mergeRibbons([ribbonArrays(0, 1, 360, 4.6, 0, 0.03)]), asphaltMat);
  world.add(asphalt);

  const edgeList = [
    ribbonArrays(0, 1, 360, 0.11, -4.0, 0.045),
    ribbonArrays(0, 1, 360, 0.11, 4.0, 0.045),
  ];
  world.add(new THREE.Mesh(
    mergeRibbons(edgeList),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.7, emissive: 0x3a3428, envMapIntensity: 0.2 })
  ));

  const dashes = [];
  const dashT = 3 / ROAD_LEN, perT = 9 / ROAD_LEN;
  for (let t = 0.004; t < 0.995; t += perT) dashes.push(ribbonArrays(t, Math.min(t + dashT, 1), 3, 0.12, 0, 0.05));
  world.add(new THREE.Mesh(
    mergeRibbons(dashes),
    new THREE.MeshStandardMaterial({ color: 0xffc766, roughness: 0.6, emissive: 0x6a4a14, envMapIntensity: 0.2 })
  ));

  // reflector posts
  const postGeo = new THREE.BoxGeometry(0.16, 1.0, 0.16);
  const postCount = 2 * Math.floor(ROAD_LEN / 11);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0x554a30, roughness: 0.6 }), postCount);
  const up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4();
  let pi = 0;
  for (let k = 0; pi < postCount; k++) {
    const t = Math.min(0.995, (k * 11 + 6) / ROAD_LEN);
    const p = roadCurve.getPointAt(t), tan = roadCurve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    for (const s of [-1, 1]) {
      if (pi >= postCount) break;
      const q = p.clone().addScaledVector(side, s * 5.0);
      m4.makeTranslation(q.x, q.y + 0.45, q.z);
      posts.setMatrixAt(pi++, m4);
    }
  }
  world.add(posts);

  // trees
  const TREES = 780;
  const coneGeo = new THREE.ConeGeometry(1.5, 5.2, 6).translate(0, 3.6, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 5).translate(0, 0.8, 0);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95, envMapIntensity: 0.2 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2b1c16, roughness: 1 });
  const trees = new THREE.InstancedMesh(coneGeo, treeMat, TREES);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
  const col = new THREE.Color(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), tr = new THREE.Vector3();
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const treeRnd = [];
  let placed = 0;
  while (placed < TREES) {
    const t = rnd();
    const p = roadCurve.getPointAt(t), tan = roadCurve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const off = (rnd() < 0.5 ? -1 : 1) * (8 + Math.pow(rnd(), 1.6) * 70);
    const x = p.x + side.x * off, z = p.z + side.z * off;
    if (nearestRoadDist(x, z) < 7.5) continue;
    if (Math.hypot(x - 26, z + 112) < 18) continue;
    const y = terrainY(x, z);
    const s = 0.7 + rnd() * 1.3;
    q.setFromAxisAngle(up, rnd() * 6.28);
    sc.set(s, s * (0.9 + rnd() * 0.5), s);
    tr.set(x, y - 0.2, z);
    m4.compose(tr, q, sc);
    trees.setMatrixAt(placed, m4);
    trunks.setMatrixAt(placed, m4);
    treeRnd.push([rnd(), rnd(), rnd()]);
    placed++;
  }
  world.add(trees, trunks);

  // mountains
  const mtnMat = new THREE.MeshStandardMaterial({ color: 0x2b1b4d, flatShading: true, roughness: 1, envMapIntensity: 0.1 });
  for (let i = 0; i < 22; i++) {
    const h = 150 + rnd() * 260, r = 90 + rnd() * 120;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6 + Math.floor(rnd() * 3)), mtnMat);
    const x = -620 + (i / 21) * 1240 + (rnd() - 0.5) * 80;
    const z = -560 - rnd() * 160;
    m.position.set(x, h * 0.5 - 20, z);
    m.rotation.y = rnd() * 3;
    world.add(m);
  }

  const TERRAIN_PAL = {
    dark: [0x14261f, 0x24352a, 0x4a3a48],
    light: [0x4f7a3a, 0x6f9448, 0xa39784],
  };
  const tmp = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();
  function applyTheme(name) {
    const pal = TERRAIN_PAL[name];
    cA.setHex(pal[0]); cB.setHex(pal[1]); cC.setHex(pal[2]);
    for (let i = 0; i < kArr.length; i++) {
      const k = kArr[i];
      tmp.copy(cA).lerp(cB, smooth(0, 0.5, k)).lerp(cC, smooth(0.55, 1, k));
      const v = vArr[i];
      colors[i * 4] = tmp.r * v; colors[i * 4 + 1] = tmp.g * v; colors[i * 4 + 2] = tmp.b * v;
    }
    colorAttr.needsUpdate = true;
    for (let i = 0; i < treeRnd.length; i++) {
      const r = treeRnd[i];
      if (name === 'light') col.setHSL(0.29 + r[0] * 0.1, 0.42 + r[1] * 0.22, 0.2 + r[2] * 0.13);
      else col.setHSL(0.38 + r[0] * 0.08, 0.35 + r[1] * 0.2, 0.1 + r[2] * 0.07);
      trees.setColorAt(i, col);
    }
    trees.instanceColor.needsUpdate = true;
    mtnMat.color.setHex(name === 'light' ? 0x8da3c6 : 0x2b1b4d);
    asphaltMat.color.setHex(name === 'light' ? 0x3c3e48 : 0x101018);
    asphaltMat.roughness = name === 'light' ? 0.72 : 0.5;
    asphaltMat.envMapIntensity = name === 'light' ? 0.5 : 1.0;
  }

  return { world, terrain, terrainMat, applyTheme };
}

// ---------- sky ----------
export const SKY_PALETTES = {
  dark: {
    horizon: [1.0, 0.50, 0.24], mid1: [0.80, 0.22, 0.45], mid2: [0.30, 0.13, 0.55], top: [0.045, 0.025, 0.20], below: [0.10, 0.05, 0.20],
    sunCol: [1.0, 0.72, 0.38], spaceBot: [0.004, 0.006, 0.02], spaceTop: [0.03, 0.025, 0.09], sunDir: [0, 0.075, -1],
  },
  light: {
    horizon: [1.0, 0.93, 0.80], mid1: [0.72, 0.86, 1.0], mid2: [0.40, 0.66, 0.98], top: [0.17, 0.42, 0.90], below: [0.80, 0.88, 0.96],
    sunCol: [1.0, 0.94, 0.74], spaceBot: [0.72, 0.84, 0.99], spaceTop: [0.20, 0.40, 0.86], sunDir: [0.78, 0.09, -1],
  },
};

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const skyFrag = `
  varying vec3 vDir; uniform float uSpace; uniform vec3 uSunDir;
  uniform vec3 uHorizon, uMid1, uMid2, uTop, uBelow, uSunCol, uSpaceBot, uSpaceTop;
  void main(){
    float h = vDir.y;
    vec3 c = mix(uHorizon, uMid1, smoothstep(0.0, 0.14, h));
    c = mix(c, uMid2, smoothstep(0.10, 0.42, h));
    c = mix(c, uTop, smoothstep(0.35, 1.0, h));
    c = mix(c, uBelow, smoothstep(0.0, -0.4, h));
    float sd = max(dot(vDir, normalize(uSunDir)), 0.0);
    float disc = smoothstep(0.9975, 0.9985, sd);
    float halo = pow(sd, 36.0) * 0.9 + pow(sd, 6.0) * 0.28;
    c += uSunCol * halo;
    c = mix(c, vec3(1.0, 0.96, 0.82), disc);
    vec3 space = mix(uSpaceBot, uSpaceTop, smoothstep(-0.3, 1.0, h));
    gl_FragColor = vec4(mix(c, space, uSpace), 1.0);
  }`;

function skyUniforms(name) {
  const p = SKY_PALETTES[name];
  const v = (a) => ({ value: new THREE.Vector3(a[0], a[1], a[2]) });
  return {
    uSpace: { value: 0 }, uSunDir: { value: new THREE.Vector3(...p.sunDir).normalize() },
    uHorizon: v(p.horizon), uMid1: v(p.mid1), uMid2: v(p.mid2), uTop: v(p.top), uBelow: v(p.below),
    uSunCol: v(p.sunCol), uSpaceBot: v(p.spaceBot), uSpaceTop: v(p.spaceTop),
  };
}

export function setSkyTheme(mat, name) {
  const p = SKY_PALETTES[name], u = mat.uniforms;
  u.uHorizon.value.set(...p.horizon); u.uMid1.value.set(...p.mid1); u.uMid2.value.set(...p.mid2); u.uTop.value.set(...p.top);
  u.uBelow.value.set(...p.below); u.uSunCol.value.set(...p.sunCol); u.uSpaceBot.value.set(...p.spaceBot); u.uSpaceTop.value.set(...p.spaceTop);
  u.uSunDir.value.set(...p.sunDir).normalize();
}

export function buildSky(name = 'dark') {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: skyUniforms(name), vertexShader: skyVert, fragmentShader: skyFrag,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 20), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

export function buildStars() {
  const N = 3200;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const r = 3500;
    pos[i * 3] = Math.cos(a) * s * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = Math.sin(a) * s * r;
    c.setHSL(0.55 + Math.random() * 0.15, 0.4 * Math.random(), 0.75 + Math.random() * 0.25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dc = document.createElement('canvas'); dc.width = dc.height = 32;
  const dg = dc.getContext('2d'); const gr = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = gr; dg.fillRect(0, 0, 32, 32);
  const m = new THREE.PointsMaterial({ size: 3.4, sizeAttenuation: false, map: new THREE.CanvasTexture(dc), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(g, m);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  return stars;
}

// ---------- Earth ----------
export const EARTH_R = 6000;
export const EARTH_CENTER = new THREE.Vector3(0, -50 - EARTH_R, -200);

export function buildEarth() {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uSunDir: { value: new THREE.Vector3(0.7, 0.55, 0.5).normalize() }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vW; varying vec3 vObj;
      void main(){ vObj = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      varying vec3 vN; varying vec3 vW; varying vec3 vObj;
      uniform vec3 uSunDir; uniform float uOpacity; uniform float uTime;
      float h3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z); }
      float fbm3(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*n3(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 p = vObj * 5.0 + vec3(3.1, 1.7, 9.2);
        float land = fbm3(p);
        float coast = smoothstep(0.50, 0.53, land);
        vec3 deep = vec3(0.01, 0.07, 0.24), shallow = vec3(0.04, 0.30, 0.50);
        vec3 ocean = mix(deep, shallow, smoothstep(0.34, 0.50, land));
        float dry = fbm3(p*1.7 + 11.0);
        vec3 ground = mix(vec3(0.10,0.30,0.12), vec3(0.55,0.45,0.25), smoothstep(0.45,0.7,dry));
        ground = mix(ground, vec3(0.9), smoothstep(0.80, 0.92, abs(vObj.y)));
        vec3 base = mix(ocean, ground, coast);
        float cl = fbm3(vObj*9.0 + vec3(uTime*0.01, 0.0, 0.0) + 40.0);
        float clouds = smoothstep(0.56, 0.74, cl);
        base = mix(base, vec3(1.0), clouds * 0.85);
        vec3 N = normalize(vN);
        float diff = clamp(dot(N, normalize(uSunDir)) * 1.15 + 0.1, 0.0, 1.0);
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = base * (0.06 + diff) + vec3(0.25, 0.55, 1.0) * fres * (0.25 + 0.75*diff);
        gl_FragColor = vec4(col, uOpacity);
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 128, 96), mat);
  earth.position.copy(EARTH_CENTER);
  earth.frustumCulled = false;
  group.add(earth);

  const atmoMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    uniforms: { uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vNormal; uniform float uOpacity; void main(){ float i = pow(max(0.62 - dot(vNormal, vec3(0.0,0.0,1.0)), 0.0), 3.2); gl_FragColor = vec4(0.30, 0.62, 1.0, 1.0) * i * 2.2 * uOpacity; }`,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.028, 96, 64), atmoMat);
  atmo.position.copy(EARTH_CENTER);
  atmo.frustumCulled = false;
  group.add(atmo);
  return { group, earthMat: mat, atmoMat };
}

// Environment maps for car reflections (one pair per theme)
export function buildEnvScenes(name = 'dark') {
  const surf = new THREE.Scene();
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: skyUniforms(name), vertexShader: skyVert, fragmentShader: skyFrag });
  surf.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 20), m));

  const space = new THREE.Scene();
  const light = name === 'light';
  const sm = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uSun: { value: new THREE.Vector3(0.7, 0.55, 0.5).normalize() }, uBase: { value: new THREE.Vector3(...(light ? [0.55, 0.72, 0.96] : [0.01, 0.012, 0.035])) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 uSun; uniform vec3 uBase; void main(){
      float h = vDir.y;
      vec3 c = uBase;
      c += vec3(0.10, 0.28, 0.65) * smoothstep(0.0, -0.9, h) * 1.4;
      float s = max(dot(vDir, uSun), 0.0);
      c += vec3(1.0,0.97,0.9) * (pow(s, 60.0) * 14.0 + pow(s, 6.0) * 0.5);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  space.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 20), sm));
  return { surface: surf, space };
}
