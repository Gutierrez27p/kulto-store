import test from "node:test";
import assert from "node:assert/strict";
import {growSilhouette,safeRecolorPixel} from "../src/garment-color.js";
import {selectGarmentArt} from "../src/garment-art.js";
test("dark fabric edge is never blended with stale white pixels",()=>{
 assert.deepEqual(safeRecolorPixel([245,245,245],[24,35,43],.50,1,[60,61,65],false),[24,35,43]);
});
test("antialias from backdrop instead of white halo",()=>{
 const rgb=safeRecolorPixel([255,255,255],[10,20,30],.09,1,[48,48,48],false);assert.ok(rgb.every(v=>v<49));
});
test("alpha garment does not blend white source RGB into edges",()=>{
 assert.deepEqual(safeRecolorPixel([255,255,255],[25,35,45],.04,1,[255,255,255],true),[25,35,45]);
});
test("expand silhouette only one pixel",()=>{
 const m=new Uint8Array(25);m[12]=1;const g=growSilhouette(m,5,5,1);assert.equal(g[11],1);assert.equal(g[0],0);
});
test("separate front and back artwork",()=>{
 assert.deepEqual(selectGarmentArt({design:"a.png",backDesign:"b.png"},{}),{front:"a.png",back:"b.png"});
 assert.deepEqual(selectGarmentArt({design:"front.png"},{}),{front:"front.png",back:null});
});
test("blank custom front never erases back artwork",()=>{
 assert.deepEqual(selectGarmentArt({design:"a.png",backDesign:"b.png"},{},null),{front:null,back:"b.png"});
});
