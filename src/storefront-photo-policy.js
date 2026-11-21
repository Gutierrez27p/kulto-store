// Customer-facing clothing colors must never be synthesized from photographs.
// An uploaded color-specific photo is authoritative; every other picture is
// explicitly just a reference. This pure function cannot recolor any pixels.
export function photoGalleryForColor({
  colorPhotos = [],
  generalPhotos = [],
  otherColorPhotos = [],
  cover = null,
} = {}) {
  const actual = (Array.isArray(colorPhotos) ? colorPhotos : []).filter(Boolean);
  if (actual.length) return { images: actual, referenceOnly: false };
  const general = (Array.isArray(generalPhotos) ? generalPhotos : []).filter(Boolean);
  if (general.length) return { images: general, referenceOnly: true };
  const others = (Array.isArray(otherColorPhotos) ? otherColorPhotos : []).filter(Boolean);
  if (others.length) return { images: others, referenceOnly: true };
  return { images: cover ? [cover] : [], referenceOnly: true };
}
