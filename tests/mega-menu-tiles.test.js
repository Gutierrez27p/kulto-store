import test from "node:test";
import assert from "node:assert/strict";
import {getDisplayMenuItems,getMegaMenuTiles,menuTileMedia,megaMenuImageStyle} from "../src/mega-menu-tiles.js";
import {GARMENT_FAMILIES,garmentFamilyOf,garmentFitOf} from "../src/garment-families.js";
const photo=p=>p.photoPool?.[0]||null;
const shirts=[
 {id:"a",category:"Camisetas",name:"Camiseta regular",photoPool:["cl.jpg"]},
 {id:"b",category:"Camisetas",name:"Camiseta oversize",photoPool:["ov.jpg"]}
];
test("classic and oversize are two stable, editable tile identifiers",()=>{
 const item={type:"family",value:"camisetas",label:"Camisetas"};
 const tiles=getMegaMenuTiles(item,shirts,GARMENT_FAMILIES,garmentFamilyOf,garmentFitOf,photo);
 assert.deepEqual(tiles.map(x=>x.label),["Clásica","Oversize"]);
 assert.equal(tiles[0].key,"family|camisetas|fit|Clásica");
 assert.equal(tiles[1].filter.fit,"Oversize");
});
test("jackets in stock generate ONE navigation tile, not a tile for each product",()=>{
 const products=[{id:"x",category:"Chaqueta",name:"Chaqueta",photoPool:["front.png"]},
 {id:"y",category:"Chaqueta",name:"Chaqueta con capucha Nordic",photoPool:["other.png"]}];
 const items=getDisplayMenuItems(products,[{id:"old",type:"category",value:"Chaqueta",label:"Chaqueta"}],GARMENT_FAMILIES,garmentFamilyOf);
 assert.equal(items.filter(x=>x.value==="chaquetas").length,1);
 assert.equal(items.some(x=>x.type==="category"&&x.value==="Chaqueta"),false);
 const tiles=getMegaMenuTiles(items.find(x=>x.value==="chaquetas"),products,GARMENT_FAMILIES,garmentFamilyOf,garmentFitOf,photo);
 assert.equal(tiles.length,1);
 assert.equal(tiles[0].label,"Chaqueta");
 assert.deepEqual(tiles[0].filter,{group:"",category:"__family_chaquetas"});
});
test("category with one implied variant shows a single category tile",()=>{
 const item={type:"category",value:"Chaqueta",label:"Chaqueta"};
 const products=[{id:"x",category:"Chaqueta",name:"Chaqueta"},{id:"y",category:"Chaqueta",name:"Chaqueta B"}];
 assert.equal(getMegaMenuTiles(item,products,GARMENT_FAMILIES,garmentFamilyOf,garmentFitOf,photo).length,1);
});
test("uploaded images override fallback; zoom and position bounds are safe",()=>{
 assert.deepEqual(menuTileMedia({a:{image:"custom.png",scale:160,x:32,y:78,fit:"cover"}},"a","fallback.jpg"),
 {image:"custom.png",scale:160,x:32,y:78,fit:"cover"});
 assert.deepEqual(menuTileMedia({},"missing","fallback.jpg"),{image:"fallback.jpg",fit:"contain",scale:100,x:50,y:50});
 assert.equal(menuTileMedia({a:{scale:900}},"a").scale,250);
});

test("menu photo sliders translate and scale the actual image, not the product asset",()=>{
 const media=menuTileMedia({fit:{image:"my-cover.webp",scale:180,x:75,y:25,fit:"cover"}},"fit","fallback.jpg");
 const style=megaMenuImageStyle(media);
 assert.equal(style.objectFit,"cover");
 assert.equal(style.objectPosition,"center center");
 assert.match(style.transform,/translate\(15%, -15%\) scale\(1\.8\)/);
 assert.equal(media.image,"my-cover.webp");
});
