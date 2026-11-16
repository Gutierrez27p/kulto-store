import React, { useState } from "react";
import Garment3DViewer from "./Garment3DViewer.jsx";

// Test-only previews: original CC0 3D clothes from the CharacterCreator
// output asset collection. These are NOT a substitute for calibrated store
// product models, and are never added to the customer catalog.
export const DEMO_GARMENTS = {
  "camiseta-clasica": {
    name: "Camiseta clásica",
    model: "https://raw.githubusercontent.com/kblood/CharacterCreator/master/output/clothing_tshirt.glb",
  },
  "sudadera-capucha": {
    name: "Sudadera con capucha",
    model: "https://raw.githubusercontent.com/kblood/CharacterCreator/master/output/clothing_hoodie.glb",
  },
};

const COLORS = [
  ["Blanco", "#ffffff"],
  ["Negro", "#202126"],
  ["Azul", "#294c9a"],
  ["Rojo", "#a82535"],
  ["Verde", "#2f6651"],
  ["Beige", "#cfb89a"],
];

const art = (back) => {
  const svg = back
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="680" viewBox="0 0 640 680"><rect x="140" y="185" width="360" height="310" rx="18" fill="#f5eecd"/><rect x="148" y="193" width="344" height="294" rx="15" fill="#181821"/><path d="M210 245 L430 245 L380 295 L260 295 Z" fill="#efbf37"/><text x="320" y="385" text-anchor="middle" font-family="Arial,sans-serif" font-size="75" font-weight="900" fill="#fff">KULTO</text><text x="320" y="431" text-anchor="middle" font-family="Arial,sans-serif" font-size="27" letter-spacing="7" fill="#efbf37">STORE</text></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="200" fill="#efbf37"/><circle cx="256" cy="256" r="173" fill="#161616"/><text x="256" y="296" text-anchor="middle" font-family="Arial,sans-serif" font-size="125" font-weight="900" fill="#efbf37">K</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};

const FRONT_ART = art(false);
const BACK_ART = art(true);

export default function Garment3DDemo() {
  const [kind, setKind] = useState("camiseta-clasica");
  const [hex, setHex] = useState("#ffffff");
  const [withPrint, setWithPrint] = useState(true);
  const [failed, setFailed] = useState(false);
  const chosen = DEMO_GARMENTS[kind];
  const selectKind = value => {setKind(value);setFailed(false);};
  return <main className="min-h-screen px-4 py-7 md:py-10" style={{background:"#f6f5f2",color:"#19191c"}}>
    <div className="mx-auto" style={{maxWidth:1120}}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <a className="font-black tracking-widest text-2xl" href="/">KULTO STORE</a>
          <div className="text-xs font-semibold tracking-widest" style={{color:"#6c6661"}}>LABORATORIO 3D · SOLO PRUEBAS</div>
        </div>
        <a className="rounded-full px-5 py-2 font-semibold text-sm" href="/" style={{border:"1px solid #bbb",color:"#1b1b1b"}}>Volver a la tienda</a>
      </div>
      <h1 className="font-black leading-tight mb-2" style={{fontSize:"clamp(26px,4vw,45px)"}}>Prueba el nuevo visor 3D</h1>
      <p className="mb-7" style={{color:"#5f5b56",maxWidth:760}}>Elige un color, gira la prenda y mira ambas caras. Esta es una demostración con mallas reales de licencia CC0 y gráficos de ejemplo; todavía no reproduce exactamente los modelos ni los diseños de los productos de tu tienda.</p>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 rounded-3xl overflow-hidden relative" style={{height:"min(72vh,650px)",minHeight:400,background:"#f2f1ef",border:"1px solid #e0dfdc"}}>
          <Garment3DViewer key={kind} product={{name:chosen.name,garment3DKind:kind}} hex={hex} frontArt={withPrint?FRONT_ART:null} backArt={withPrint?BACK_ART:null} modelUrl={chosen.model} frontPlacement={{x:50,y:42,w:42}} backPlacement={{x:50,y:42,w:45}} onUnavailable={()=>setFailed(true)}/>
          {failed && <div role="alert" className="absolute bottom-24 left-4 right-4 rounded-xl p-3 text-xs" style={{background:"#fff",color:"#a02728",border:"1px solid #e9b9b9"}}>No se ha podido cargar o estampar correctamente el modelo de demostración. Esta prueba necesita acceso a los archivos GLB externos y una malla compatible.</div>}
        </section>
        <section className="lg:col-span-2 rounded-3xl p-5 md:p-7" style={{background:"#fff",border:"1px solid #e0dfdc",alignSelf:"start"}}>
          <h2 className="font-black text-xl mb-1">Configurar prenda</h2>
          <p className="text-sm mb-5" style={{color:"#76706b"}}>Los cambios de color son en directo.</p>
          <label className="block text-sm font-bold mb-2" htmlFor="demo-clothing">Modelo</label>
          <select id="demo-clothing" className="w-full rounded-xl px-3 py-3 mb-6" value={kind} onChange={e=>selectKind(e.target.value)} style={{border:"1px solid #cac7c2",background:"#fff"}}>
            {Object.entries(DEMO_GARMENTS).map(([id,v])=><option key={id} value={id}>{v.name}</option>)}
          </select>
          <p className="font-bold text-sm mb-3">Color: {COLORS.find(item=>item[1]===hex)?.[0]||"Personalizado"}</p>
          <div className="flex flex-wrap gap-3 mb-6" aria-label="Colores de muestra">
            {COLORS.map(([name,value])=><button key={value} type="button" aria-label={name} title={name} onClick={()=>setHex(value)} className="rounded-full" style={{height:38,width:38,background:value,border:hex===value?"3px solid #efbd36":"2px solid #a6a6a6",boxShadow:hex===value?"0 0 0 2px #161616":"none"}} />)}
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold mb-5">
            <input type="checkbox" checked={withPrint} onChange={e=>setWithPrint(e.target.checked)} className="w-5 h-5"/>
            Mostrar estampados de ejemplo en ambas caras
          </label>
          <p className="text-xs" style={{color:"#69635f",lineHeight:1.6}}>Gira arrastrando con el ratón o el dedo. Los botones «Frente» y «Espalda» están dentro del visor. Los modelos de ejemplo no están aprobados para el catálogo público.</p>
          <div className="mt-6 pt-4 text-xs" style={{borderTop:"1px solid #eceae6",color:"#78716c"}}>
            Modelos CC0: <a href="https://github.com/kblood/CharacterCreator" target="_blank" rel="noopener noreferrer" className="underline">CharacterCreator / MakeHuman</a>.
          </div>
        </section>
      </div>
    </div>
  </main>;
}
