// Shared taxonomy for storefront navigation and reusable garment bases.
// Existing design categories and subcategories are left untouched in storage.
const normalise = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const text = p => [p?.category,p?.subcategory,p?.garmentType,p?.garmentStyle,p?.model,p?.fit,p?.name].filter(Boolean).map(normalise).join(" ");

export const GARMENT_FAMILIES = [
  { id:"camisetas", title:"Camisetas", subtitle:"Clásicas y oversize", fits:["Clásica","Oversize"] },
  { id:"sudaderas", title:"Sudaderas", subtitle:"Con capucha y sin capucha", fits:["Con capucha","Sin capucha"] },
  { id:"tops", title:"Tops deportivos", subtitle:"Entrenamiento y estilo", fits:[] },
  { id:"tote", title:"Tote bags", subtitle:"Bolsas reutilizables", fits:[] },
  { id:"accesorios", title:"Accesorios", subtitle:"Complementos", fits:[] },
];
export const GARMENT_MODEL_TYPES = [
 { id:"camiseta-clasica", label:"Camiseta clásica", family:"camisetas" },
 { id:"camiseta-oversize", label:"Camiseta oversize", family:"camisetas" },
 { id:"sudadera-capucha", label:"Sudadera con capucha", family:"sudaderas" },
 { id:"sudadera-sin-capucha", label:"Sudadera sin capucha", family:"sudaderas" },
 { id:"tote-bag", label:"Tote bag", family:"tote" },
 { id:"top", label:"Top deportivo", family:"tops" },
 { id:"accesorios", label:"Accesorio", family:"accesorios" },
];

export function garmentFamilyOf(product={}) {
  const s=text(product);
  if (/sudadera|hoodie|jersey|pulover|sweatshirt/.test(s)) return "sudaderas";
  if (/tote|bolsa de tela|bolsa tote|tote.?bag/.test(s)) return "tote";
  if (/top|bra sport|sujetador deportivo/.test(s)) return "tops";
  if (/llavero|lanyard|accesorio|gorra|taza/.test(s)) return "accesorios";
  if (/camiseta|oversize|shirt|remera/.test(s)) return "camisetas";
  return null;
}
export function garmentFitOf(product={}) {
 const family=garmentFamilyOf(product), s=text(product);
 if (family==="camisetas") return /oversize|oversized/.test(s) ? "Oversize" : "Clásica";
 if (family==="sudaderas") return /sin capucha|crew.?neck/.test(s) ? "Sin capucha" : "Con capucha";
 return "";
}
export function modelMatchesProduct(model, product) {
 if (!model?.garmentKind) return true; // previously saved untyped models remain editable.
 const kind=GARMENT_MODEL_TYPES.find(x=>x.id===model.garmentKind);
 if (!kind) return true;
 return garmentFamilyOf(product)===kind.family && (
  kind.id==="camiseta-oversize" ? garmentFitOf(product)==="Oversize" :
  kind.id==="camiseta-clasica" ? garmentFitOf(product)==="Clásica" :
  kind.id==="sudadera-sin-capucha" ? garmentFitOf(product)==="Sin capucha" :
  kind.id==="sudadera-capucha" ? garmentFitOf(product)==="Con capucha" : true
 );
}
