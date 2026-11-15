import test from "node:test";
import assert from "node:assert/strict";
import { backgroundSilhouette } from "../src/garment-mask.js";
const image=(w,h,rgb=[245,245,245])=>{const a=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)a.set([...rgb,255],i*4);return a;};
const paint=(a,w,x,y,rgb)=>a.set([...rgb,255],(y*w+x)*4);
test("recovers whole torso and both sleeves without recoloring backdrop",()=>{
 const w=30,h=30,a=image(w,h);
 for(let y=7;y<24;y++)for(let x=9;x<21;x++)paint(a,w,x,y,[130,130,130]);
 for(let y=9;y<15;y++)for(let x=4;x<9;x++)paint(a,w,x,y,[100,100,100]);
 for(let y=9;y<15;y++)for(let x=21;x<26;x++)paint(a,w,x,y,[110,110,110]);
 const mask=backgroundSilhouette(a,w,h);
 assert.ok(mask);assert.equal(mask[12*w+5],1);assert.equal(mask[12*w+24],1);assert.equal(mask[10*w+15],1);assert.equal(mask[0],0);
});
test("rejects blank photo rather than coloring the full image",()=>assert.equal(backgroundSilhouette(image(30,30),30,30),null));
test("rejects multi-colored background",()=>{
 const w=24,h=24,a=image(w,h);paint(a,w,1,1,[10,10,10]);assert.equal(backgroundSilhouette(a,w,h),null);
});
test("defers transparent images to native alpha segmentation",()=>{
 const a=image(24,24);a[(1*24+1)*4+3]=0;assert.equal(backgroundSilhouette(a,24,24),null);
});
