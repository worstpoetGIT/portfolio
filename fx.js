import * as THREE from './vendor/three.module.min.js';
import { glowTexture } from './car.js';

export function makeFx(scene, camera) {
  const softTex = glowTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0.3)');

  // ---- tire smoke pool ----
  const smoke = [];
  for (let i = 0; i < 70; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xcfc4d8, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false;
    sp.userData = { age: 0, life: 1, vel: new THREE.Vector3(), size: 1 };
    scene.add(sp);
    smoke.push(sp);
  }
  let smokeIdx = 0;
  function spawnSmoke(pos, vel, size = 1.2, life = 1.6, color = 0xcfc4d8, peak = 0.5) {
    const sp = smoke[smokeIdx++ % smoke.length];
    sp.visible = true;
    sp.position.copy(pos);
    sp.userData.age = 0;
    sp.userData.life = life;
    sp.userData.size = size;
    sp.userData.peak = peak;
    sp.material.color.setHex(color);
    sp.userData.vel.copy(vel);
  }
  function updateSmoke(dt) {
    for (const sp of smoke) {
      if (!sp.visible) continue;
      const d = sp.userData;
      d.age += dt;
      if (d.age >= d.life) { sp.visible = false; continue; }
      const k = d.age / d.life;
      sp.position.addScaledVector(d.vel, dt);
      const s = d.size * (1 + k * 3.2);
      sp.scale.set(s, s, 1);
      sp.material.opacity = d.peak * (1 - k) * Math.min(1, k * 8);
    }
    for (const sk of sparks) {
      if (!sk.visible) continue;
      const d = sk.userData;
      d.age += dt;
      if (d.age >= d.life) { sk.visible = false; continue; }
      const k = d.age / d.life;
      sk.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(1 - dt * 1.4);
      const s = 0.8 * (1 - k * 0.65);
      sk.scale.set(s, s, 1);
      sk.material.opacity = 1 - k;
    }
  }

  // ---- sparks (damaged car) ----
  const sparkTex = glowTexture('rgba(255,244,210,1)', 'rgba(255,150,40,0.65)');
  const sparks = [];
  for (let i = 0; i < 70; i++) {
    const sk = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sk.visible = false;
    sk.userData = { age: 0, life: 1, vel: new THREE.Vector3() };
    scene.add(sk);
    sparks.push(sk);
  }
  let sparkIdx = 0;
  function spawnSpark(pos, vel) {
    const sk = sparks[sparkIdx++ % sparks.length];
    sk.visible = true;
    sk.position.copy(pos);
    sk.userData.age = 0;
    sk.userData.life = 0.35 + Math.random() * 0.45;
    sk.userData.vel.copy(vel);
  }

  // ---- debris (analytic, reversible) ----
  const DEB = 96;
  const debGeo = new THREE.BoxGeometry(1, 1, 1);
  const debMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.4 });
  const debris = new THREE.InstancedMesh(debGeo, debMat, DEB);
  debris.frustumCulled = false;
  const dv = [], dspin = [], dscale = [];
  const palette = [0x0b0b0d, 0x0b0b0d, 0x0b0b0d, 0xdadde2, 0xdadde2, 0xb8141c, 0xffa31a];
  const dc = new THREE.Color();
  for (let i = 0; i < DEB; i++) {
    const a = Math.random() * Math.PI * 2, up = 14 + Math.random() * 34, out = 5 + Math.random() * 26;
    dv.push(new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out));
    dspin.push(new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9));
    dscale.push(new THREE.Vector3(0.2 + Math.random() * 0.55, 0.12 + Math.random() * 0.3, 0.2 + Math.random() * 0.5));
    dc.setHex(palette[Math.floor(Math.random() * palette.length)]);
    debris.setColorAt(i, dc);
  }
  debris.visible = false;
  scene.add(debris);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function updateDebris(tau, origin) {
    if (tau <= 0) { debris.visible = false; return; }
    debris.visible = true;
    for (let i = 0; i < DEB; i++) {
      const v = dv[i];
      _p.set(origin.x + v.x * tau, origin.y + 0.4 + v.y * tau - 0.5 * 9.8 * tau * tau, origin.z + v.z * tau);
      let rest = false;
      if (_p.y < origin.y + 0.1) { _p.y = origin.y + 0.1; rest = true; }
      const t2 = rest ? 0 : tau;
      _e.set(dspin[i].x * t2, dspin[i].y * t2, dspin[i].z * t2);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, dscale[i]);
      debris.setMatrixAt(i, _m);
    }
    debris.instanceMatrix.needsUpdate = true;
  }

  // ---- fireball + smoke column ----
  const fireTex = glowTexture('rgba(255,240,190,1)', 'rgba(255,130,30,0.6)');
  const fireballs = [];
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, color: i === 0 ? 0xffd890 : 0xff7a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    sp.renderOrder = 20;
    sp.visible = false;
    scene.add(sp);
    fireballs.push(sp);
  }
  const columns = [];
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0x1d1a22, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false;
    scene.add(sp);
    columns.push(sp);
  }
  function updateCrashFx(pc, origin) {
    const on = pc > 0;
    for (let i = 0; i < fireballs.length; i++) {
      const sp = fireballs[i];
      sp.visible = on;
      if (!on) continue;
      const g = Math.min(1, pc * 1.4);
      const s = (10 + i * 5) * (0.25 + Math.sqrt(g) * 1.1);
      sp.scale.set(s, s, 1);
      sp.position.set(origin.x + (i - 2) * 0.9, origin.y + 2 + i * 1.6 * g, origin.z);
      sp.material.opacity = Math.max(0, 1 - Math.pow(pc, 0.8)) * 0.95 * Math.min(1, pc * 14);
    }
    for (let i = 0; i < columns.length; i++) {
      const sp = columns[i];
      sp.visible = on;
      if (!on) continue;
      const delay = i * 0.07;
      const k = Math.max(0, pc - delay);
      const s = 5 + k * 40 + i * 1.5;
      sp.scale.set(s, s, 1);
      sp.position.set(origin.x + Math.sin(i * 2.1) * 3, origin.y + 3 + k * 70 + i * 2, origin.z + Math.cos(i * 1.7) * 3);
      sp.material.opacity = 0.65 * Math.min(1, k * 6) * (1 - k * 0.5);
    }
  }

  // ---- speed streaks (parented to the camera) ----
  const STREAKS = 150;
  const sp = new Float32Array(STREAKS * 6);
  const seeds = [];
  for (let i = 0; i < STREAKS; i++) {
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.pow(Math.random(), 0.7) * 22;
    seeds.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: Math.random(), len: 6 + Math.random() * 16 });
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  streaks.frustumCulled = false;
  camera.add(streaks);
  function updateStreaks(intensity, time) {
    streaks.visible = intensity > 0.01;
    if (!streaks.visible) return;
    streaks.material.opacity = Math.min(0.75, intensity);
    for (let i = 0; i < STREAKS; i++) {
      const s = seeds[i];
      const z = -(((s.z + time * (0.5 + intensity * 1.8)) % 1) * 90 + 4);
      sp[i * 6] = s.x; sp[i * 6 + 1] = s.y; sp[i * 6 + 2] = z;
      sp[i * 6 + 3] = s.x; sp[i * 6 + 4] = s.y; sp[i * 6 + 5] = z - s.len * (0.4 + intensity);
    }
    sg.attributes.position.needsUpdate = true;
  }

  function setTheme(name) {
    const mode = name === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending;
    for (const sp of [...fireballs, ...sparks]) { sp.material.blending = mode; sp.material.needsUpdate = true; }
  }

  return { setTheme, spawnSmoke, spawnSpark, updateSmoke, updateDebris, updateCrashFx, updateStreaks };
}
