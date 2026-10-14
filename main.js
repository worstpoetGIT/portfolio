import * as THREE from './vendor/three.module.min.js';
import { buildWorld, buildSky, buildStars, buildEarth, buildEnvScenes, setSkyTheme } from './world.js';
import { makeCar } from './car.js';
import { makeFx } from './fx.js';
import { buildOrbitCards } from './cards3d.js';
import { PH, carPose, cameraPose, envState, CRASH } from './story.js';
import { initUI } from './ui.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const canvas = $('gl'), hud = $('hud'), intro = $('intro'), flash = $('flash'), blackout = $('blackout');
const replayBtn = $('replay'), loader = $('loader'), hintEl = $('hint'), finale = $('finale');
const narr = [...document.querySelectorAll('#narr [data-in0]')].map((el) => ({
  el, a0: +el.dataset.in0, a1: +el.dataset.in1, b0: +el.dataset.out0, b1: +el.dataset.out1,
}));

// ---- interactive state: cards opened -> the car takes damage
const ORBIT_COUNT = 5;
const opened = new Set();
let damage = 0, damageTarget = 0, hit = 0, pendingHit = false, burst = false;

const ui = initUI({
  onOpen(i) {
    if (i < ORBIT_COUNT && !opened.has(i)) {
      opened.add(i);
      damageTarget = opened.size / ORBIT_COUNT;
      pendingHit = true;
    }
  },
  onClose() {
    if (pendingHit) { pendingHit = false; hit = 1; burst = true; }
  },
});

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let fallback = reduce;
let renderer = null;
if (!fallback) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no gl');
  } catch (e) { fallback = true; renderer = null; }
}

const scrollMax = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
let skipJump = false;
let dbgP = new URLSearchParams(location.search).get('p');
window.__setP = (v) => { dbgP = v; };
function pFromScroll() {
  if (dbgP !== null && !isNaN(parseFloat(dbgP))) { skipJump = true; return clamp(parseFloat(dbgP), 0, 1); }
  return clamp(scrollY / scrollMax(), 0, 1);
}
window.__openCard = (i) => ui.openDetail(i);
window.__damage = () => ({ damage, damageTarget, opened: opened.size });
replayBtn.addEventListener('click', () => { skipJump = true; scrollTo(0, 0); });

// ---- light / dark mode (dark is the original look; light is a full daytime version)
let theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
const themeBtn = $('theme'), themeFade = $('themefade');
let applyThemeFn = null;
function commitTheme(next, persist) {
  theme = next;
  document.documentElement.dataset.theme = next;
  if (persist) { try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ } }
  themeBtn.setAttribute('aria-label', next === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
  if (applyThemeFn) applyThemeFn(next);
}
function setTheme(next, animate = true, persist = true) {
  if (next === theme) return;
  if (!animate) { commitTheme(next, persist); return; }
  themeFade.classList.add('on');
  setTimeout(() => { commitTheme(next, persist); themeFade.classList.remove('on'); }, 230);
}
themeBtn.addEventListener('click', () => setTheme(theme === 'light' ? 'dark' : 'light'));
themeBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
window.__setTheme = (t) => setTheme(t, false, false);


let p = 0;

if (fallback) {
  document.body.classList.add('fallback');
  canvas.style.display = 'none';
  ['intro', 'narr', 'hint', 'finale', 'blackout', 'flash'].forEach((id) => { const n = $(id); if (n) n.style.display = 'none'; });
  loader.classList.add('done');
  ui.buildFallback();
} else {
  start();
}

async function start() {
  try {
    await Promise.all([
      document.fonts.load('700 40px "Space Grotesk"'),
      document.fonts.load('500 30px "Space Grotesk"'),
    ]);
  } catch (e) { /* system fallback font is fine */ }

  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8e456f, 80, 1500);
  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 12000);
  scene.add(camera);

  const sky = buildSky(theme);
  scene.add(sky);
  const stars = buildStars();
  scene.add(stars);
  const worldApi = buildWorld(scene);
  const { world, terrainMat } = worldApi;
  const earth = buildEarth();
  earth.group.visible = false;
  scene.add(earth.group);

  const hemi = new THREE.HemisphereLight(0x8a5cc8, 0x1a1020, 0.55);
  const sun = new THREE.DirectionalLight(0xff9a5a, 2.6);
  const fill = new THREE.DirectionalLight(0x7a6cff, 0.55);
  fill.position.set(10, 20, 60);
  scene.add(hemi, sun, fill);
  const SUN_SPACE = new THREE.Vector3(0.7, 0.55, 0.5).normalize();
  const THEMES = {
    dark: { fog: [0.56, 0.27, 0.44], fogFar: 1500, exposure: 1.05, hemi: [0x8a5cc8, 0x1a1020], hemiI: [0.55, 0.22], c0: new THREE.Color(0xff9a5a), c1: new THREE.Color(0xfff2dc), sunI: [2.6, 2.3], sunDir: new THREE.Vector3(0, 12, -60).normalize(), fillCol: 0x7a6cff, fillI: [0.55, 0.35], stars: 1 },
    light: { fog: [0.86, 0.91, 0.97], fogFar: 1900, exposure: 1.0, hemi: [0xcfe6ff, 0x8a9a68], hemiI: [1.05, 0.6], c0: new THREE.Color(0xfff1d8), c1: new THREE.Color(0xffffff), sunI: [3.3, 2.6], sunDir: new THREE.Vector3(0.25, 0.55, -0.45).normalize(), fillCol: 0xb4ccff, fillI: [0.5, 0.35], stars: 0.3 },
  };

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCache = {};
  function envsFor(name) {
    if (!envCache[name]) {
      const sc = buildEnvScenes(name);
      envCache[name] = { surface: pmrem.fromScene(sc.surface, 0.02).texture, space: pmrem.fromScene(sc.space, 0.02).texture };
    }
    return envCache[name];
  }
  scene.environment = envsFor(theme).surface;

  function applyTheme(name) {
    const T = THEMES[name];
    setSkyTheme(sky.material, name);
    scene.fog.color.setRGB(T.fog[0], T.fog[1], T.fog[2]);
    scene.fog.far = T.fogFar;
    renderer.toneMappingExposure = T.exposure;
    hemi.color.setHex(T.hemi[0]); hemi.groundColor.setHex(T.hemi[1]);
    fill.color.setHex(T.fillCol);
    worldApi.applyTheme(name);
    envsFor(name);
    // glowing effects need normal blending on a bright sky or they wash out to white
    const light = name === 'light';
    const mode = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    for (const w of carRig.wheels) {
      w.cone.material.blending = mode; w.cone.material.color.setHex(light ? 0xff5a00 : 0x2f7dff); w.cone.material.needsUpdate = true;
      w.glow.material.blending = mode; w.glow.material.color.setHex(light ? 0xff7a1a : 0x3d8fff); w.glow.material.needsUpdate = true;
    }
    carRig.under.color.setHex(light ? 0xff7a2a : 0x4f9dff);
    carRig.fire.forEach((sp) => { sp.material.blending = mode; sp.material.needsUpdate = true; });
    fx.setTheme(name);
  }
  applyThemeFn = applyTheme;

  const carRig = makeCar();
  scene.add(carRig.car);
  scene.add(carRig.fireGroup);
  const carMats = [];
  carRig.car.traverse((o) => {
    if (o.material && 'envMapIntensity' in o.material && !carMats.includes(o.material)) {
      o.material.userData.baseEnv = o.material.envMapIntensity;
      carMats.push(o.material);
    }
  });
  const PAINT_BLACK = new THREE.Color(0x050506), PAINT_RUST = new THREE.Color(0x3d2415);
  const GLASS_CLEAR = new THREE.Color(0x0b1620), GLASS_FROST = new THREE.Color(0x3a4a54);

  const engineGlow = new THREE.PointLight(0xff6a1a, 0, 10, 2);
  engineGlow.position.set(0, 1.25, 1.5);
  carRig.car.add(engineGlow);

  const orbit = buildOrbitCards();
  scene.add(orbit.group);


  const fx = makeFx(scene, camera);

  // contact shadow
  const bc = document.createElement('canvas'); bc.width = bc.height = 128;
  const bg = bc.getContext('2d');
  const gr = bg.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  bg.fillStyle = gr; bg.fillRect(0, 0, 128, 128);
  const blobGroup = new THREE.Group();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.scale.set(3.4, 5.6, 1);
  blobGroup.add(blob);
  scene.add(blobGroup);

  applyTheme(theme);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  window.__cardXY = (i) => { const v = orbit.items[i].holder.position.clone().project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };

  // ---- picking the orbiting cards
  let interactive = false;
  const ndcOf = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1];
  };
  canvas.addEventListener('pointermove', (e) => {
    if (!interactive || ui.isOpen() || e.pointerType === 'touch') { orbit.setHover(-1); canvas.style.cursor = ''; return; }
    const [x, y] = ndcOf(e);
    const i = orbit.pick(x, y, camera);
    orbit.setHover(i);
    canvas.style.cursor = i >= 0 ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => { orbit.setHover(-1); canvas.style.cursor = ''; });
  canvas.addEventListener('click', (e) => {
    if (!interactive || ui.isOpen()) return;
    const [x, y] = ndcOf(e);
    const i = orbit.pick(x, y, camera);
    if (i >= 0) { orbit.setHover(-1); ui.openDetail(i); }
  });

  // ---------------------------------------------------------------- loop
  const prevPos = new THREE.Vector3();
  let last = performance.now(), time = 0, smokeAcc = 0, dmgSmokeAcc = 0, sparkAcc = 0, wreckAcc = 0;
  let lastFov = 0, slow = 0, firstFrame = true, finaleShown = false;
  const tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3(), tmpVel = new THREE.Vector3();
  const r1 = () => Math.random() - 0.5;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (dt > 0.034) slow++; else slow = Math.max(0, slow - 1);
    if (slow > 40 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false); slow = 0; }

    const target = pFromScroll();
    let jumped = false;
    if (skipJump) { p = target; skipJump = false; jumped = true; }
    else p += (target - p) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(target - p) < 1e-5) p = target;

    const pose = carPose(p);
    const env = envState(p, pose);
    const speed = (firstFrame || jumped) ? 0 : Math.min(120, pose.pos.distanceTo(prevPos) / Math.max(dt, 1e-3));
    prevPos.copy(pose.pos);

    // ---- fresh car for every run: back before the launch means a brand-new, undamaged car
    if (p < PH.launch - 0.01 && (opened.size > 0 || damage > 0.0005 || damageTarget > 0 || hit > 0)) {
      opened.clear(); damageTarget = 0; damage = 0; hit = 0; pendingHit = false; burst = false;
    }

    // ---- damage state (cards opened); only shows once the car has left the road
    damage += (damageTarget - damage) * (1 - Math.exp(-dt * 0.9));
    const dmg = damage * smooth(0.345, 0.385, p);
    hit = Math.max(0, hit - dt * 1.5);

    // ---- overlays / HUD / narration
    intro.style.opacity = String(1 - smooth(0.004, 0.03, p));
    intro.style.transform = `translateY(${-smooth(0, 0.03, p) * 24}px)`;
    hud.classList.toggle('show-brand', p > 0.03);
    replayBtn.hidden = p < PH.cards;
    flash.style.opacity = String(clamp(env.flash, 0, 1));
    blackout.style.opacity = String(clamp(env.fade, 0, 1));
    for (const n of narr) {
      const o = smooth(n.a0, n.a1, p) * (1 - smooth(n.b0, n.b1, p));
      n.el.style.opacity = String(o);
      if (!n.el.classList.contains('doom')) n.el.style.transform = `translateY(${(1 - o) * 12}px)`;
      n.el.querySelectorAll('a').forEach((a) => { a.style.pointerEvents = o > 0.6 ? 'auto' : 'none'; });
    }
    interactive = env.cardsVis > 0.6 && !ui.isOpen();
    hintEl.style.opacity = interactive && opened.size === 0 ? '1' : '0';
    ui.setAccess(env.cardsVis > 0.6);
    const showFinale = p >= PH.cards - 0.001;
    if (showFinale !== finaleShown) {
      finaleShown = showFinale;
      finale.classList.toggle('show', showFinale);
      finale.setAttribute('aria-hidden', showFinale ? 'false' : 'true');
    }

    // ---- car
    const car = carRig.car;
    car.position.copy(pose.pos);
    car.position.y += Math.sin(time * 1.4) * 0.12 * env.space;
    car.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    if (dmg > 0.001 || hit > 0.001) {
      car.rotation.z += dmg * 0.07 * Math.sin(time * 2.3) + hit * 0.2 * Math.sin(time * 31);
      car.rotation.x += dmg * 0.04 * Math.sin(time * 1.7 + 1);
    }
    carRig.paint.color.lerpColors(PAINT_BLACK, PAINT_RUST, dmg);
    carRig.paint.roughness = lerp(0.3, 0.82, dmg);
    carRig.paint.clearcoat = lerp(1, 0.08, dmg);
    carRig.paint.metalness = lerp(0.5, 0.25, dmg);
    carRig.glass.color.lerpColors(GLASS_CLEAR, GLASS_FROST, dmg);
    carRig.glass.roughness = lerp(0.04, 0.55, dmg);

    const steer = clamp(-(pose.yaw - pose.roadYaw) * 0.9, -0.55, 0.55) * (p <= PH.drive ? 1 : 0);
    const spinRate = (p <= PH.drive ? speed : 0) / 0.37;
    const sput = dmg > 0.12 ? (Math.sin(time * 9.3) * Math.sin(time * 5.1 + 1.0) > 1 - dmg * 0.9 ? 0.12 : 1) : 1;
    const thrust = pose.thrust * sput;
    for (const w of carRig.wheels) {
      w.spin.rotation.x += spinRate * dt;
      w.pivot.rotation.set(0, w.front ? steer : 0, -w.side * pose.fold * Math.PI / 2);
      const flick = 0.82 + 0.18 * Math.sin(time * 40 + w.side * 3 + (w.front ? 1 : 0));
      w.cone.material.opacity = 0.62 * thrust * flick;
      w.cone.scale.set(1, 0.85 + 0.5 * thrust * flick, 1);
      w.glow.material.opacity = 1.0 * thrust * (0.9 + 0.1 * flick);
    }
    carRig.under.intensity = 70 * thrust;
    engineGlow.intensity = dmg > 0.2 ? dmg * 38 * (0.55 + 0.45 * Math.sin(time * 23) * Math.sin(time * 11 + 1)) : 0;
    const lampK = dmg > 0.25 && Math.sin(time * 17 + 2) * Math.sin(time * 7) > 1 - dmg * 0.8 ? 0.15 : 1;
    for (const l of carRig.lamps) l.intensity = 90 * lampK;

    // contact shadow
    const onGround = p <= PH.drive || p > PH.fall;
    blobGroup.visible = onGround;
    if (onGround) {
      blobGroup.position.set(pose.pos.x, pose.pos.y + 0.07, pose.pos.z);
      blobGroup.rotation.y = pose.yaw;
    }

    // fire (re-entry plasma)
    carRig.fireGroup.visible = env.fire > 0.01;
    if (carRig.fireGroup.visible) {
      carRig.fire.forEach((sp, i) => {
        const sd = sp.userData.seed;
        sp.position.set(
          pose.pos.x + Math.sin(time * 7 + sd) * 0.8,
          pose.pos.y + 0.8 + (i / 12) * 6.5 * (0.6 + env.fire * 0.6),
          pose.pos.z + Math.cos(time * 6 + sd) * 0.8
        );
        const s = (2.4 + i * 0.55) * (0.78 + 0.22 * Math.sin(time * 18 + sd)) * (0.6 + env.fire * 0.7);
        sp.scale.set(s, s, 1);
        sp.material.opacity = env.fire * Math.max(0.1, 0.8 - i * 0.05);
      });
    }

    // tire smoke while drifting
    if (p <= PH.drive && speed > 2 && pose.drift > 0.18) {
      smokeAcc = Math.min(4, smokeAcc + dt * speed * pose.drift * 0.55);
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        for (const sx of [-1, 1]) {
          tmpV.set(sx * 0.84, 0.25, -1.36);
          car.localToWorld(tmpW.copy(tmpV));
          fx.spawnSmoke(tmpW, tmpVel.set(r1() * 0.9, 0.5 + Math.random() * 0.8, r1() * 0.9), 0.9 + Math.random() * 0.8, 1.2 + Math.random() * 0.8);
        }
      }
    }

    // damage: dark engine smoke + sparks
    if (dmg > 0.1 && p <= PH.fall + 0.01) {
      dmgSmokeAcc += dt * dmg * 18;
      while (dmgSmokeAcc >= 1) {
        dmgSmokeAcc -= 1;
        tmpV.set(r1() * 0.5, 1.1, 1.1 + Math.random() * 0.7);
        car.localToWorld(tmpW.copy(tmpV));
        fx.spawnSmoke(tmpW, tmpVel.set(r1() * 0.6, 1.0 + Math.random(), r1() * 0.6), 0.8 + Math.random() * 0.8, 2.2 + Math.random(), 0x56525e, 0.55);
      }
      sparkAcc += dt * dmg * dmg * 16;
      while (sparkAcc >= 1) {
        sparkAcc -= 1;
        tmpV.set(r1() * 1.6, 0.4 + Math.random() * 1.1, r1() * 3.6);
        car.localToWorld(tmpW.copy(tmpV));
        fx.spawnSpark(tmpW, tmpVel.set(r1() * 6, Math.random() * 4, r1() * 6));
      }
    }
    if (burst) {
      burst = false;
      for (let k = 0; k < 18; k++) {
        tmpV.set(r1() * 1.6, 0.4 + Math.random() * 1.1, r1() * 3.6);
        car.localToWorld(tmpW.copy(tmpV));
        fx.spawnSpark(tmpW, tmpVel.set(r1() * 12, Math.random() * 8, r1() * 12));
      }
      for (let k = 0; k < 7; k++) {
        tmpV.set(r1() * 0.8, 1.0, 1.0 + Math.random());
        car.localToWorld(tmpW.copy(tmpV));
        fx.spawnSmoke(tmpW, tmpVel.set(r1() * 2, 1.5 + Math.random() * 2, r1() * 2), 1.2 + Math.random(), 2.4, 0x56525e, 0.6);
      }
    }
    // smouldering wreck after the crash
    if (p > PH.fall + 0.004) {
      wreckAcc += dt * 7;
      while (wreckAcc >= 1) {
        wreckAcc -= 1;
        tmpW.set(CRASH.x + r1() * 2.4, CRASH.y + 1.0, CRASH.z + r1() * 2.4);
        fx.spawnSmoke(tmpW, tmpVel.set(r1() * 0.6, 3 + Math.random() * 2, r1() * 0.6), 3 + Math.random() * 2, 4.5, 0x16151a, 0.5);
      }
    }
    fx.updateSmoke(dt);

    // crash fx
    fx.updateDebris(p > PH.fall && !finaleShown ? env.pc * 3.4 : 0, CRASH);
    fx.updateCrashFx(p > PH.fall ? env.pc : 0, CRASH);
    fx.updateStreaks(env.streaks, time);

    // ---- camera
    const cp = cameraPose(p, time, camera.aspect);
    camera.position.copy(cp.pos);
    const sh = env.shake + hit * 0.05;
    if (sh > 0.0001) {
      camera.position.x += (Math.sin(time * 61) + Math.sin(time * 37 + 1)) * sh * 6;
      camera.position.y += (Math.sin(time * 53 + 2) + Math.sin(time * 29)) * sh * 6;
      camera.position.z += (Math.sin(time * 47 + 4)) * sh * 6;
    }
    camera.lookAt(cp.look);
    if (Math.abs(cp.fov - lastFov) > 0.01) { camera.fov = cp.fov; camera.updateProjectionMatrix(); lastFov = cp.fov; }

    // ---- environment
    sky.position.copy(camera.position);
    sky.material.uniforms.uSpace.value = env.space;
    stars.position.copy(camera.position);
    const T = THEMES[theme];
    stars.material.opacity = env.stars * T.stars;
    terrainMat.opacity = env.terrainOpacity;
    world.visible = env.terrainOpacity > 0.01;
    earth.group.visible = env.earthOpacity > 0.01;
    earth.earthMat.uniforms.uOpacity.value = env.earthOpacity;
    earth.earthMat.uniforms.uTime.value = time;
    earth.atmoMat.uniforms.uOpacity.value = env.earthOpacity * smooth(0.2, 0.9, env.space);

    const s = env.space;
    sun.color.lerpColors(T.c0, T.c1, s);
    sun.intensity = lerp(T.sunI[0], T.sunI[1], s);
    sun.position.lerpVectors(T.sunDir, SUN_SPACE, s).multiplyScalar(100);
    hemi.intensity = lerp(T.hemiI[0], T.hemiI[1], s);
    fill.intensity = lerp(T.fillI[0], T.fillI[1], s);
    earth.earthMat.uniforms.uSunDir.value.copy(SUN_SPACE);

    const useSpace = s > 0.5;
    const E = envsFor(theme);
    scene.environment = useSpace ? E.space : E.surface;
    const envK = useSpace ? (s - 0.5) * 2 : 1 - s * 2;
    const envLight = theme === 'light' ? 0.4 : 1;
    for (const m of carMats) m.envMapIntensity = m.userData.baseEnv * (0.15 + 0.85 * envK) * envLight;
    document.body.classList.toggle('veil', env.fade > 0.35);

    // ---- orbiting cards
    orbit.update(pose.pos, camera, env.cardsVis, time * 0.12 + (p - PH.launch) * 30, time);

    renderer.render(scene, camera);

    if (firstFrame) { firstFrame = false; loader.classList.add('done'); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
