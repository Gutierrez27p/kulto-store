/**
 * Recolor a neutral garment photograph without flattening its shadows.
 * The mask alpha channel marks fabric pixels; print artwork must be excluded
 * from the mask. Images and mask must have identical dimensions.
 * This module never recolors a print or the background intentionally.
 */
export function parseGarmentHex(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new TypeError('Expected a six-digit garment color (#RRGGBB)');
  }
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

export function recolorGarmentPixels(source, mask, hex, options = {}) {
  if (!source || !mask || source.length !== mask.length || source.length % 4 !== 0) {
    throw new TypeError('Source and mask must be equally sized RGBA buffers');
  }
  const [r, g, b] = parseGarmentHex(hex);
  const { referenceLuminance = 180, strength = 1 } = options;
  if (!Number.isFinite(referenceLuminance) || referenceLuminance <= 0 ||
      !Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RangeError('Invalid recoloring options');
  }
  const output = new Uint8ClampedArray(source);
  for (let i = 0; i < source.length; i += 4) {
    if (source[i + 3] === 0 || mask[i + 3] === 0) continue;
    const coverage = (mask[i + 3] / 255) * strength;
    const luminance = (0.2126 * source[i] + 0.7152 * source[i + 1] + 0.0722 * source[i + 2]);
    const shading = Math.min(1.5, luminance / referenceLuminance);
    for (const [channel, target] of [r, g, b].entries()) {
      const tinted = Math.min(255, target * shading);
      output[i + channel] = Math.round(source[i + channel] * (1 - coverage) + tinted * coverage);
    }
  }
  return output;
}

/** Browser-only helper: caller owns both images and may cache decoded assets. */
export function renderGarmentColor({ canvas, photo, fabricMask, color, options }) {
  if (!canvas || !photo || !fabricMask) throw new TypeError('Missing canvas or image');
  const width = photo.naturalWidth || photo.width;
  const height = photo.naturalHeight || photo.height;
  if (!width || !height ||
      width !== (fabricMask.naturalWidth || fabricMask.width) ||
      height !== (fabricMask.naturalHeight || fabricMask.height)) {
    throw new RangeError('Photo and mask dimensions must match');
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context unavailable');
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.drawImage(photo, 0, 0);
  const original = context.getImageData(0, 0, width, height);
  context.clearRect(0, 0, width, height);
  context.drawImage(fabricMask, 0, 0);
  const mask = context.getImageData(0, 0, width, height);
  const output = recolorGarmentPixels(original.data, mask.data, color, options);
  original.data.set(output);
  context.putImageData(original, 0, 0);
}
