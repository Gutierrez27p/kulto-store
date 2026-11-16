import test from "node:test";
import assert from "node:assert/strict";
import {isApproved3DModel,preferredGarmentView} from "../src/garment-viewer-policy.js";
test("unreviewed procedural model can never be displayed as customer 3D",()=>{
  assert.equal(isApproved3DModel(null),false);
  assert.equal(isApproved3DModel({garmentKind:"camiseta-clasica"}),false);
  assert.equal(isApproved3DModel({glbUrl:"https://example.org/tee.glb"}),false);
  assert.equal(isApproved3DModel({glbUrl:"https://example.org/tee.glb",glbApproved:false}),false);
});
test("only an explicitly approved external GLB activates the 3D control",()=>{
  assert.equal(isApproved3DModel({glbUrl:"https://example.org/tee.glb",glbApproved:true}),true);
  assert.equal(isApproved3DModel({glbUrl:"javascript:bad",glbApproved:true}),false);
  assert.equal(isApproved3DModel({glbUrl:"https://example.org/tee.glb",glbApproved:true,enabled:false}),false);
});
test("prefer photographed selected-color product, then quality two-sided mockup",()=>{
 assert.equal(preferredGarmentView({hasColorPhotos:true,hasMockup:true}),"photo");
 assert.equal(preferredGarmentView({hasColorPhotos:false,hasMockup:true}),"mockup");
 assert.equal(preferredGarmentView({hasColorPhotos:false,hasMockup:false}),"photo");
});
