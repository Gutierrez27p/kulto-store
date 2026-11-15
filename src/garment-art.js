// Front/back independent: a garment's rear should not silently mirror its front.
export function selectGarmentArt(mock,product,selectedFront){
  const p=product || {},m=mock || {};
  const front=selectedFront === undefined ? (m.design || p.mockup?.design || null) : (selectedFront || null);
  const back=p.mockup?.backDesign || p.backDesign || m.backDesign || null;
  return {front,back};
}
