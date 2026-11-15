// Silhouette adjustment: expand existing opaque mask by one pixel.
// Real PNG alpha never changes; painting remains inside the garment.
export function growSilhouette(mask,w,h,radius=1){
  const out=new Uint8Array(mask);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!mask[i])continue;
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h)out[yy*w+xx]=1;
    }
  }
  return out;
}
export function safeRecolorPixel(original,target,coverage,shade,background,isCutout){
  const c=Math.max(0,Math.min(1,Number(coverage)||0));
  if(c<.015)return original;
  const rgb=target.map(v=>Math.max(0,Math.min(255,v*(Number(shade)||1))));
  if(isCutout)return rgb; // never blend in stale white from RGB of transparent edge.
  if(c>=.18)return rgb;
  const a=c/.18;
  return rgb.map((v,i)=>background[i]*(1-a)+v*a);
}
