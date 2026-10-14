import * as THREE from './vendor/three.module.min.js';
import { roadCurve, terrainY, ROAD_LEN } from './world.js';

const { MathUtils } = THREE;
const clamp = MathUtils.clamp, lerp = MathUtils.lerp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const UP = new THREE.Vector3(0, 1, 0);

export const PH = { drive: 0.25, launch: 0.32, space: 0.68, fall: 0.80, crashEnd: 0.855, cards: 0.86 };

export const CRASH = new THREE.Vector3(26, 0, -112);
CRASH.y = terrainY(CRASH.x, CRASH.z);

const P0 = roadCurve.getPointAt(1);
const T0 = roadCurve.getTangentAt(1);
const H0 = new THREE.Vector3(T0.x, 0, T0.z).normalize();
const S0 = T0.y / Math.hypot(T0.x, T0.z);
const LAUNCH_H = 1800, LAUNCH_D = 900;
export const SPACE_POS = P0.clone().addScaledVector(H0, LAUNCH_D).add(new THREE.Vector3(0, LAUNCH_H, 0));
const YAW0 = Math.atan2(T0.x, T0.z);
const END_PITCH = -Math.atan2(S0 * LAUNCH_D + 2 * (LAUNCH_H - LAUNCH_D * S0), LAUNCH_D);

export function forwardOf(yaw, pitch) {
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

export function carPose(p) {
  const o = { roadS: ROAD_LEN, pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, fold: 0, thrust: 0, drift: 0, roadYaw: YAW0, tumble: 0 };

  if (p <= PH.drive) {
    const u = clamp(p / PH.drive, 0, 1);
    const tc = 0.012 + 0.97 * (0.7 * u + 0.3 * u * u);
    const P = roadCurve.getPointAt(tc), T = roadCurve.getTangentAt(tc);
    const side = new THREE.Vector3().crossVectors(T, UP).normalize();
    const phase = u * 15.0;
    const amp = smooth(0.0, 0.07, u) * (1 - smooth(0.9, 1.0, u));
    const driftYaw = 0.46 * Math.sin(phase) * amp;
    const lat = 1.5 * Math.sin(phase - 0.9) * amp;
    o.pos.copy(P).addScaledVector(side, lat);
    o.pos.y += 0.02;
    o.roadS = tc * ROAD_LEN;
    o.roadYaw = Math.atan2(T.x, T.z);
    o.yaw = o.roadYaw + driftYaw;
    o.pitch = -Math.asin(clamp(T.y, -1, 1));
    o.roll = -driftYaw * 0.3;
    o.drift = Math.abs(Math.sin(phase)) * amp * 0.9 + 0.1 * smooth(0, 0.05, u);
    return o;
  }

  if (p <= PH.launch) {
    const u = clamp((p - PH.drive) / (PH.launch - PH.drive), 0, 1);
    const dx = LAUNCH_D * u;
    const dy = LAUNCH_D * S0 * u + (LAUNCH_H - LAUNCH_D * S0) * u * u;
    const ddx = LAUNCH_D, ddy = LAUNCH_D * S0 + 2 * (LAUNCH_H - LAUNCH_D * S0) * u;
    o.pos.copy(P0).addScaledVector(H0, dx);
    o.pos.y += dy;
    o.yaw = YAW0;
    o.pitch = -Math.atan2(ddy, ddx);
    o.roll = Math.sin(u * 7) * 0.05;
    o.fold = smooth(0.12, 0.5, u);
    o.thrust = smooth(0.1, 0.45, u);
    return o;
  }

  if (p <= PH.space) {
    const u = clamp((p - PH.launch) / (PH.space - PH.launch), 0, 1);
    o.pos.copy(SPACE_POS);
    o.yaw = YAW0 + 0.25 * Math.sin(u * 3.2);
    o.pitch = END_PITCH * (1 - smooth(0, 0.28, u)) + 0.04 * Math.sin(u * 5);
    o.roll = 0.09 * Math.sin(u * 4.1);
    o.fold = 1; o.thrust = 1;
    return o;
  }

  const crashPos = CRASH.clone(); crashPos.y += 0.7;
  if (p <= PH.fall) {
    const u = clamp((p - PH.space) / (PH.fall - PH.space), 0, 1);
    const e = Math.pow(u, 2.1);
    const h = u * u * (3 - 2 * u);
    o.pos.set(lerp(SPACE_POS.x, crashPos.x, h), lerp(SPACE_POS.y, crashPos.y, e), lerp(SPACE_POS.z, crashPos.z, h));
    o.yaw = YAW0 + 0.25 * Math.sin(3.2) + u * 1.2;
    o.pitch = lerp(0.04 * Math.sin(5), 1.3, smooth(0.04, 0.7, u));
    o.roll = 12.566 * Math.pow(u, 2.2);
    o.fold = 1 - smooth(0, 0.25, u);
    o.thrust = 1 - smooth(0, 0.1, u);
    o.tumble = u;
    return o;
  }

  o.pos.copy(crashPos);
  o.yaw = YAW0 + 0.25 * Math.sin(3.2) + 1.2;
  o.pitch = 1.22;
  o.roll = 0.35;
  o.tumble = 1;
  return o;
}

// Environment values derived from progress and car altitude
export function envState(p, pose) {
  const y = pose.pos.y;
  const s = {};
  if (p <= PH.drive) s.space = 0;
  else if (p <= PH.launch) s.space = smooth(250, 1500, y);
  else if (p <= PH.space) s.space = 1;
  else if (p <= PH.fall) s.space = smooth(650, 1500, y);
  else s.space = 0;

  s.earthOpacity = p <= PH.launch ? smooth(90, 700, y) : (p <= PH.space ? 1 : (p <= PH.fall ? smooth(450, 1100, y) : 0));
  s.terrainOpacity = 1 - smooth(900, 1350, y);
  s.stars = clamp(s.space * 1.05, 0, 1);

  const u4 = clamp((p - PH.space) / (PH.fall - PH.space), 0, 1);
  s.fire = (p > PH.space && p <= PH.fall) ? smooth(0.42, 0.62, u4) * (1 - smooth(0.985, 1.0, u4)) : 0;

  const pc = clamp((p - PH.fall) / (PH.crashEnd - PH.fall), 0, 1);
  s.pc = p > PH.fall ? pc : 0;
  s.flash = p > PH.fall ? (pc < 0.07 ? pc / 0.07 : Math.exp(-(pc - 0.07) * 8)) : 0;
  s.fade = p > PH.fall ? smooth(0.5, 1.0, pc) * 0.74 : 0;
  s.cardsVis = smooth(0.085, 0.2, (p - PH.launch) / (PH.space - PH.launch)) * (1 - smooth(0.0, 0.3, (p - PH.space) / (PH.fall - PH.space)));
  s.streaks = 0;
  if (p > PH.drive && p <= PH.launch) {
    const u = (p - PH.drive) / (PH.launch - PH.drive);
    s.streaks = smooth(0.25, 0.7, u) * (1 - smooth(0.9, 1, u)) * 0.9;
  } else if (p > PH.space && p <= PH.fall) {
    s.streaks = smooth(0.35, 0.7, u4) * (1 - smooth(0.9, 1, u4)) * 0.8;
  }
  s.shake = 0.012 * s.fire + (p > PH.fall ? 1.0 * Math.pow(1 - pc, 2.2) * smooth(0, 0.03, pc) : 0);
  return s;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function chaseCam(pose, dist, upAmt, az) {
  const F = forwardOf(pose.yaw, pose.pitch);
  const R = new THREE.Vector3().crossVectors(F, UP).normalize();
  const U = new THREE.Vector3().crossVectors(R, F).normalize();
  return pose.pos.clone()
    .addScaledVector(F, -dist * Math.cos(az))
    .addScaledVector(R, dist * Math.sin(az))
    .addScaledVector(U, upAmt);
}

export function cameraPose(p, time, aspect = 1.6) {
  const out = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 52 };
  const pose = carPose(p);
  // portrait screens see a much narrower slice of the world, so pull back and widen the lens
  const port = clamp((0.95 - aspect) / 0.5, 0, 1);

  if (p <= PH.drive) {
    const u = clamp(p / PH.drive, 0, 1);
    const lagPose = carPose(Math.max(0, p - 0.002));
    const a = -0.5 + 1.0 * smooth(0, 1, u) + 0.22 * Math.sin(u * 9);
    const hx = Math.sin(lagPose.roadYaw), hz = Math.cos(lagPose.roadYaw);
    const rx = hz, rz = -hx;
    const dist = 8.0 * (1 + 0.5 * port);
    out.pos.copy(lagPose.pos);
    out.pos.x += (-hx * Math.cos(a) + rx * Math.sin(a)) * dist;
    out.pos.z += (-hz * Math.cos(a) + rz * Math.sin(a)) * dist;
    out.pos.y += (2.7 + 0.8 * Math.sin(u * 5)) * (1 + 0.3 * port);
    out.look.copy(pose.pos);
    out.look.x += hx * 4.2; out.look.z += hz * 4.2; out.look.y += 3.4;
    out.fov = 50 + 6 * smooth(0.85, 1, u) + 24 * port;
    return out;
  }

  if (p <= PH.launch) {
    const u = clamp((p - PH.drive) / (PH.launch - PH.drive), 0, 1);
    const lag = carPose(Math.max(PH.drive, p - 0.0003));
    out.pos.copy(chaseCam(lag, lerp(8.5, 11, u) * (1 + 0.4 * port), lerp(2.8, 2.2, u) * (1 + 0.3 * port), lerp(0.5, -0.25, smooth(0, 1, u))));
    out.look.copy(pose.pos).addScaledVector(forwardOf(pose.yaw, pose.pitch), 3.5);
    out.fov = lerp(56, 70, smooth(0.3, 1, u)) + 14 * port;
    return out;
  }

  if (p <= PH.space) {
    const u = clamp((p - PH.launch) / (PH.space - PH.launch), 0, 1);
    const chase = chaseCam(pose, 11 * (1 + 0.4 * port), 2.2 * (1 + 0.3 * port), -0.25);
    const heading = new THREE.Vector3(Math.sin(YAW0), 0, Math.cos(YAW0));
    const thB = Math.atan2(-heading.z, -heading.x);
    const th = thB + (-0.25) + u * Math.PI * 2.1;
    const r = (25 + 2.5 * Math.sin(u * 5.0)) * (1 + 0.38 * port);
    const el = 0.3 + 0.12 * Math.sin(u * 4.0 + 1.0);
    const orbit = new THREE.Vector3(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el)).multiplyScalar(r).add(pose.pos);
    const w = smooth(0.0, 0.16, u);
    out.pos.lerpVectors(chase, orbit, w);
    out.pos.y += 1.0 * w;
    out.look.copy(pose.pos).add(_a.set(0, 0.7, 0));
    out.fov = lerp(70, 46, smooth(0, 0.2, u)) + 16 * port * smooth(0, 0.2, u);
    return out;
  }

  // fall + crash
  const u = clamp((p - PH.space) / (PH.fall - PH.space), 0, 1);
  const az = 0.6 + 1.0 * u;
  const track = pose.pos.clone().add(_a.set(Math.sin(az) * 17 * (1 + 0.5 * port), (7 + 9 * (1 - u)) * (1 + 0.3 * port), Math.cos(az) * 17 * (1 + 0.5 * port)));
  const ground = CRASH.clone().add(_b.set(-46 * (1 + 0.6 * port), 10 + 8 * port, 84 * (1 + 0.6 * port)));
  const w = smooth(0.58, 0.9, u);
  out.pos.lerpVectors(track, ground, w);
  const pcL = clamp((p - PH.fall) / (PH.crashEnd - PH.fall), 0, 1);
  out.look.copy(pose.pos).add(_a.set(0, 0.5 + 6 * pcL, 0));
  if (p <= PH.fall) out.look.lerp(_b.copy(CRASH).add(_a.set(0, 16, 0)), smooth(0.72, 0.97, u));
  out.fov = lerp(58, 50, smooth(0.5, 1, u)) + 12 * port;
  return out;
}
