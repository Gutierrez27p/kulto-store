import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { recolorGarmentMaterial } from "../src/garment-glb-material.js";

test("user-selected white and black replace original colored garment GLB textures", () => {
  const base = new THREE.MeshStandardMaterial({color:"#2f5f9e",map:new THREE.Texture(),metalness:0.8});
  const white = recolorGarmentMaterial(base,"#ffffff");
  const dark = recolorGarmentMaterial(base,"#202126");
  assert.equal(white.color.getHexString(),"ffffff");
  assert.equal(dark.color.getHexString(),"202126");
  assert.equal(white.map,null);
  assert.equal(dark.map,null);
  assert.equal(base.color.getHexString(),"2f5f9e");
  assert.ok(base.map);
  assert.equal(dark.metalness,0);
  assert.ok(dark.roughness>=0.8);
  base.dispose();white.dispose();dark.dispose();
});

test("invalid user-selected color becomes a neutral white rather than corrupted tint", () => {
  const m = recolorGarmentMaterial(new THREE.MeshStandardMaterial(),"not-color");
  assert.equal(m.color.getHexString(),"ffffff");
  m.dispose();
});
