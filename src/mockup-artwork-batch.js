// Safe, deterministic batch linking: PNG filenames must EXACTLY match a
// product SKU, title or an existing design-group name. Never guess from
// partial text and never overwrite artwork already assigned to a product.
export const artworkKey = name => String(name||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/\.(png|webp)$/i,"")
  .replace(/[^a-z0-9]+/g,"");

export function parseArtworkFilename(filename) {
  const original=String(filename||"");
  const withoutExt=original.replace(/\.(png|webp)$/i,"");
  const match=withoutExt.match(/(?:[_\- .])(frente|delante|front|espalda|detras|trasera|trasero|back)$/i);
  const side=match && /espalda|detras|trasera|trasero|back/i.test(match[1]) ? "back" : "front";
  const bare=match ? withoutExt.slice(0,match.index) : withoutExt;
  return {key:artworkKey(bare),side};
}

function productMatches(nameKey,products) {
  const direct=products.filter(p=>artworkKey(p.sku)===nameKey && nameKey);
  if (direct.length) return direct;
  const named=products.filter(p=>artworkKey(p.name)===nameKey && nameKey);
  if (named.length) return named;
  return products.filter(p=>p.designGroup && artworkKey(p.designGroup)===nameKey);
}

export function makeArtworkBatchPlan(files=[],products=[]) {
  const planned=files.map(file=>{
    const {key,side}=parseArtworkFilename(file.name);
    const candidates=productMatches(key,products);
    const groups=new Set(candidates.map(p=>String(p.designGroup||"").trim()).filter(Boolean));
    const ambiguous=candidates.length>1 && (groups.size!==1 || candidates.some(p=>!p.designGroup));
    const group= !ambiguous && candidates.length===1 && candidates[0].designGroup
      ? products.filter(p=>p.designGroup===candidates[0].designGroup)
      : candidates;
    const field=side==="back"?"backDesign":"design";
    const unassigned=group.filter(p=>!p.mockup?.[field]);
    return {file,key,side,field,matched:ambiguous?[]:group,status:!key?"invalid":ambiguous?"ambiguous":!group.length?"unmatched":!unassigned.length?"existing":"ready",unassigned};
  });
  const collisions=new Map();
  for(const item of planned.filter(x=>x.status==="ready")){
    for(const product of item.unassigned){
      const key=String(product.id)+"|"+item.field;
      collisions.set(key,[...(collisions.get(key)||[]),item]);
    }
  }
  for(const entries of collisions.values()){
    if(entries.length>1)for(const item of entries){item.status="collision";item.unassigned=[];}
  }
  return planned;
}

export function applyArtworkBatch(products, uploadedItems) {
  const updates=new Map();
  for(const item of uploadedItems){
    if(!item.url || item.status!=="ready") continue;
    for(const p of item.unassigned){
      const prev=updates.get(String(p.id))||p;
      if(prev.mockup?.[item.field])continue;
      updates.set(String(p.id),{...prev,mockup:{...(prev.mockup||{}),[item.field]:item.url,enabled:true}});
    }
  }
  return [...updates.values()];
}
