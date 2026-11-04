/** Low-poly models built from Three.js primitives: the egg fighters, the eight school-themed weapons, pickups and
 * projectiles. Shared geometries and materials are cached per mount and released by the model kit. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BODY, type WeaponId } from './config';
import type { GunFinish } from './textures';

export interface ModelKit {
  mat(color: number, opts?: { emissive?: number; rough?: number; metal?: number; transparent?: number; finish?: GunFinish }): THREE.MeshStandardMaterial;
  geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T;
  dispose(): void;
}

export function createKit(textureForGun?: (finish: GunFinish) => THREE.Texture): ModelKit {
  const mats = new Map<string, THREE.MeshStandardMaterial>(), geos = new Map<string, THREE.BufferGeometry>();
  const gunTextures = new Map<GunFinish,THREE.Texture>();
  return {
    mat(color, opts = {}) {
      const key = `${color}|${opts.emissive ?? ''}|${opts.rough ?? ''}|${opts.metal ?? ''}|${opts.transparent ?? ''}|${opts.finish ?? ''}`;
      let m = mats.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.05, flatShading: false });
        if(opts.finish&&textureForGun){
          let texture=gunTextures.get(opts.finish);
          if(!texture){texture=textureForGun(opts.finish);gunTextures.set(opts.finish,texture);}
          m.map=texture;
        }
        if(opts.finish)m.userData.gunFinish=opts.finish;
        if (opts.emissive !== undefined) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = 1; }
        if (opts.transparent !== undefined) { m.transparent = true; m.opacity = opts.transparent; m.depthWrite = false; }
        mats.set(key, m);
      }
      return m;
    },
    geo(key, make) {
      let g = geos.get(key);
      if (!g) { g = make(); geos.set(key, g); }
      return g as ReturnType<typeof make>;
    },
    dispose() { for (const m of mats.values()) m.dispose(); for (const g of geos.values()) g.dispose(); for(const t of gunTextures.values())t.dispose();mats.clear(); geos.clear();gunTextures.clear(); },
  };
}

/** Bake fixed child meshes once per kit/material, keeping animated parent groups separate. */
export function batchStaticMeshes(kit: ModelKit, group: THREE.Group, key: string): void {
  const byMat=new Map<THREE.Material,THREE.Mesh[]>();
  for(const child of group.children) {
    const mesh=child as THREE.Mesh;
    if(!mesh.isMesh || Array.isArray(mesh.material))continue;
    const list=byMat.get(mesh.material)??[];list.push(mesh);byMat.set(mesh.material,list);
  }
  for(const [material,parts] of byMat) {
    if(parts.length<2)continue;
    const geometry=kit.geo(`batch-${key}-${material.uuid}`,()=>{
      const geometries=parts.map(p=>{p.updateMatrix();return p.geometry.clone().applyMatrix4(p.matrix);});
      const merged=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());return merged;
    });
    const mesh=new THREE.Mesh(geometry,material);
    mesh.castShadow=parts.some(p=>p.castShadow);mesh.receiveShadow=parts.some(p=>p.receiveShadow);
    for(const part of parts)group.remove(part);
    group.add(mesh);
  }
}

const NAVY = 0x1d2f5c, GOLD = 0xf2b733, DARK = 0x2b2f36, STEEL = 0x8c96a1, WOOD = 0x9a6436;

/** A chamfered box with 44 triangles, rather than a densely subdivided rounded box. */
function bevelBox(w: number,h: number,d: number): THREE.BufferGeometry {
  const half=[w/2,h/2,d/2],bevel=Math.min(w,h,d)*.14,inner=half.map(v=>v-bevel),positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
  const face=(points:number[][])=>{
    const a=new THREE.Vector3(...points[0]),b=new THREE.Vector3(...points[1]),c=new THREE.Vector3(...points[2]);
    const normal=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();
    const center=new THREE.Vector3();for(const p of points)center.add(new THREE.Vector3(...p));
    if(normal.dot(center)<0){points.reverse();normal.negate();}
    const axis=Math.abs(normal.x)>.7?0:Math.abs(normal.y)>.7?1:2,u=axis===0?2:0,v=axis===1?2:1;
    const offset=positions.length/3;
    for(const p of points){
      let tu=(p[u]+half[u])/(half[u]*2),tv=(p[v]+half[v])/(half[v]*2);
      if((axis===0&&normal.x>0)||(axis===2&&normal.z<0))tu=1-tu;
      if(axis===1&&normal.y>0)tv=1-tv;
      positions.push(...p);normals.push(normal.x,normal.y,normal.z);uvs.push(tu,tv);
    }
    for(let i=1;i<points.length-1;i++)indices.push(offset,offset+i,offset+i+1);
  };
  for(let axis=0;axis<3;axis++) {
    const a=(axis+1)%3,b=(axis+2)%3;
    for(const sign of [-1,1])face([[-1,-1],[1,-1],[1,1],[-1,1]].map(([sa,sb])=>{
      const p=[0,0,0];p[axis]=sign*half[axis];p[a]=sa*inner[a];p[b]=sb*inner[b];return p;
    }));
    // Four bevels along this axis.
    for(const sa of [-1,1])for(const sb of [-1,1])face([[-1,0],[1,0],[1,1],[-1,1]].map(([end,side])=>{
      const p=[0,0,0];p[axis]=end*inner[axis];p[a]=sa*(side?inner[a]:half[a]);p[b]=sb*(side?half[b]:inner[b]);return p;
    }));
  }
  for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
    const signs=[sx,sy,sz];face([0,1,2].map(axis=>signs.map((s,k)=>s*(k===axis?half[k]:inner[k]))));
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);return geo;
}

function boxMesh(kit: ModelKit, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, opts?: Parameters<ModelKit['mat']>[1]) {
  const material=kit.mat(color,opts),beveled=!!material.userData.gunFinish;
  const m = new THREE.Mesh(kit.geo(`${beveled?'gun-bevel-':'b'}${w},${h},${d}`, () => beveled?bevelBox(w,h,d):new THREE.BoxGeometry(w, h, d)),material);
  m.position.set(x, y, z);
  return m;
}

function stock(kit: ModelKit,w: number,h: number,d: number,color: number,x: number,y: number,z: number): THREE.Mesh {
  const geo=kit.geo(`gun-stock-${w},${h},${d}`,()=>{
    const shape=bevelBox(w,h,d),p=shape.getAttribute('position');
    for(let i=0;i<p.count;i++){const t=(p.getZ(i)+d/2)/d;p.setXYZ(i,p.getX(i)*(.65+.35*t),p.getY(i)*(.65+.35*t)-.025*t,p.getZ(i));}
    shape.computeVertexNormals();return shape;
  });
  const mesh=new THREE.Mesh(geo,kit.mat(color));mesh.position.set(x,y,z);return mesh;
}

/** Open muzzle, annular lips and an inward-facing bore, all in the barrel's existing draw. */
function barrel(kit: ModelKit,r: number,len: number,color: number,x=0,y=0,z=0): THREE.Mesh {
  const geo=kit.geo(`gun-tube-${r},${len}`,()=>{
    const outside=new THREE.CylinderGeometry(r,r,len,12,1,true).rotateX(Math.PI/2);
    const inside=new THREE.CylinderGeometry(r*.62,r*.62,len,12,1,true).rotateX(Math.PI/2);
    const n=inside.getAttribute('normal');for(let i=0;i<n.count;i++)n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i));
    const idx=inside.index!;for(let i=0;i<idx.count;i+=3){const a=idx.getX(i);idx.setX(i,idx.getX(i+2));idx.setX(i+2,a);}
    const front=new THREE.RingGeometry(r*.62,r,12).rotateY(Math.PI).translate(0,0,-len/2);
    const rear=new THREE.RingGeometry(r*.62,r,12).translate(0,0,len/2);
    const parts=[outside,inside,front,rear],merged=mergeGeometries(parts)!;for(const part of parts)part.dispose();return merged;
  });
  const mesh=new THREE.Mesh(geo,kit.mat(color));mesh.position.set(x,y,z);return mesh;
}
function cyl(kit: ModelKit, r: number, len: number, color: number, x = 0, y = 0, z = 0, opts?: Parameters<ModelKit['mat']>[1], r2 = r, seg = 12) {
  const m = new THREE.Mesh(kit.geo(`c${r},${r2},${len},${seg}`, () => new THREE.CylinderGeometry(r, r2, len, seg)), kit.mat(color, opts));
  m.rotation.x = Math.PI / 2; // along z
  m.position.set(x, y, z);
  return m;
}

/** A weapon model pointing down -z with its muzzle position stored in userData.muzzle (local). */
export function buildGun(modelKit: ModelKit, id: WeaponId): THREE.Group {
  // Keep weapon finishes separate from egg/pickup materials with the same colour.
  // The kit still shares each finish texture across every gun, including the viewmodel.
  const kit: ModelKit={...modelKit,mat(color,opts={}){
    const finish: GunFinish=opts.finish??(color===WOOD||color===0xf1d7a8?'wood':color===DARK||color===STEEL||color===0xb9bec4?'steel':color===GOLD?'brass':color===0xf28bb0?'grip':'paint');
    const rough=finish==='grip'?.85:finish==='wood'?.6:.4,metal=finish==='steel'||finish==='brass'?.65:finish==='paint'?.25:0;
    const paintColor=finish==='paint'?new THREE.Color(color).lerp(new THREE.Color(0xffffff),.12).getHex():color;
    return modelKit.mat(paintColor,{rough,metal,...opts,finish});
  }};
  const g = new THREE.Group();
  let muzzle = -0.6;
  switch (id) {
    case 'bell':
      g.add(boxMesh(kit, 0.07, 0.11, 0.46, NAVY, 0, 0, -0.1), barrel(kit, 0.018, 0.3, DARK, 0, 0.02, -0.48), boxMesh(kit, 0.05, 0.16, 0.08, GOLD, 0, -0.11, -0.14),
        stock(kit, 0.06, 0.1, 0.2, NAVY, 0, -0.01, 0.2), boxMesh(kit, 0.04, 0.04, 0.12, DARK, 0, 0.08, -0.1), boxMesh(kit, 0.05, 0.12, 0.05, DARK, 0, -0.1, 0.05,{finish:'grip'}));
      // The bell on the top rail.
      g.add(new THREE.Mesh(kit.geo('bell', () => new THREE.LatheGeometry([[0,-.025],[.032,-.025],[.035,-.02],[.028,-.014],[.023,0],[.017,.014],[.007,.021],[.007,.027],[0,.029]].map(([x,y])=>new THREE.Vector2(x,y)),12)), kit.mat(GOLD, { metal: 0.6, rough: 0.3 })).translateY(0.078).translateZ(-0.24));
      muzzle = -0.64;
      break;
    case 'detention':
      g.add(barrel(kit, 0.032, 0.62, DARK, 0, 0.02, -0.32), cyl(kit, 0.028, 0.5, DARK, 0, -0.045, -0.28), boxMesh(kit, 0.07, 0.08, 0.2, WOOD, 0, -0.045, -0.3),
        boxMesh(kit, 0.07, 0.1, 0.18, NAVY, 0, -0.01, 0.02), stock(kit, 0.06, 0.11, 0.24, WOOD, 0, -0.04, 0.22));
      muzzle = -0.64;
      break;
    case 'hallpass':
      g.add(boxMesh(kit, 0.06, 0.1, 0.56, 0xe9e1cf, 0, 0, -0.12), barrel(kit, 0.016, 0.28, DARK, 0, 0.02, -0.52), cyl(kit, 0.03, 0.2, DARK, 0, 0.1, -0.1),
        boxMesh(kit, 0.04, 0.12, 0.06, NAVY, 0, -0.1, -0.1), stock(kit, 0.06, 0.12, 0.2, NAVY, 0, -0.02, 0.24));
      // Lanyard tag.
      g.add(boxMesh(kit, 0.005, 0.07, 0.05, GOLD, 0.035, -0.05, 0.05));
      muzzle = -0.67;
      break;
    case 'firedrill':
      g.add(barrel(kit, 0.075, 0.78, 0xd8322b, 0, 0.02, -0.18), barrel(kit, 0.082, 0.05, GOLD, 0, 0.02, -0.5), barrel(kit, 0.082, 0.05, GOLD, 0, 0.02, 0.12),
        barrel(kit, 0.05, 0.08, DARK, 0, 0.02, -0.6), boxMesh(kit, 0.05, 0.13, 0.06, DARK, 0, -0.1, -0.05,{finish:'grip'}), boxMesh(kit, 0.04, 0.06, 0.1, DARK, 0, 0.1, -0.2));
      muzzle = -0.62;
      break;
    case 'recess':
      g.add(boxMesh(kit, 0.07, 0.1, 0.3, 0x37c98b, 0, 0, -0.05), barrel(kit, 0.016, 0.14, DARK, 0, 0.01, -0.26), boxMesh(kit, 0.04, 0.22, 0.05, DARK, 0, -0.15, -0.08),
        boxMesh(kit, 0.05, 0.11, 0.05, DARK, 0, -0.09, 0.05,{finish:'grip'}), boxMesh(kit, 0.03, 0.03, 0.18, GOLD, 0, 0.065, -0.05));
      muzzle = -0.34;
      break;
    case 'valedictorian':
      g.add(boxMesh(kit, 0.065, 0.1, 0.5, NAVY, 0, 0, -0.08), barrel(kit, 0.018, 0.5, DARK, 0, 0.02, -0.58), cyl(kit, 0.038, 0.32, DARK, 0, 0.11, -0.1),
        barrel(kit, 0.045, 0.04, GOLD, 0, 0.11, -0.27), stock(kit, 0.06, 0.13, 0.22, NAVY, 0, -0.02, 0.26), boxMesh(kit, 0.05, 0.1, 0.05, GOLD, 0, -0.1, 0.0));
      // Mortarboard tassel on the scope.
      g.add(boxMesh(kit, 0.09, 0.01, 0.09, DARK, 0, 0.15, -0.02), boxMesh(kit, 0.008, 0.06, 0.008, GOLD, 0.04, 0.13, 0.02));
      muzzle = -0.84;
      break;
    case 'triple':
      g.add(boxMesh(kit, 0.075, 0.12, 0.5, 0x6c4fd1, 0, 0, -0.08), barrel(kit, 0.02, 0.22, DARK, 0, 0.02, -0.43), boxMesh(kit, 0.05, 0.13, 0.08, DARK, 0, -0.11, 0.08,{finish:'grip'}),
        boxMesh(kit, 0.06, 0.04, 0.14, DARK, 0, 0.08, -0.12));
      for (let i = 0; i < 3; i++) g.add(boxMesh(kit, 0.078, 0.02, 0.025, GOLD, 0, 0.03, -0.24 + i * 0.05));
      muzzle = -0.55;
      break;
    case 'pencil':
      // A giant pencil: yellow hexagonal barrel, sharpened graphite tip, pink eraser grip.
      g.add(new THREE.Mesh(kit.geo('pencil-body', () => new THREE.CylinderGeometry(0.035, 0.035, 0.26, 6).rotateX(Math.PI / 2)), kit.mat(0xffc93c)).translateZ(-0.12));
      g.add(new THREE.Mesh(kit.geo('pencil-tip', () => new THREE.ConeGeometry(0.035, 0.09, 6).rotateX(-Math.PI / 2)), kit.mat(0xf1d7a8)).translateZ(-0.295));
      g.add(new THREE.Mesh(kit.geo('pencil-lead', () => new THREE.ConeGeometry(0.012, 0.03, 6).rotateX(-Math.PI / 2)), kit.mat(DARK)).translateZ(-0.345));
      g.add(cyl(kit, 0.037, 0.03, 0xb9bec4, 0, 0, 0.025, { metal: 0.6 }), boxMesh(kit, 0.05, 0.13, 0.06, 0xf28bb0, 0, -0.08, 0.04));
      muzzle = -0.36;
      break;
  }
  if(id!=='pencil'&&id!=='firedrill') {
    // Small sight posts and a curved trigger guard replace the unfinished block silhouette.
    const barrelTop={bell:.038,detention:.052,hallpass:.036,recess:.026,valedictorian:.038,triple:.04}[id];
    g.add(boxMesh(kit,.008,.028,.012,DARK,0,barrelTop+.012,muzzle+.07));
    if(id!=='hallpass'&&id!=='valedictorian') {
      const receiverTop={bell:.055,detention:.04,recess:.05,triple:.06}[id];
      for(const x of [-.018,.018])g.add(boxMesh(kit,.006,.025,.022,DARK,x,receiverTop+.0105,.04));
    }
    const guard=new THREE.Mesh(kit.geo('gun-trigger-guard',()=>new THREE.TorusGeometry(.028,.004,4,10,Math.PI*1.4).rotateY(Math.PI/2)),kit.mat(DARK));
    guard.position.set(0,-.074,-.015);g.add(guard);
  }
  if(id==='hallpass'||id==='valedictorian') {
    const r=id==='hallpass'?.026:.034,len=id==='hallpass'?.2:.32;
    const lensGeo=kit.geo(`gun-lens-${r}`,()=>new THREE.CircleGeometry(r,16));
    const lensMat=modelKit.mat(0x458b9c,{rough:.18,metal:.6,emissive:0x102b32});
    for(const side of [-1,1]) {
      const lens=new THREE.Mesh(lensGeo,lensMat);lens.position.set(0,id==='hallpass'?.1:.11,-.1+side*(len/2+.001));
      if(side<0)lens.rotation.y=Math.PI;g.add(lens);
    }
  }
  g.userData.muzzle = muzzle;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  batchStaticMeshes(kit,g,`gun-${id}`);
  return g;
}

export interface FighterModel {
  group: THREE.Group;
  body: THREE.Group;
  arms: THREE.Group;
  gunHolder: THREE.Group;
  feet: [THREE.Mesh, THREE.Mesh];
  shield: THREE.Mesh;
  marker: THREE.Mesh;
  gunId: WeaponId | null;
  walk: number;
  flash: THREE.Sprite;
  flashTime: number;
}

/** A broad, smooth eggshell with a simple face and a narrow house-colour ring. */
export function buildFighter(kit: ModelKit, color: number, crest: THREE.Texture, flashMat: THREE.SpriteMaterial): FighterModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.84;
  const eggGeometry = (thetaStart = 0, thetaLength = Math.PI, outset = 0) => {
    const geo = new THREE.SphereGeometry(1, 32, thetaLength < Math.PI ? 2 : 24, 0, Math.PI * 2, thetaStart, thetaLength);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), taper = 1 - 0.12 * y;
      p.setXYZ(i, p.getX(i) * taper * (0.55 + outset), y * 0.68, p.getZ(i) * taper * (0.48 + outset));
    }
    geo.computeVertexNormals();
    return geo;
  };
  const shellColor = new THREE.Color(color).lerp(new THREE.Color(0xfffbf2), 0.96).getHex();
  const shell = new THREE.Mesh(kit.geo('egg-shell', () => eggGeometry()), kit.mat(shellColor, { rough: 0.27 }));
  shell.castShadow = true;
  const band = new THREE.Mesh(kit.geo('egg-band', () => eggGeometry(2.02, 0.13, 0.002)), kit.mat(color, { rough: 0.45 }));
  body.add(shell, band);
  // Shallow dark eyes follow the shell instead of protruding white eyeballs.
  const faceY = BODY.eye - body.position.y;
  for (const x of [-0.115, 0.115]) {
    const eye = new THREE.Mesh(kit.geo('egg-eye', () => new THREE.SphereGeometry(1, 16, 12)), kit.mat(0x192738, { rough: 0.25 }));
    eye.name = 'egg-eye';
    eye.position.set(x, faceY, -0.224); eye.scale.set(0.027, 0.046, 0.014);
    eye.rotation.y = x < 0 ? 0.15 : -0.15;
    body.add(eye);
  }
  const smile = new THREE.Mesh(kit.geo('egg-smile', () => new THREE.TorusGeometry(0.038, 0.007, 8, 16, Math.PI)), kit.mat(0x192738));
  smile.rotation.set(0, Math.PI, Math.PI);
  smile.position.set(0, faceY - 0.12, -0.34);
  body.add(smile);
  batchStaticMeshes(kit,body,`egg-${color}`);
  const feet: [THREE.Mesh, THREE.Mesh] = [0, 1].map(i => {
    const f = new THREE.Mesh(kit.geo('egg-foot', () => new THREE.SphereGeometry(0.1, 12, 8)), kit.mat(color));
    f.scale.set(1, 0.7, 1.6);
    f.position.set(i ? 0.21 : -0.21, 0.09, -0.04);
    f.castShadow = true;
    return f;
  }) as unknown as [THREE.Mesh, THREE.Mesh];
  const arms = new THREE.Group();
  arms.position.set(0, 1.1, 0);
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.34, -0.12, -0.48);
  gunHolder.scale.setScalar(0.95);
  arms.add(gunHolder);
  for (const [x, z] of [[0.34, -0.4], [0.24, -0.64]] as const) {
    const hand = new THREE.Mesh(kit.geo('egg-hand', () => new THREE.SphereGeometry(0.055, 12, 10)), kit.mat(0xfff4db));
    hand.position.set(x, -0.15, z);
    arms.add(hand);
  }
  const shield = new THREE.Mesh(kit.geo('fshield', () => new THREE.SphereGeometry(1.05, 20, 14)), kit.mat(0x9fe8ff, { transparent: 0.22, emissive: 0x2a8fb5 }));
  shield.position.y = 0.95; shield.visible = false;
  const marker = new THREE.Mesh(kit.geo('fmarker', () => new THREE.ConeGeometry(0.13, 0.22, 4).rotateX(Math.PI)), kit.mat(color, { emissive: color }));
  marker.position.y = 2.05; marker.visible = false;
  const flash = new THREE.Sprite(flashMat);
  flash.scale.setScalar(0.45); flash.visible = false;
  group.add(body, ...feet, arms, shield, marker, flash);
  return { group, body, arms, gunHolder, feet, shield, marker, gunId: null, walk: 0, flash, flashTime: 0 };
}

export function setFighterGun(kit: ModelKit, model: FighterModel, id: WeaponId) {
  if (model.gunId === id) return;
  model.gunHolder.clear();
  const gun = buildGun(kit, id);
  model.gunHolder.add(gun);
  model.gunId = id;
}

/** Ammo box: a navy case with a gold band. Grenade: the Science Fair flask with green fizz. */
export function buildPickup(kit: ModelKit, kind: 'ammo' | 'grenade'): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'ammo') {
    g.add(boxMesh(kit, 0.55, 0.32, 0.36, NAVY), boxMesh(kit, 0.57, 0.08, 0.38, GOLD), boxMesh(kit, 0.18, 0.05, 0.05, DARK, 0, 0.19, 0));
  } else {
    g.add(buildFlask(kit, 1.6));
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

export function buildFlask(kit: ModelKit, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(kit.geo('flask', () => new THREE.SphereGeometry(0.1, 14, 10)), kit.mat(0x7dff8a, { emissive: 0x2fbf4a, rough: 0.2 }));
  const neck = new THREE.Mesh(kit.geo('flask-neck', () => new THREE.CylinderGeometry(0.035, 0.05, 0.1, 10)), kit.mat(0xd8f3ff, { transparent: 0.7 }));
  neck.position.y = 0.12;
  const cork = new THREE.Mesh(kit.geo('flask-cork', () => new THREE.CylinderGeometry(0.04, 0.035, 0.05, 10)), kit.mat(WOOD));
  cork.position.y = 0.19;
  g.add(glass, neck, cork);
  g.scale.setScalar(scale);
  return g;
}

export function buildRocket(kit: ModelKit): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(kit, 0.06, 0.32, 0xd8322b), cyl(kit, 0.062, 0.05, GOLD, 0, 0, 0.1));
  const tip = new THREE.Mesh(kit.geo('rtip', () => new THREE.ConeGeometry(0.06, 0.14, 10).rotateX(-Math.PI / 2)), kit.mat(0xf3efe6));
  tip.position.z = -0.23;
  g.add(tip);
  return g;
}

export function disposeOwned(root: THREE.Object3D) {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.ownMaterial) (mesh.material as THREE.Material).dispose();
  });
}
