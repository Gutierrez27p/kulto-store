// Pure silhouette detection for a garment photographed on a flat backdrop.
// Use only as fallback: a supplied PNG alpha channel or explicit mask is better.
export function backgroundSilhouette(rgba,width,height) {
  const n=width*height;
  if(!rgba || rgba.length<n*4 || width<5 || height<5)return null;
  const at=(x,y)=>{const i=(y*width+x)*4;return [rgba[i],rgba[i+1],rgba[i+2],rgba[i+3]];};
  const corners=[at(1,1),at(width-2,1),at(1,height-2),at(width-2,height-2)];
  if(corners.some(c=>c[3]<240))return null;
  const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  if(corners.some(c=>d(c,corners[0])>26))return null;
  const ref=[0,1,2].map(j=>corners.reduce((a,c)=>a+c[j],0)/4);
  const bg=i=>{const k=i*4;return rgba[k+3]>=240 && Math.hypot(rgba[k]-ref[0],rgba[k+1]-ref[1],rgba[k+2]-ref[2])<42;};
  const outside=new Uint8Array(n),queue=[];
  const push=i=>{if(!outside[i] && bg(i)){outside[i]=1;queue.push(i);}};
  for(let x=0;x<width;x++){push(x);push((height-1)*width+x);}
  for(let y=0;y<height;y++){push(y*width);push(y*width+width-1);}
  for(let j=0;j<queue.length;j++){
    const i=queue[j],x=i%width,y=(i-x)/width;
    if(x>0)push(i-1);if(x<width-1)push(i+1);if(y>0)push(i-width);if(y<height-1)push(i+width);
  }
  const mask=new Uint8Array(n);let count=0,center=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(!outside[i] && rgba[i*4+3]>=10){
      mask[i]=1;count++;
      if(x>=width*.30 && x<width*.70 && y>=height*.27 && y<height*.75)center++;
    }
  }
  // Unknown or nearly indistinguishable backgrounds must not be repainted.
  if(count<n*.035 || count>n*.80 || center<Math.max(1,n*.015))return null;
  return mask;
}
