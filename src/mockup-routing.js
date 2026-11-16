import { garmentFamilyOf, garmentFitOf, GARMENT_MODEL_TYPES } from "./garment-families.js";

const normalise = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

export function mockupScopeOfProduct(product = {}) {
  const family = garmentFamilyOf(product);
  if (family === "camisetas") return "camisetas";
  if (family === "sudaderas") return garmentFitOf(product) === "Sin capucha" ? "sudadera-sin-capucha" : "sudadera-capucha";
  if (family === "tote") return "tote-bag";
  if (family === "tops") return "top";
  if (family === "accesorios") return "accesorios";
  const category = normalise(product.category);
  return category ? "categoria:" + category : null;
}

export const DEFAULT_MOCKUP_SCOPES = [
  {id:"camisetas",label:"Camisetas · clásicas y oversize",garmentKind:"camiseta-clasica"},
  {id:"sudadera-capucha",label:"Sudaderas · con capucha",garmentKind:"sudadera-capucha"},
  {id:"sudadera-sin-capucha",label:"Sudaderas · sin capucha",garmentKind:"sudadera-sin-capucha"},
  {id:"tote-bag",label:"Bolsas tote bag",garmentKind:"tote-bag"},
  {id:"top",label:"Tops deportivos",garmentKind:"top"},
  {id:"accesorios",label:"Accesorios",garmentKind:"accesorios"},
];

export function availableMockupScopes(products = []) {
  const values = new Map(DEFAULT_MOCKUP_SCOPES.map(scope=>[scope.id,scope]));
  for (const product of products) {
    const scope = mockupScopeOfProduct(product);
    if (scope?.startsWith("categoria:") && !values.has(scope)) {
      values.set(scope, {id:scope,label:product.category,garmentKind:null});
    }
  }
  return [...values.values()];
}

export function modelHasScope(model, scope) {
  if (!model?.base || model.enabled === false || !scope) return false;
  if (model.targetScope) return model.targetScope === scope;
  if (scope === "camisetas") return ["camiseta-clasica","camiseta-oversize"].includes(model.garmentKind);
  if (scope === "accesorios") return model.garmentKind === "accesorios";
  const known = GARMENT_MODEL_TYPES.find(x=>x.id===scope);
  return Boolean(known && model.garmentKind === scope);
}

export function resolveLibraryMockup(models = [], product = {}) {
  const scope = mockupScopeOfProduct(product);
  if (!scope) return null;
  const matching = models.filter(model=>modelHasScope(model,scope));
  // A chosen default always takes precedence, particularly for ALL t-shirts.
  return matching.find(m=>m.isDefaultForScope === true || (scope==="camisetas" && m.sharedForAllTshirts === true))
    || matching[0] || null;
}

export function countMockupImpact(products = [], scope) {
  const affected = products.filter(p=>mockupScopeOfProduct(p)===scope);
  const withArt = affected.filter(p=>p.mockup?.design || p.mockup?.backDesign || p.designs?.some(d=>d.image));
  return {total:affected.length,withArt:withArt.length,missingArt:affected.length-withArt.length,examples:affected.slice(0,5).map(p=>p.name)};
}
