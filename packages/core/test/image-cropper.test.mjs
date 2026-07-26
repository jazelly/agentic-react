import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultImageCropState,
  dragImageCropState,
  getImageCropCoverZoom,
  getRotatedImageDimensions,
  rotateImageCropState,
  zoomImageCropState,
} from '../dist/core/settings/image_cropper.js';

const wideImage = { width: 400, height: 200 };

test('default crop state centers a square cover crop', () => {
  const state = createDefaultImageCropState(wideImage);

  assert.equal(state.offsetX, 0);
  assert.equal(state.offsetY, 0);
  assert.equal(state.rotation, 0);
  assert.equal(state.zoom, 1.28);
});

test('dragging crop state clamps offsets to covered pixels', () => {
  const state = createDefaultImageCropState(wideImage);
  const dragged = dragImageCropState(
    state,
    { deltaX: 1000, deltaY: 1000 },
    wideImage,
  );

  assert.equal(dragged.offsetX, 128);
  assert.equal(dragged.offsetY, 0);
});

test('zoom cannot go below cover scale', () => {
  const state = createDefaultImageCropState(wideImage);
  const zoomed = zoomImageCropState(state, 0.5, wideImage);

  assert.equal(zoomed.zoom, getImageCropCoverZoom(wideImage));
});

test('right angle rotation swaps cover dimensions and preserves bounds', () => {
  const rotatedDimensions = getRotatedImageDimensions(wideImage, 90);
  const rotated = rotateImageCropState(
    createDefaultImageCropState(wideImage),
    'right',
    wideImage,
  );

  assert.deepEqual(rotatedDimensions, { width: 200, height: 400 });
  assert.equal(rotated.rotation, 90);
  assert.equal(rotated.zoom, 1.28);
});
