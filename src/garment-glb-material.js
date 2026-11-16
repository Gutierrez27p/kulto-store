import * as THREE from "three";

// Recolor the actual cloth, not a colored layer blended with an old base map.
// Otherwise a blue/red texture can make a user-selected white shirt stay blue.
export function recolorGarmentMaterial(material, hex) {
  const valid = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex : "#ffffff";
  const clone = material?.clone?.() || new THREE.MeshStandardMaterial();
  if (clone.color) clone.color.set(valid);
  if ("map" in clone) clone.map = null;
  if ("emissiveMap" in clone) clone.emissiveMap = null;
  if (clone.emissive) clone.emissive.set("#000000");
  if ("roughness" in clone) clone.roughness = 0.9;
  if ("metalness" in clone) clone.metalness = 0;
  clone.needsUpdate = true;
  return clone;
}
