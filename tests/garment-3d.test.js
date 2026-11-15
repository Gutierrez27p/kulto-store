import test from "node:test";
import assert from "node:assert/strict";
import {infer3DKind,garmentMeasurements} from "../src/garment-3d.js";
test("3D kinds support cut-specific garment shapes",()=>{
 assert.equal(infer3DKind({name:"Camisetas Premium Oversize_01"}),"camiseta-oversize");
 assert.equal(infer3DKind({name:"Sudadera con capucha"}),"sudadera-capucha");
 assert.equal(infer3DKind({name:"Sudadera sin capucha"}),"sudadera-sin-capucha");
 assert.equal(infer3DKind({name:"Bolsa tote"}),"tote-bag");
 assert.equal(infer3DKind({name:"Top deportivo"}),"top");
 assert.equal(infer3DKind({name:"Accesorio llavero"}),null);
});
test("models override normalized names and have independent geometry",()=>{
 assert.equal(infer3DKind({name:"Camiseta normal"},{garmentKind:"camiseta-oversize"}),"camiseta-oversize");
 assert.ok(garmentMeasurements("camiseta-oversize").width>garmentMeasurements("camiseta-clasica").width);
 assert.ok(garmentMeasurements("sudadera-capucha").hoodie);
});
