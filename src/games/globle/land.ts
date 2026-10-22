import {BufferAttribute, BufferGeometry, Color, Group, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial} from 'three';
import ConicPolygonGeometry from 'three-conic-polygon-geometry';
import GeoJsonGeometry from 'three-geojson-geometry';
import world from './data/world.json';

const RADIUS = 100; // three-globe's globe radius
const CAP = RADIUS * 1.006, STROKE = RADIUS * 1.0065;
const CURVATURE = 8; // degrees between interior cap points; the cap stays above the sphere's facets
const SLICE_MS = 10; // longest main-thread slice while building

interface Range { start: number; count: number }
interface Built { fill: Range[]; line: Range[] }
const linear = (css: string) => new Color(css);

/**
 * All land as two draw calls: one filled mesh and one border mesh, coloured per
 * vertex. Geometry is built in short slices so typing stays responsive meanwhile.
 */
export class LandLayer {
  readonly group = new Group();
  private readonly fillMaterial = new MeshLambertMaterial({vertexColors: true});
  private readonly lineMaterial = new LineBasicMaterial({vertexColors: true});
  private fill?: BufferGeometry;
  private line?: BufferGeometry;
  private readonly ranges = new Map<string, Built>();
  private cancelled = false;

  constructor(private readonly land: string, private readonly outline: string) {}

  async build(): Promise<boolean> {
    const fillPos: number[] = [], fillNormal: number[] = [], fillIndex: number[] = [];
    const linePos: number[] = [], lineIndex: number[] = [];
    let slice = performance.now();
    for (const feature of world.features) {
      const built: Built = this.ranges.get(feature.id ?? '') ?? {fill: [], line: []};
      for (const polygon of feature.polygons as number[][][][]) {
        const cap = new ConicPolygonGeometry(polygon, 0, CAP, false, true, false, CURVATURE);
        append(cap, fillPos, fillIndex, built.fill, fillNormal);
        cap.dispose();
        const stroke = new GeoJsonGeometry({type: 'Polygon', coordinates: polygon}, STROKE, CURVATURE);
        append(stroke, linePos, lineIndex, built.line);
        stroke.dispose();
        if (performance.now() - slice > SLICE_MS) {
          await new Promise(resolve => setTimeout(resolve, 0));
          if (this.cancelled) return false;
          slice = performance.now();
        }
      }
      if (feature.id) this.ranges.set(feature.id, built);
    }
    this.fill = geometry(fillPos, fillIndex, fillNormal);
    this.line = geometry(linePos, lineIndex);
    this.group.add(new Mesh(this.fill, this.fillMaterial), new LineSegments(this.line, this.lineMaterial));
    this.paint(new Map(), '');
    return true;
  }

  /** Sets every country neutral, then colours the guessed ones and darkens their outline. */
  paint(colours: ReadonlyMap<string, string>, guessedOutline: string): void {
    if (!this.fill || !this.line) return;
    const fill = this.fill.getAttribute('color') as BufferAttribute, line = this.line.getAttribute('color') as BufferAttribute;
    paintRange(fill, {start: 0, count: fill.count}, linear(this.land));
    paintRange(line, {start: 0, count: line.count}, linear(this.outline));
    for (const [id, css] of colours) {
      const built = this.ranges.get(id);
      if (!built) continue;
      const fillColour = linear(css), lineColour = linear(guessedOutline);
      for (const r of built.fill) paintRange(fill, r, fillColour);
      for (const r of built.line) paintRange(line, r, lineColour);
    }
    fill.needsUpdate = true; line.needsUpdate = true;
  }

  dispose(): void {
    this.cancelled = true;
    this.fill?.dispose(); this.line?.dispose();
    this.fillMaterial.dispose(); this.lineMaterial.dispose();
    this.group.clear();
  }
}

function append(source: BufferGeometry, positions: number[], indices: number[], ranges: Range[], normals?: number[]): void {
  const offset = positions.length / 3;
  const position = source.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    positions.push(x, y, z);
    // Radial normals shade the land like the sphere beneath it, without per-triangle facets.
    if (normals) {const length = Math.hypot(x, y, z) || 1; normals.push(x / length, y / length, z / length);}
  }
  const index = source.getIndex();
  if (index) for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
  else for (let i = 0; i < position.count; i++) indices.push(i + offset);
  const last = ranges[ranges.length - 1];
  if (last && last.start + last.count === offset) last.count += position.count;
  else ranges.push({start: offset, count: position.count});
}

function geometry(positions: number[], indices: number[], normals?: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  if (normals) g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(positions.length), 3));
  const count = positions.length / 3;
  g.setIndex(new BufferAttribute(count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), 1));
  g.computeBoundingSphere();
  return g;
}

function paintRange(attribute: BufferAttribute, range: Range, colour: Color): void {
  const array = attribute.array as Float32Array;
  for (let i = range.start; i < range.start + range.count; i++) {
    array[i * 3] = colour.r; array[i * 3 + 1] = colour.g; array[i * 3 + 2] = colour.b;
  }
}
