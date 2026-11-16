import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { getGarmentPrintPosition, createGarmentSurfacePrint } from "../src/garment-surface-print.js";

function makeShirtBody() {
  const rig = new THREE.Group();
  const garment = new THREE.Group();
  garment.add(new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.8, 0.42),
    new THREE.MeshStandardMaterial({ color: "#ffffff" })
  ));
  rig.add(garment);
  rig.updateMatrixWorld(true);
  return { rig, garment };
}

test("print placement follows model bounds, not artificial garment measurements", () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -0.2), new THREE.Vector3(1, 1, 0.2));
  const center = getGarmentPrintPosition(bounds, { x: 50, y: 50 });
  const left = getGarmentPrintPosition(bounds, { x: 25, y: 50 });
  assert.equal(center.x, 0);
  assert.equal(center.y, 0);
  assert.ok(left.x < center.x);
});

test("real front and back PNG prints conform to opposite mesh surfaces", () => {
  const { rig, garment } = makeShirtBody();
  const texture = new THREE.Texture();
  for (const back of [false, true]) {
    const decal = createGarmentSurfacePrint(garment, texture, { back, width: 0.65, height: 0.4 });
    assert.ok(decal, "The actual clothing mesh must receive a decal");
    const points = decal.geometry.getAttribute("position");
    assert.ok(points.count >= 3);
    for (let i = 0; i < points.count; i++) {
      assert.ok(back ? points.getZ(i) < -0.1 : points.getZ(i) > 0.1, "The print must stay on the requested side");
    }
    assert.equal(decal.userData.side, back ? "back" : "front");
    decal.geometry.dispose();
    decal.material.dispose();
  }
  assert.equal(rig.children.length, 1);
});

test("projection preserves the user's current 3D rotation and never fakes a surface", () => {
  const { rig, garment } = makeShirtBody();
  rig.rotation.y = 0.8;
  const before = rig.quaternion.clone();
  const print = createGarmentSurfacePrint(garment, new THREE.Texture(), { width: 0.4, height: 0.3 });
  assert.ok(print);
  assert.ok(rig.quaternion.angleTo(before) < 1e-8);
  print.geometry.dispose();
  print.material.dispose();
  const empty = new THREE.Group();
  assert.equal(createGarmentSurfacePrint(empty, new THREE.Texture()), null);
});
