import { MAP_HEIGHT, MAP_WIDTH } from '../../games/iron-meridian/map-data';
import { fittedMapPlacement, nativeMapPixelRatio, paintNativeMap } from '../../games/iron-meridian/native-map-view';
import { countingCanvas } from '../measure';
import type { Layout } from '../types';

export const collector = {
  id: 'iron-meridian',
  group: 'heavy-sim' as const,
  collect(layout: Layout) {
    const viewWidth = layout.cssWidth;
    const viewHeight = layout.cssHeight;
    const ratio = nativeMapPixelRatio(viewWidth, viewHeight, layout.dpr);
    const canvas = countingCanvas(viewWidth, viewHeight);
    canvas.width = Math.max(1, Math.round(viewWidth * ratio));
    canvas.height = Math.max(1, Math.round(viewHeight * ratio));
    const placed = fittedMapPlacement(viewWidth, viewHeight, MAP_WIDTH, MAP_HEIGHT);
    const map = countingCanvas(MAP_WIDTH, MAP_HEIGHT);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Iron Meridian map paint has no 2D context');
    canvas.meter.reset();
    paintNativeMap(context, {
      viewWidth,
      viewHeight,
      ratio,
      map,
      ...placed,
      selection: { x: placed.offsetX + placed.mapWidth / 2, y: placed.offsetY + placed.mapHeight / 2 },
    });
    return canvas.meter.snapshot();
  },
};
