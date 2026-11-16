import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";

// A PNG is projected onto the real triangles of an approved garment GLB.
// A floating image plane is never an acceptable substitute: it would detach
// from the fabric on rotation and can leave the back completely blank.
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const asNumber = (value, fallback) => {
  const n = Number(value);
  return value !== "" && value != null && Number.isFinite(n) ? n : fallback;
};

export function getGarmentPrintPosition(bounds, place = {}) {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  return new THREE.Vector3(
    center.x + clamp((asNumber(place.x, 50) - 50) / 50, -1, 1) * size.x * 0.27,
    center.y + clamp((50 - asNumber(place.y, 42)) / 50, -1, 1) * size.y * 0.38,
    center.z
  );
}

export function createGarmentSurfacePrint(garment, texture, { back = false, width = 0.8, height = 0.8, place = {} } = {}) {
  if (!garment || !texture) return null;
  // DecalGeometry uses world coordinates. Temporarily align the rotating rig
  // with the garment's rest pose so the decal follows the rig on later spins.
  const rig = garment.parent;
  const savedRotation = rig?.quaternion?.clone();
  try {
    if (rig) rig.quaternion.identity();
    garment.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(garment);
    if (bounds.isEmpty()) return null;
    const size = bounds.getSize(new THREE.Vector3());
    if (size.x < 0.05 || size.y < 0.05 || size.z < 0.005) return null;
    const center = getGarmentPrintPosition(bounds, place);
    const dir = back ? 1 : -1;
    const origin = new THREE.Vector3(center.x, center.y, back ? bounds.min.z - 1 : bounds.max.z + 1);
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, dir), 0, size.z + 2);
    const hit = ray.intersectObject(garment, true).find(candidate => candidate.object?.isMesh && candidate.face);
    if (!hit) return null;

    const w = clamp(asNumber(place.w, 0) > 0 ? width * (asNumber(place.w, 40) / 40) : width, 0.10, Math.max(0.12, size.x * 0.76));
    const h = clamp(height * w / Math.max(width, 0.01), 0.08, Math.max(0.1, size.y * 0.67));
    // The projector must not reach the opposite side of the shirt/bag.
    const depth = clamp(size.z * 0.35, 0.05, 0.3);
    const outward = back ? -1 : 1;
    const pos = hit.point.clone().add(new THREE.Vector3(0, 0, outward * 0.012));
    const angle = THREE.MathUtils.degToRad(asNumber(place.rot, 0));
    const rotation = new THREE.Euler(0, back ? Math.PI : 0, (back ? -1 : 1) * angle, "YXZ");
    const geometry = new DecalGeometry(hit.object, pos, rotation, new THREE.Vector3(w, h, depth));
    if (!geometry.getAttribute("position") || geometry.getAttribute("position").count < 3) {
      geometry.dispose();
      return null;
    }
    // Print and fabric share a coordinate system. This prevents drifting when
    // customers rotate, zoom, or switch from front to back.
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: 0.025, depthTest: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
      polygonOffsetUnits: -3, side: THREE.DoubleSide, toneMapped: false
    });
    const print = new THREE.Mesh(geometry, mat);
    print.renderOrder = 5;
    print.userData.side = back ? "back" : "front";
    return print;
  } finally {
    if (rig && savedRotation) {
      rig.quaternion.copy(savedRotation);
      rig.updateWorldMatrix(true, true);
    }
  }
}
