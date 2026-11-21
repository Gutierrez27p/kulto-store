// Stable catalog navigation tiles for the photographic mega-menu.
// Preview assets are kept in settings, independently of product photographs.
export const megaTileId = (item,kind,value) =>
  [item?.type||"",item?.value||"",kind,value||""].join("|");

export function getDisplayMenuItems(products=[],configured=[],families=[],familyOf=()=>null){
  const auto=families.filter(f=>products.some(p=>familyOf(p)===f.id))
    .map(f=>({id:"family:"+f.id,type:"family",value:f.id,label:f.title}));
  const seen=new Set(auto.map(it=>it.type+":"+it.value));
  return [...auto,...configured.filter(it=>{
    if(!it?.type||!it?.value)return false;
    if(it.type==="category"&&familyOf({category:it.value}))return false;
    const key=it.type+":"+it.value;
    if(seen.has(key))return false;
    seen.add(key);return true;
  })];
}

export function getMegaMenuTiles(item,products=[],families=[],familyOf=()=>null,fitOf=()=>"",photoOf=()=>null){
  if(!item)return [];
  const ps=products.filter(p=>item.type==="family"?familyOf(p)===item.value:
    item.type==="group"?String(p.group||"")===String(item.value):
    p.category===item.value||(p.extraCategories||[]).includes(item.value));
  if(!ps.length)return [];
  const firstPhoto=list=>photoOf(list.find(p=>photoOf(p))||list[0])||null;
  const base={group:item.type==="group"?item.value:"",category:item.type==="family"?"__family_"+item.value:item.type==="category"?item.value:""};
  if(item.type==="family"){
    const family=families.find(f=>f.id===item.value);
    const fits=(family?.fits||[]).filter(f=>ps.some(p=>fitOf(p)===f));
    if(fits.length)return fits.map(f=>({
      key:megaTileId(item,"fit",f),label:f,img:firstPhoto(ps.filter(p=>fitOf(p)===f)),
      filter:{category:"__family_"+item.value,fit:f}
    }));
    // Tops, jackets, tote bags and other single-model families get ONE tile,
    // not one misleading tile per individual product in the database.
    return [{key:megaTileId(item,"all",item.value),label:family?.title||item.label||item.value,img:firstPhoto(ps),filter:base}];
  }
  // Ordinary categories without explicitly distinct subcategories are ONE
  // category tile. Product variants must not masquerade as garment models.
  if(item.type==="category"){
    const subs=[...new Set(ps.map(p=>p.subcategory).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
    if(subs.length>1)return subs.slice(0,8).map(sc=>({
      key:megaTileId(item,"subcategory",sc),label:sc,img:firstPhoto(ps.filter(p=>p.subcategory===sc)),
      filter:{...base,subcategory:sc}
    }));
    return [{key:megaTileId(item,"all",item.value),label:item.label||item.value,img:firstPhoto(ps),filter:base}];
  }
  const cats=[...new Set(ps.map(p=>p.category).filter(Boolean))];
  if(item.type==="group"&&cats.length>1)return cats.slice(0,8).map(c=>({
    key:megaTileId(item,"category",c),label:c,img:firstPhoto(ps.filter(p=>p.category===c)),
    filter:{group:item.value,category:c}
  }));
  return [{key:megaTileId(item,"all",item.value),label:item.label||item.value,img:firstPhoto(ps),filter:base}];
}
export function menuTileMedia(media={},key="",fallbackImage=null){
  const m=media?.[key]||{};
  return {
    image:m.image||fallbackImage||null,
    fit:m.fit==="cover"?"cover":"contain",
    scale:Number.isFinite(Number(m.scale))?Math.max(50,Math.min(250,Number(m.scale))):100,
    x:Number.isFinite(Number(m.x))?Math.max(0,Math.min(100,Number(m.x))):50,
    y:Number.isFinite(Number(m.y))?Math.max(0,Math.min(100,Number(m.y))):50
  };
}
