// Procedural THREE.js cloth meshes. Each garment contains actual front, back
// and side geometry. No source image or white matte is baked into the fabric.
import * as THREE from "three";
export const THREE_GARMENT_KINDS = ["camiseta-clasica","camiseta-oversize","sudadera-capucha","sudadera-sin-capucha","tote-bag","top"];
export function infer3DKind(product={},model={}){
  if(model?.garmentKind && THREE_GARMENT_KINDS.includes(model.garmentKind))return model.garmentKind;
  const t=[product.name,product.category,product.subcategory,product.garmentType,product.fit].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/tote|bolsa/.test(t))return"tote-bag";
  if(/tops? deportivos?|sport bra|crop top/.test(t))return"top";
  if(/sudadera|hoodie|sweatshirt/.test(t))return /sin capucha|crew.?neck/.test(t)?"sudadera-sin-capucha":"sudadera-capucha";
  if(/oversize|oversized/.test(t))return"camiseta-oversize";
  if(/camiseta|remera|shirt/.test(t))return"camiseta-clasica";
  return null;
}
export function garmentMeasurements(kind){
  const oversized=kind==="camiseta-oversize";
  const hoodie=kind==="sudadera-capucha" || kind==="sudadera-sin-capucha";
  const tote=kind==="tote-bag";
  const cropped=kind==="top";
  return {kind,oversized,hoodie,tote,cropped,
    width: oversized?.82:hoodie?.75:cropped?.56:.68,
    depth: oversized?.32:hoodie?.35:.28,
    bottom: cropped?-.44:-1.05,
    neck: cropped?.31:.31,
    decalZ: tote?.17:oversized?.345:hoodie?.37:.30
  };
}
