import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { garmentMeasurements, infer3DKind } from "./garment-3d.js";

// Actual WebGL meshes; drag has unlimited rotation on both axes. Optional GLB
// replaces the procedural shape when a matching calibrated model is available.
const LIMIT = (v,min,max) => Math.min(max,Math.max(min,v));
const COLOR = hex => /^#[0-9a-f]{6}$/i.test(hex||"") ? hex : "#ffffff";
function makeFabric(hex){
  return new THREE.MeshStandardMaterial({
    color:new THREE.Color(COLOR(hex)),roughness:.91,metalness:0,
    side:THREE.DoubleSide
  });
}
function addMesh(root,geometry,material,x=0,y=0,z=0){
  const m=new THREE.Mesh(geometry,material);
  m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;
  root.add(m);return m;
}
function tube(root,points,radius,material){
  return addMesh(root,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),32,radius,8,false),material);
}
function makeBody(root,material,m){
  const p=[
    [m.bottom,m.width*.98,m.depth*.93],
    [m.bottom+.15,m.width,m.depth],
    [-.45,m.width*.94,m.depth],
    [.18,m.width*.96,m.depth*1.03],
    [.52,m.width*1.03,m.depth*1.03],
    [.76,m.width*.92,m.depth*.9],
    [.95,m.neck,m.depth*.55],
  ];
  const samples=32,vertices=[],uv=[],indices=[];
  for(let row=0;row<p.length;row++){
    const [y,rx,rz]=p[row];
    for(let j=0;j<=samples;j++){
      const a=2*Math.PI*j/samples;
      let x=rx*Math.cos(a);
      let z=rz*Math.sin(a);
      z+=Math.sin(y*8+x*5)*.007;
      vertices.push(x,y,z);
      uv.push(j/samples,row/(p.length-1));
      if(row>0&&j>0){
        const a0=(row-1)*(samples+1)+j-1,b0=row*(samples+1)+j-1;
        indices.push(a0,b0,a0+1,b0,b0+1,a0+1);
      }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices);g.computeVertexNormals();
  addMesh(root,g,material);
  const dark=new THREE.MeshStandardMaterial({color:new THREE.Color(COLOR(material.color.getHexString && ("#"+material.color.getHexString()))).multiplyScalar(.65),roughness:1,side:THREE.DoubleSide});
  const cavity=addMesh(root,new THREE.CircleGeometry(m.neck*.88,32),dark,0,.955,0);
  cavity.rotation.x=-Math.PI/2;cavity.scale.y=m.depth/m.neck*.55;
  const collar=addMesh(root,new THREE.TorusGeometry(m.neck,.035,9,44),material,0,.957,0);
  collar.rotation.x=Math.PI/2;collar.scale.y=m.depth/m.neck*.60;
  return root;
}
function makeSleeve(root,material,side,m){
  const hood=m.hoodie,oversize=m.oversized;
  const shoulder=[side*m.width*.93,.72,0];
  const tip=[side*(m.width+(oversize?.53:hood?.52:.43)),hood?.12:(oversize?.35:.42),0];
  const d=new THREE.Vector3(tip[0]-shoulder[0],tip[1]-shoulder[1],0);
  const length=d.length();
  const geometry=new THREE.CylinderGeometry(hood?.27:.24,hood?.32:.31,length,26,4,true);
  const sleeve=addMesh(root,geometry,material,(shoulder[0]+tip[0])/2,(shoulder[1]+tip[1])/2,0);
  sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());
  const cuff=addMesh(root,new THREE.TorusGeometry(hood?.27:.24,.018,8,26),material,...tip);
  cuff.quaternion.copy(sleeve.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2));
}
function makeHood(root,material){
  const hood=addMesh(root,new THREE.SphereGeometry(.43,32,20,0,Math.PI*2,0,Math.PI*.78),material,0,1.10,-.11);
  hood.scale.z=.67;
  // Visible relaxed hood rim and adjustable cords.
  const rope=new THREE.MeshStandardMaterial({color:0xd8d8d8,roughness:1});
  tube(root,[[-.12,.89,.34],[-.11,.5,.39],[-.10,.3,.39]],.01,rope);
  tube(root,[[.12,.89,.34],[.11,.48,.39],[.10,.25,.39]],.01,rope);
}
function makeTote(root,material){
  const shape=new THREE.Shape();
  shape.moveTo(-.69,-.88);shape.lineTo(.69,-.88);shape.lineTo(.72,.63);shape.lineTo(-.72,.63);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{steps:1,depth:.26,bevelEnabled:true,bevelThickness:.04,bevelSize:.035,bevelSegments:3});
  geo.translate(0,0,-.13);addMesh(root,geo,material);
  for(const side of [-1,1]){
    tube(root,[[side*.34,.58,0],[side*.34,1.0,0],[side*.26,1.17,0],[side*.18,1.19,0],[side*.18,.58,0]],.055,material);
  }
}
function makeKind(kind,hex){
 const group=new THREE.Group();
 const m=garmentMeasurements(kind);
 const fabric=makeFabric(hex);group.userData.fabric=[fabric];group.userData.measurements=m;
 if(m.tote)makeTote(group,fabric);
 else {
  makeBody(group,fabric,m);
  if(!m.cropped){makeSleeve(group,fabric,-1,m);makeSleeve(group,fabric,1,m);}
  if(kind==="sudadera-capucha")makeHood(group,fabric);
 }
 return group;
}
function curvedPrint(texture,width,height,back,m,place={}){
 const requestedWidth=Number(place.w);
 const w=Number.isFinite(requestedWidth) && requestedWidth>0 ? LIMIT(width*(requestedWidth/40),.18,1.3) : width;
 const h=height*(w/width);
 const geo=new THREE.PlaneGeometry(w,h,24,20);
 const p=geo.attributes.position;
 for(let i=0;i<p.count;i++){
   const x=p.getX(i),r=m.tote?m.width||.70:m.width;
   const local=Math.sqrt(Math.max(.15,1-(x*x)/(r*r)));
   const depth=m.tote?.17:(m.depth*local+.014);
   p.setZ(i,depth);
 }
 geo.computeVertexNormals();
 const mat=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.03,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
 const mesh=new THREE.Mesh(geo,mat);
 const x=Number(place.x),y=Number(place.y);
 mesh.position.set(Number.isFinite(x)?LIMIT((x-50)/40,-.7,.7):0,
  Number.isFinite(y)?LIMIT(1-(y/100)*2,-.8,.85):.18,
 0);
 if(back)mesh.rotation.y=Math.PI;
 mesh.rotation.z=(Number(place.rot)||0)*Math.PI/180*(back?-1:1);
 mesh.renderOrder=5;
 return mesh;
}
function normalizedGlbScene(gltf,hex){
 const obj=gltf.scene;
 const bounds=new THREE.Box3().setFromObject(obj);
 const size=new THREE.Vector3();bounds.getSize(size);
 const center=new THREE.Vector3();bounds.getCenter(center);
 const scale=2.1/Math.max(.1,size.y);
 obj.scale.multiplyScalar(scale);obj.position.sub(center.multiplyScalar(scale));
 obj.traverse(child=>{
   if(!child.isMesh)return;
   child.castShadow=true;child.receiveShadow=true;
   const materials=Array.isArray(child.material)?child.material:[child.material];
   const recolored=materials.map(mat=>{
     const cp=mat.clone();
     if(cp.color)cp.color.set(COLOR(hex));
     cp.roughness=.88;cp.metalness=0;return cp;
   });
   child.material=Array.isArray(child.material)?recolored:recolored[0];
 });
 return obj;
}
export default function Garment3DViewer({ product, hex, frontArt, backArt, logoArt, modelUrl, frontPlacement, backPlacement, onUnavailable }) {
 const box=useRef(null),engine=useRef(null);
 const [failure,setFailure]=useState(""),[side,setSide]=useState("DELANTE"),[zoomLabel,setZoomLabel]=useState("100%");
 const [loading,setLoading]=useState(!!modelUrl);
 const [showPrint,setShowPrint]=useState(true);
 const kind=infer3DKind(product,{garmentKind:product?.garment3DKind});
 useEffect(()=>{
   const holder=box.current;
   if(!holder||!kind)return;
   let dead=false,raf=0,resize=null;
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x454248);
   const camera=new THREE.PerspectiveCamera(39,1,.1,100);
   camera.position.set(0,0,4.35);
   const lighting=new THREE.HemisphereLight(0xffffff,0x3e404d,2.0);scene.add(lighting);
   const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(-2.5,4,5);scene.add(key);
   const fill=new THREE.DirectionalLight(0xc9d1ff,1.8);fill.position.set(2,2,-4);scene.add(fill);
   let renderer;
   try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});}
   catch{setFailure("Este dispositivo no puede abrir WebGL 3D. Utiliza la vista del mockup.");return;}
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
   renderer.domElement.style.width="100%";renderer.domElement.style.height="100%";
   renderer.domElement.style.touchAction="none";
   holder.appendChild(renderer.domElement);
   const rig=new THREE.Group();scene.add(rig);
   // A real customer must never see the former tube-and-cylinder placeholder.
   let garment=modelUrl ? new THREE.Group() : makeKind(kind,hex);
   rig.add(garment);
   const decals=new THREE.Group();rig.add(decals);
   let current={yaw:0,pitch:.08,zoom:1};
   engine.current={rig,camera,renderer,garment,decals,current};
   const update=()=>{
     const w=Math.max(holder.clientWidth,1),h=Math.max(holder.clientHeight,1);
     camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
   };
   resize=new ResizeObserver(update);resize.observe(holder);update();
   let pointer=null,pinches=new Map();
   const canvas=renderer.domElement;
   const down=e=>{canvas.setPointerCapture(e.pointerId);pinches.set(e.pointerId,[e.clientX,e.clientY]);
     if(pinches.size===1)pointer={x:e.clientX,y:e.clientY};
     if(pinches.size===2)pointer=null;};
   const move=e=>{
     if(!pinches.has(e.pointerId))return;
     const prior=pinches.get(e.pointerId);pinches.set(e.pointerId,[e.clientX,e.clientY]);
     if(pinches.size===1&&pointer){
       current.yaw+=(e.clientX-prior[0])*.009;
       current.pitch=LIMIT(current.pitch+(e.clientY-prior[1])*.006,-.55,.55);
       setSide(Math.cos(current.yaw)<0?"ESPALDA":"DELANTE");
     }
     if(pinches.size===2){
       const pts=[...pinches.values()],dist=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);
       if(pointer?.pinchDist){current.zoom=LIMIT(current.zoom*dist/pointer.pinchDist,.8,2.4);}
       pointer={pinchDist:Math.max(dist,1)};
       setZoomLabel(Math.round(current.zoom*100)+"%");
     }
   };
   const up=e=>{pinches.delete(e.pointerId);pointer=pinches.size?{x:e.clientX,y:e.clientY}:null;};
   const wheel=e=>{e.preventDefault();current.zoom=LIMIT(current.zoom*(e.deltaY>0?.92:1.08),.8,2.4);setZoomLabel(Math.round(current.zoom*100)+"%");};
   canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);
   canvas.addEventListener("wheel",wheel,{passive:false});
   function animate(){
     if(dead)return;
     rig.rotation.y=current.yaw;rig.rotation.x=current.pitch;
     camera.position.z=4.35/current.zoom;
     renderer.render(scene,camera);raf=requestAnimationFrame(animate);
   }
   animate();
   if(modelUrl){
     new GLTFLoader().load(modelUrl,gltf=>{
       if(dead)return;
       try{
         const replacement=normalizedGlbScene(gltf,hex);
         rig.remove(garment);garment=replacement;rig.add(garment);
         engine.current.garment=garment;engine.current.isGlb=true;setLoading(false);
       }catch{setFailure("No se pudo preparar el modelo 3D.");setLoading(false);onUnavailable?.();}
     },undefined,()=>{if(!dead){setFailure("No se pudo cargar el modelo 3D.");setLoading(false);onUnavailable?.();}});
   }
   return ()=>{
     dead=true;cancelAnimationFrame(raf);resize?.disconnect();
     canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",move);
     canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("wheel",wheel);
     scene.traverse(o=>{o.geometry?.dispose?.();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose?.());}});
     renderer.dispose();if(holder.contains(canvas))holder.removeChild(canvas);
     engine.current=null;
   };
 },[kind,modelUrl]);
 useEffect(()=>{
   const ref=engine.current;if(!ref)return;
   ref.garment.traverse(obj=>{
     if(!obj.isMesh)return;
     if(ref.isGlb){
       const mats=Array.isArray(obj.material)?obj.material:[obj.material];
       mats.forEach(mat=>mat.color?.set(COLOR(hex)));
     }
   });
   ref.garment.userData.fabric?.forEach(mat=>mat.color.set(COLOR(hex)));
 },[hex,kind,modelUrl]);
 useEffect(()=>{
   const ref=engine.current;if(!ref)return;
   const {decals}=ref;let cancelled=false;
   while(decals.children.length){
     const child=decals.children[0];decals.remove(child);
     child.geometry?.dispose?.();child.material?.map?.dispose?.();child.material?.dispose?.();
   }
   const kindNow=kind;const m=garmentMeasurements(kindNow);
   const loader=new THREE.TextureLoader();loader.setCrossOrigin("anonymous");
   const layers=[
     {url:frontArt,back:false,width:m.tote?.7:.83,place:frontPlacement||{}},
     {url:backArt,back:true,width:m.tote?.8:.9,place:backPlacement||{}},
     {url:logoArt,back:false,width:.25,place:{x:35,y:20}},
   ];
   layers.forEach(({url,back,width,place})=>{
     if(!url)return;
     loader.load(url,texture=>{
       if(cancelled){texture.dispose();return;}
       texture.colorSpace=THREE.SRGBColorSpace;
       texture.minFilter=THREE.LinearMipmapLinearFilter;
       const ratio=texture.image?.width&&texture.image?.height?texture.image.height/texture.image.width:1;
       const mesh=curvedPrint(texture,width,Math.min(width*ratio,1.2),back,m,place);
       mesh.visible=showPrint;decals.add(mesh);
     },undefined,()=>{if(!cancelled)setFailure("No se ha podido cargar uno de los estampados PNG en el visor 3D.");});
   });
   return ()=>{cancelled=true;};
 },[frontArt,backArt,logoArt,kind,frontPlacement?.x,frontPlacement?.y,frontPlacement?.w,backPlacement?.x,backPlacement?.y,backPlacement?.w]);
 useEffect(()=>{if(engine.current)engine.current.decals.visible=showPrint;},[showPrint]);
 const control=(text,fn,disabled=false)=><button type="button" disabled={disabled} onClick={fn} className="kulto-btn rounded-full text-xs font-semibold px-3 py-2" style={{background:"rgba(21,19,26,.92)",color:"#fff",border:"1px solid rgba(255,255,255,.15)"}}>{text}</button>;
 const move=(delta)=>{const r=engine.current;if(!r)return;r.current.yaw+=delta;setSide(Math.cos(r.current.yaw)<0?"ESPALDA":"DELANTE");};
 const zoom=(z)=>{const r=engine.current;if(!r)return;r.current.zoom=LIMIT(r.current.zoom*z,.8,2.4);setZoomLabel(Math.round(r.current.zoom*100)+"%");};
 const reset=()=>{const r=engine.current;if(!r)return;r.current.yaw=0;r.current.pitch=.08;r.current.zoom=1;setSide("DELANTE");setZoomLabel("100%");};
 return <div className="w-full h-full relative overflow-hidden" style={{background:"#454248"}} aria-label="Modelo tridimensional de prenda con color y estampados configurables">
   <div ref={box} className="absolute inset-0"/>
   {loading && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm" style={{background:"#454248",color:"#fff"}}>Cargando modelo de prenda…</div>}
   <div className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{background:"rgba(15,15,19,.9)",color:"#fff"}}>3D REAL · {side} · {zoomLabel}</div>
   {failure&&<div role="status" className="absolute top-10 left-3 right-3 text-[10px] rounded-lg p-2" style={{background:"rgba(15,15,19,.85)",color:"#fff"}}>{failure}</div>}
   <div className="absolute right-3 top-3 flex items-center gap-2">
     <label className="text-[10px] rounded-full py-1 px-2" style={{background:"rgba(15,15,19,.88)",color:"#fff"}}>
       <input type="checkbox" checked={showPrint} onChange={e=>setShowPrint(e.target.checked)} className="mr-1" />
       Mostrar estampado (solo vista)
     </label>
   </div>
   <div className="absolute bottom-3 left-2 right-2 flex justify-between gap-1" style={{pointerEvents:"none"}}>
     <div className="flex gap-1" style={{pointerEvents:"auto"}}>
       {control("Frente",()=>{const r=engine.current;if(r){r.current.yaw=0;setSide("DELANTE");}})}
       {control("Espalda",()=>{const r=engine.current;if(r){r.current.yaw=Math.PI;setSide("ESPALDA");}})}
     </div>
     <div className="flex gap-1" style={{pointerEvents:"auto"}}>
       {control("−",()=>zoom(.85))}
       {control("+",()=>zoom(1.15))}
       {control("↺",reset)}
     </div>
   </div>
   <p className="absolute left-2 right-2 bottom-14 text-center text-[10px] select-none" style={{color:"#f1ece8",pointerEvents:"none"}}>Gira arrastrando · zoom con rueda o pellizco</p>
 </div>;
}
