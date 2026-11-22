import test from "node:test";
import assert from "node:assert/strict";
import { seasonalPricing, isOversizeGarment, discountableSubtotal } from "../src/promotion-pricing.js";

const shirt = { id: "classic", name: "CROMO_06", category: "Camisetas", subcategory: "Clásica" };
const big = { id: "big", name: "CROMO_06", category: "Camisetas", subcategory: "Oversize" };
const opts = { storefrontPromotion: { enabled: true, title: "2 camisetas a 10 €", quantity: 2, unitPrice: 10, excludeOversize: true, productIds: ["classic", "big"] }};
const line = (productId, qty, unitPrice = 18) => ({ productId, qty, unitPrice });

test("bundle applies to 2 eligible units (same design; classic cut)", () => {
  const out = seasonalPricing([line("classic", 2)], opts, [shirt, big]);
  assert.equal(out.discount, 16);
  assert.equal(out.eligibleQuantity, 2);
  assert.equal(out.applied, true);
});
test("oversize does not count towards the minimum nor receive a discount", () => {
  const out = seasonalPricing([line("classic", 1), line("big", 1)], opts, [shirt, big]);
  assert.equal(out.discount, 0);
  assert.equal(out.eligibleQuantity, 1);
});
test("same artwork in different normal shirts qualifies", () => {
  const other = { ...shirt, id: "other" };
  const setting = { storefrontPromotion: { ...opts.storefrontPromotion, productIds: ["classic", "other"] } };
  assert.equal(seasonalPricing([line("classic", 1), line("other", 1, 16)], setting, [shirt, other]).discount, 14);
});
test("a cheaper product never becomes more expensive", () => {
  const out = seasonalPricing([line("classic", 2, 8)], opts, [shirt]);
  assert.equal(out.discount, 0);
});
test("missing or disabled campaign is inert", () => {
  assert.equal(seasonalPricing([line("classic", 2)], {}, [shirt]).discount, 0);
  assert.equal(seasonalPricing([line("classic", 2)], {storefrontPromotion: {...opts.storefrontPromotion,enabled:false}}, [shirt]).discount, 0);
});
test("unselected products never qualify", () => {
  assert.equal(seasonalPricing([line("other", 4)], opts, [shirt, { ...shirt, id:"other"}]).discount, 0);
});
test("oversize detection uses assigned mockup name too", () => {
  assert.equal(isOversizeGarment(shirt,{garmentMockupId:"m1"},[{id:"m1",name:"Camiseta Oversize"}]),true);
});

test("discountable subtotal excludes sale-tagged products", () => {
  const sale = {...shirt, id:"sale", tags:{oferta:true}, salePrice:12};
  const result = discountableSubtotal([line("sale", 1, 12), line("classic", 1, 18)], {}, [sale, shirt]);
  assert.equal(result.subtotal, 18);
  assert.equal(result.hasExcluded, true);
});
test("promoted products cannot receive a second discount", () => {
  const result = discountableSubtotal([line("classic", 2), line("regular", 1, 23)], opts, [shirt, { ...shirt, id:"regular" }]);
  assert.equal(result.seasonal.discount, 16);
  assert.equal(result.subtotal, 23);
});
test("a fully promotional basket has no eligible additional-discount amount", () => {
  const result = discountableSubtotal([line("classic", 2)], opts, [shirt]);
  assert.equal(result.subtotal, 0);
  assert.equal(result.hasExcluded, true);
});
test("an inactive seasonal campaign does not exclude full-price products", () => {
  const result = discountableSubtotal([line("classic", 1)], opts, [shirt]);
  assert.equal(result.seasonal.applied, false);
  assert.equal(result.subtotal, 18);
});

test("a qualifying campaign is excluded even when the special price brings no reduction", () => {
  const result = discountableSubtotal([line("classic", 2, 8)], opts, [shirt]);
  assert.equal(result.seasonal.discount, 0);
  assert.equal(result.subtotal, 0);
});
