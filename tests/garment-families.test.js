import test from "node:test";
import assert from "node:assert/strict";
import { GARMENT_FAMILIES, garmentFamilyOf, garmentFitOf, modelMatchesProduct } from "../src/garment-families.js";

test("oversize and regular shirts belong to the same family but different fits", () => {
  const classic={name:"CROMO_06",category:"Camisetas",subcategory:"Normal"};
  const oversize={name:"CROMO_06",category:"Camisetas",subcategory:"Oversize"};
  assert.equal(garmentFamilyOf(classic),"camisetas");
  assert.equal(garmentFamilyOf(oversize),"camisetas");
  assert.equal(garmentFitOf(classic),"Clásica");
  assert.equal(garmentFitOf(oversize),"Oversize");
});
test("hoodies and crewnecks are both sweatshirts", () => {
 const hood={category:"Sudaderas con capucha"};
 const without={category:"Sudaderas sin capucha"};
 assert.equal(garmentFamilyOf(hood),"sudaderas");
 assert.equal(garmentFitOf(hood),"Con capucha");
 assert.equal(garmentFitOf(without),"Sin capucha");
});
test("tote bags and sports tops have their own family", () => {
 assert.equal(garmentFamilyOf({category:"Tote bags"}),"tote");
 assert.equal(garmentFamilyOf({category:"Tops deportivos"}),"tops");
 assert.ok(GARMENT_FAMILIES.some(x=>x.id==="tote"));
});
test("the shared mockup never applies a classic base to an oversize variant", () => {
 const base={garmentKind:"camiseta-clasica"};
 assert.ok(modelMatchesProduct(base,{category:"Camisetas",subcategory:"Normal"}));
 assert.ok(!modelMatchesProduct(base,{category:"Camisetas",subcategory:"Oversize"}));
 assert.ok(modelMatchesProduct({garmentKind:"camiseta-oversize"},{category:"Camisetas",subcategory:"Oversize"}));
});
test("old untyped mockups remain manually compatible",()=> {
 assert.ok(modelMatchesProduct({name:"Antiguo"},{category:"Tote bags"}));
});
