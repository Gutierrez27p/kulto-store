// Public 3D presentation requires a reviewed clothing mesh. Programmatically
// extruded placeholders are intentionally not available to customers.
export function isApproved3DModel(model) {
  return Boolean(model?.enabled !== false && model?.glbApproved === true && typeof model?.glbUrl === "string" && /^https:\/\/[^\s]+$/i.test(model.glbUrl.trim()));
}
export function preferredGarmentView({hasColorPhotos=false,hasMockup=false}={}) {
  if (hasColorPhotos) return "photo";
  if (hasMockup) return "mockup";
  return "photo";
}
