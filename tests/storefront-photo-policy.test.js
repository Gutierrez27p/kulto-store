import test from "node:test";
import assert from "node:assert/strict";
import {photoGalleryForColor} from "../src/storefront-photo-policy.js";

test("a real photo for the selected color takes precedence without modifying its URL", () => {
  const source={colorPhotos:["https://cdn.example/negro-1.jpg","https://cdn.example/negro-2.jpg"],generalPhotos:["https://cdn.example/blanco.jpg"],cover:"https://cdn.example/portada.jpg"};
  assert.deepEqual(photoGalleryForColor(source),{images:source.colorPhotos,referenceOnly:false});
  assert.deepEqual(source.colorPhotos,["https://cdn.example/negro-1.jpg","https://cdn.example/negro-2.jpg"]);
});
test("a color without an actual picture shows the real general photo as a reference", () => {
  assert.deepEqual(photoGalleryForColor({colorPhotos:[],generalPhotos:["original.png"],otherColorPhotos:["azul.png"]}),{images:["original.png"],referenceOnly:true});
  assert.deepEqual(photoGalleryForColor({colorPhotos:[],otherColorPhotos:["rojo.jpg"]}),{images:["rojo.jpg"],referenceOnly:true});
  assert.deepEqual(photoGalleryForColor({cover:"portada.jpg"}),{images:["portada.jpg"],referenceOnly:true});
});
test("missing photos never triggers a fabricated garment image", () => {
  assert.deepEqual(photoGalleryForColor({}),{images:[],referenceOnly:true});
});
