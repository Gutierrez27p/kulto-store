import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarmentHex, recolorGarmentPixels } from '../src/utils/garmentColor.js';

test('rejects invalid colors', () => {
  assert.throws(() => parseGarmentHex('red'), TypeError);
  assert.deepEqual(parseGarmentHex('#00ff80'), [0, 255, 128]);
});
test('preserves prints, background and transparency outside the mask', () => {
  const original = new Uint8ClampedArray([180,180,180,255, 250,30,30,255, 10,20,30,0]);
  const mask = new Uint8ClampedArray([0,0,0,255, 0,0,0,0, 0,0,0,255]);
  const result = recolorGarmentPixels(original, mask, '#0000ff');
  assert.deepEqual([...result.slice(0,4)], [0,0,255,255]);
  assert.deepEqual([...result.slice(4,8)], [...original.slice(4,8)]);
  assert.deepEqual([...result.slice(8,12)], [...original.slice(8,12)]);
});
test('keeps light and dark folds distinguishable', () => {
  const source = new Uint8ClampedArray([90,90,90,255, 180,180,180,255]);
  const mask = new Uint8ClampedArray([0,0,0,255, 0,0,0,255]);
  const output = recolorGarmentPixels(source, mask, '#ff0000');
  assert.ok(output[0] < output[4]);
  assert.equal(output[3], 255);
  assert.equal(output[7], 255);
});
test('does not mutate the original source', () => {
  const source = new Uint8ClampedArray([180,180,180,255]);
  recolorGarmentPixels(source, new Uint8ClampedArray([0,0,0,255]), '#112233');
  assert.deepEqual([...source], [180,180,180,255]);
});
