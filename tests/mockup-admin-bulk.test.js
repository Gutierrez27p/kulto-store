import test from "node:test";
import assert from "node:assert/strict";
import {mockupScopeOfProduct,availableMockupScopes,resolveLibraryMockup,countMockupImpact} from "../src/mockup-routing.js";
import {makeArtworkBatchPlan,applyArtworkBatch} from "../src/mockup-artwork-batch.js";

const products=[
{id:"1",name:"Dibujo Japón",sku:"JA-01",category:"Camisetas",subcategory:"Oversize",designGroup:"japon"},
{id:"2",name:"Dibujo Japón sudadera",sku:"JA-H",category:"Sudaderas con capucha",designGroup:"japon"},
{id:"3",name:"Otra camiseta",sku:"JA-02",category:"Camisetas",subcategory:"Clásica",mockup:{design:"https://example.org/existing.png"}},
{id:"4",name:"Sudadera sin capucha",sku:"NOH",category:"Sudaderas",subcategory:"Sin capucha"},
{id:"5",name:"Bolsa",sku:"TOTE",category:"Tote bags"},
{id:"6",name:"Chaqueta roja",sku:"RED",category:"Chaquetas"}
];

test("all classic and oversize t-shirts use one uploaded default base",()=>{
  const models=[
    {id:"a",base:"https://example.org/first.png",targetScope:"camisetas"},
    {id:"b",base:"https://example.org/shared.png",targetScope:"camisetas",isDefaultForScope:true},
    {id:"c",base:"https://example.org/hood.png",targetScope:"sudadera-capucha"},
  ];
  assert.equal(mockupScopeOfProduct(products[0]),"camisetas");
  assert.equal(mockupScopeOfProduct(products[2]),"camisetas");
  assert.equal(resolveLibraryMockup(models,products[0]).id,"b");
  assert.equal(resolveLibraryMockup(models,products[2]).id,"b");
  assert.equal(resolveLibraryMockup(models,products[1]).id,"c");
  assert.equal(mockupScopeOfProduct(products[3]),"sudadera-sin-capucha");
  assert.equal(mockupScopeOfProduct(products[4]),"tote-bag");
  assert.equal(mockupScopeOfProduct(products[5]),"categoria:chaquetas");
  assert.ok(availableMockupScopes(products).some(x=>x.id==="categoria:chaquetas"));
  assert.equal(countMockupImpact(products,"camisetas").total,2);
});
test("batch file names resolve by unique SKU or exact group, not substring",()=>{
 const plan=makeArtworkBatchPlan([{name:"JA-01.png"},{name:"JA-02-front.png"},{name:"desconocido.png"},{name:"NOH-espalda.webp"}],products);
 assert.equal(plan[0].status,"ready");
 assert.deepEqual(plan[0].matched.map(p=>p.id),["1","2"]);
 assert.equal(plan[1].status,"existing");
 assert.equal(plan[2].status,"unmatched");
 assert.equal(plan[3].side,"back");
 assert.equal(plan[3].status,"ready");
 const next=applyArtworkBatch(products,[{...plan[0],url:"https://example.org/japan.png"}]);
 assert.deepEqual(next.map(p=>p.id),["1","2"]);
 assert.equal(next[0].mockup.design,"https://example.org/japan.png");
 assert.equal(products[0].mockup,undefined);
});
test("ambiguous titles and colliding uploads are never applied",()=>{
 const ambiguous=[{id:"1",name:"Igual"},{id:"2",name:"Igual"}];
 assert.equal(makeArtworkBatchPlan([{name:"Igual.png"}],ambiguous)[0].status,"ambiguous");
 const collision=makeArtworkBatchPlan([{name:"JA-01.png"},{name:"japon.png"}],products);
 assert.deepEqual(collision.map(item=>item.status),["collision","collision"]);
});
