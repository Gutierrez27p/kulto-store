import { garmentFamilyOf } from "./garment-families.js";

// One photographic base serves every t-shirt, independently of its catalog
// category (classic, oversize, printed collections, etc.). Model files are
// reused; individual artwork and original product photos are never modified.
export const isTshirtProduct = (product) => garmentFamilyOf(product) === "camisetas";
export const isTshirtMockup = (model) => Boolean(
  model?.base && model.enabled !== false &&
  ["camiseta-clasica", "camiseta-oversize"].includes(model.garmentKind)
);
export function sharedTshirtModel(models = [], product = {}) {
  if (!isTshirtProduct(product)) return null;
  const matching = models.filter(isTshirtMockup);
  return matching.find((model) => model.sharedForAllTshirts === true) || matching[0] || null;
}

// A color swatch must show the same recolored mockup, even when the product
// also has uploaded color photographs in its gallery.
export function preferredPhotoOrMockup({ hasMockup = false, hasColorPhotos = false, preferMockup = false } = {}) {
  if (hasMockup && preferMockup) return "mockup";
  return hasColorPhotos ? "photo" : hasMockup ? "mockup" : "photo";
}
