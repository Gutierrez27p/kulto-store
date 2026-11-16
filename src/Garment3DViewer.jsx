import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { infer3DKind } from "./garment-3d.js";
import { createGarmentSurfacePrint } from "./garment-surface-print.js";

// The customer preview uses only uploaded and approved GLB clothing models.
// Never resurrect the geometric sleeve/body placeholder.
const LIMIT = (v,min,max) => Math.min(max,Math.max(min,v));
const COLOR = hex => /^#[0-9a-f]{6}$/i.test(hex||"") ? hex : "#ffffff";
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
 const [modelReady,setModelReady]=useState(false);
 const [showPrint,setShowPrint]=useState(true);
 const kind=infer3DKind(product,{garmentKind:product?.garment3DKind});
 useEffect(()=>{
   const holder=box.current;
   if(!holder||!kind||!modelUrl)return;
   setFailure("");setLoading(true);setModelReady(false);
   let dead=false,raf=0,resize=null;
   const scene=new THREE.Scene();scene.background=new THREE.Color(0xf2f1ef);
   const camera=new THREE.PerspectiveCamera(39,1,.1,100);
   camera.position.set(0,0,4.35);
   const lighting=new THREE.HemisphereLight(0xffffff,0x9099a3,1.8);scene.add(lighting);
   const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(-2.5,4,5);scene.add(key);
   const fill=new THREE.DirectionalLight(0xffffff,1.3);fill.position.set(2,2,-4);scene.add(fill);
   let renderer;
   try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});}
   catch{setFailure("Este dispositivo no puede abrir WebGL 3D. Utiliza la vista del mockup.");return;}
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.07;
   renderer.domElement.style.width="100%";renderer.domElement.style.height="100%";
   renderer.domElement.style.touchAction="none";
   holder.appendChild(renderer.domElement);
   const rig=new THREE.Group();scene.add(rig);
   // A real customer must never see the former tube-and-cylinder placeholder.
   let garment=new THREE.Group();
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
         engine.current.garment=garment;engine.current.isGlb=true;setModelReady(true);setLoading(false);
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
   const ref=engine.current;if(!ref?.isGlb||!modelReady)return;
   const {decals}=ref;let cancelled=false;
   while(decals.children.length){
     const child=decals.children[0];decals.remove(child);
     child.geometry?.dispose?.();child.material?.map?.dispose?.();child.material?.dispose?.();
   }
   const loader=new THREE.TextureLoader();loader.setCrossOrigin("anonymous");
   const layers=[
     {url:frontArt,back:false,width:.83,place:frontPlacement||{}},
     {url:backArt,back:true,width:.83,place:backPlacement||{}},
     {url:logoArt,back:false,width:.25,place:{x:35,y:20}},
   ];
   layers.forEach(({url,back,width,place})=>{
     if(!url)return;
     loader.load(url,texture=>{
       if(cancelled){texture.dispose();return;}
       texture.colorSpace=THREE.SRGBColorSpace;
       texture.minFilter=THREE.LinearMipmapLinearFilter;
       const ratio=texture.image?.width&&texture.image?.height?texture.image.height/texture.image.width:1;
       const mesh=createGarmentSurfacePrint(ref.garment,texture,{back,width,height:Math.min(width*ratio,1.2),place});
       if(!mesh){
         texture.dispose();
         setFailure("El modelo 3D no permite proyectar este estampado sobre la tela. Se abrirá el mockup.");
         onUnavailable?.();return;
       }
       decals.add(mesh);
     },undefined,()=>{if(!cancelled){setFailure("No se ha podido cargar un estampado PNG. Se abrirá el mockup.");onUnavailable?.();}});
   });
   return ()=>{cancelled=true;};
 },[modelReady,frontArt,backArt,logoArt,kind,frontPlacement?.x,frontPlacement?.y,frontPlacement?.w,frontPlacement?.rot,backPlacement?.x,backPlacement?.y,backPlacement?.w,backPlacement?.rot]);
 useEffect(()=>{if(engine.current)engine.current.decals.visible=showPrint;},[showPrint]);
 const control=(text,fn,disabled=false)=><button type="button" disabled={disabled} onClick={fn} className="kulto-btn rounded-full text-xs font-semibold px-3 py-2" style={{background:"rgba(21,19,26,.92)",color:"#fff",border:"1px solid rgba(255,255,255,.15)"}}>{text}</button>;
 const move=(delta)=>{const r=engine.current;if(!r)return;r.current.yaw+=delta;setSide(Math.cos(r.current.yaw)<0?"ESPALDA":"DELANTE");};
 const zoom=(z)=>{const r=engine.current;if(!r)return;r.current.zoom=LIMIT(r.current.zoom*z,.8,2.4);setZoomLabel(Math.round(r.current.zoom*100)+"%");};
 const reset=()=>{const r=engine.current;if(!r)return;r.current.yaw=0;r.current.pitch=.08;r.current.zoom=1;setSide("DELANTE");setZoomLabel("100%");};
 if(!modelUrl)return <div role="status" className="w-full h-full flex items-center justify-center p-6 text-center text-sm" style={{background:"#f2f1ef",color:"#232323"}}>La vista 3D estará disponible después de aprobar un modelo de prenda real.</div>;
 return <div className="w-full h-full relative overflow-hidden" style={{background:"#f2f1ef"}} aria-label="Modelo tridimensional de prenda con color y estampados configurables">
   <div ref={box} className="absolute inset-0"/>
   {loading && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm" style={{background:"#f2f1ef",color:"#222"}}>Cargando modelo real de prenda…</div>}
   {modelReady && <div className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{background:"rgba(15,15,19,.9)",color:"#fff"}}>3D · {side} · {zoomLabel}</div>}
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
