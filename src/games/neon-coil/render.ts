import { ARENA_RADIUS, bodyRadiusAt, headRadius, hooverRadius, immunityPaleness, radius, wrapAngle, type Arena, type Snake } from './model';
import { bandIndex, resampleBody, SKINS, skinFor, type StampBuffer } from './skin';
import { IMMUNE_OPACITY_DROP, IMMUNE_PALE_STRENGTH } from './tuning';
/** Body sprites paint their disc at radius 46 inside a 96 px canvas. */
export const SPRITE_DISC = 46 / 48;
/** Sprite draw size whose visible disc has exactly radius `r` — the same radius the model collides with. */
export const spriteSize = (r: number) => r * 2 / SPRITE_DISC;
const PALE = '#eef3f8', BOOST_BAND = '#d6ffff';
const FOOD_COLORS = ['#22d3ee','#2f7bff','#5be12c','#b6e61a','#ffd21f','#ffa41b','#ff3d5a'];
const TRAIL_COLORS = [...FOOD_COLORS,'#f03cbf','#9b30ff'];
const TAU = Math.PI * 2;
const surface = (size: number) => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
const mix = (hex: string, target: number, amount: number) => {
  const n = parseInt(hex.slice(1),16);
  return `rgb(${[n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(v + (target-v)*amount)).join(',')})`;
};
export interface View { width: number; height: number; zoom: number; x: number; y: number }
export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const tile = surface(256), ink = tile.getContext('2d')!;
  ink.fillStyle = '#141923'; ink.fillRect(0,0,256,256); ink.lineCap = ink.lineJoin = 'round';
  // Rounded hooks and bent waves, with wrapped copies at every seam. This local
  // decorative sequence never consumes the simulation's seeded RNG.
  for (let i = 0; i < 42; i++) {
    const x = (i%7)*256/7 + Math.sin(i*7.3)*9, y = Math.floor(i/7)*256/6 + Math.cos(i*4.7)*9;
    for (let wx = -256; wx <= 256; wx += 256) for (let wy = -256; wy <= 256; wy += 256) {
      ink.save(); ink.translate(x+wx,y+wy); ink.rotate(i*2.399);
      ink.beginPath(); ink.moveTo(-13,-5);
      if (i%3 === 0) { ink.bezierCurveTo(-20,8,-4,14,0,2); ink.bezierCurveTo(4,-12,15,-8,13,3); }
      else if (i%3 === 1) { ink.bezierCurveTo(-5,-15,-4,10,4,5); ink.bezierCurveTo(13,-1,2,-14,14,-12); }
      else { ink.bezierCurveTo(-4,-10,-12,8,-3,10); ink.bezierCurveTo(6,13,14,2,12,-6); }
      ink.strokeStyle = '#0c1017'; ink.lineWidth = 11; ink.stroke();
      ink.strokeStyle = '#1c2331'; ink.lineWidth = 6; ink.stroke(); ink.restore();
    }
  }
  const pattern = ctx.createPattern(tile,'repeat')!;
  const stripe = surface(48), red = stripe.getContext('2d')!;
  red.fillStyle = '#3a0c16'; red.fillRect(0,0,48,48); red.strokeStyle = '#450f1d'; red.lineWidth = 8;
  for (let x = -48; x <= 96; x += 24) { red.beginPath(); red.moveTo(x,0); red.lineTo(x+48,48); red.stroke(); }
  const stripes = ctx.createPattern(stripe,'repeat')!;
  const bodySprites = new Map<string, HTMLCanvasElement>();
  function bodySprite(color: string) {
    if (bodySprites.has(color)) return;
    const sprite = surface(96), c = sprite.getContext('2d')!;
    c.fillStyle = '#07111c80'; c.beginPath(); c.arc(48,48,46.5,0,TAU); c.fill();
    const g = c.createRadialGradient(43,29,2,48,48,54);
    g.addColorStop(0,mix(color,255,.28)); g.addColorStop(.45,color); g.addColorStop(.8,mix(color,0,.1)); g.addColorStop(1,mix(color,0,.25));
    c.fillStyle = g; c.beginPath(); c.arc(48,48,46,0,TAU); c.fill(); bodySprites.set(color,sprite);
  }
  for (const skin of SKINS) { bodySprite(skin.head); for (const color of skin.bands) bodySprite(color); }
  bodySprite(BOOST_BAND); bodySprite(PALE);
  const foodSprites = TRAIL_COLORS.map(color => {
    const sprite = surface(64), c = sprite.getContext('2d')!, g = c.createRadialGradient(32,32,2,32,32,31);
    g.addColorStop(0,color+'c0'); g.addColorStop(.25,color+'8c'); g.addColorStop(.52,color+'28'); g.addColorStop(1,color+'00');
    c.fillStyle = g; c.fillRect(0,0,64,64);
    c.fillStyle = color; c.beginPath(); c.arc(32,32,10,0,TAU); c.fill();
    c.fillStyle = '#ffffffa8'; c.beginPath(); c.arc(30,29,3,0,TAU); c.fill(); return sprite;
  });
  const stamps: StampBuffer = { points: [], count: 0, length: 0 }, head = { x: 0, y: 0 };
  const visible: Snake[] = [], boostIntensity = new Map<number, number>();
  let dpr = 1, halfW = 1, halfH = 1, lastFrame: number | null = null, arena: Arena | null = null, minimapLift = 175;
  // Protected (immune) snakes are composed here, then laid over the arena translucently.
  const layer = surface(1), ghost = layer.getContext('2d')!;
  const view: View = { width: 1, height: 1, zoom: 1, x: 0, y: 0 };
  function resize(width: number, height: number) {
    view.width = Math.max(1,width); view.height = Math.max(1,height);
    dpr = Math.min(2,window.devicePixelRatio || 1);
    const w = Math.round(width*dpr), h = Math.round(height*dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  const inView = (x: number, y: number, margin: number) => Math.abs(x-view.x) <= halfW+margin && Math.abs(y-view.y) <= halfH+margin;
  function interpolate(snake: Snake, alpha: number) {
    head.x = snake.previous.x+(snake.x-snake.previous.x)*alpha; head.y = snake.previous.y+(snake.y-snake.previous.y)*alpha;
  }
  function snakeVisible(snake: Snake) {
    if (inView(snake.x,snake.y,60)) return true;
    for (let i = 1; i < snake.body.length; i++) {
      const a = snake.body[i-1], b = snake.body[i];
      if (Math.min(a.x,b.x) <= view.x+halfW+30 && Math.max(a.x,b.x) >= view.x-halfW-30 && Math.min(a.y,b.y) <= view.y+halfH+30 && Math.max(a.y,b.y) >= view.y-halfH-30) return true;
    }
    return false;
  }
  function drawBody(g: CanvasRenderingContext2D, snake: Snake, alpha: number, pale: number) {
    interpolate(snake,alpha);
    const r = radius(snake), d = r*2, skin = skinFor(snake.id,snake.color), intensity = boostIntensity.get(snake.id) ?? 0;
    resampleBody(snake.body,head,d*.25,stamps);
    for (let i = stamps.count-1; i >= 0; i--) {
      // Same tapered radius the model collides with at this arc distance.
      const p = stamps.points[i], sr = bodyRadiusAt(r,p.distance,stamps.length);
      if (!inView(p.x,p.y,sr+2)) continue;
      const band = bandIndex(p.distance,d,skin.bands.length,skin.bandWidth), size = spriteSize(sr), half = size/2;
      g.drawImage(bodySprites.get(skin.bands[band])!,p.x-half,p.y-half,size,size);
      if (intensity > 0 && Math.floor(p.distance/(d*1.4))%2 === 0) {
        g.globalAlpha = intensity; g.drawImage(bodySprites.get(BOOST_BAND)!,p.x-half,p.y-half,size,size); g.globalAlpha = 1;
      }
      if (pale > 0) { g.globalAlpha = pale*IMMUNE_PALE_STRENGTH; g.drawImage(bodySprites.get(PALE)!,p.x-half,p.y-half,size,size); g.globalAlpha = 1; }
    }
  }
  function drawHead(g: CanvasRenderingContext2D, snake: Snake, alpha: number, pale: number) {
    interpolate(snake,alpha); if (!inView(head.x,head.y,40)) return;
    const r = radius(snake), size = spriteSize(headRadius(snake)), half = size/2, angle = snake.previousAngle+wrapAngle(snake.angle-snake.previousAngle)*alpha;
    g.drawImage(bodySprites.get(skinFor(snake.id,snake.color).head)!,head.x-half,head.y-half,size,size);
    if (pale > 0) { g.globalAlpha = pale*IMMUNE_PALE_STRENGTH; g.drawImage(bodySprites.get(PALE)!,head.x-half,head.y-half,size,size); g.globalAlpha = 1; }
    g.save(); g.translate(head.x,head.y); g.rotate(angle);
    for (let side = -1; side <= 1; side += 2) {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(r*.43,side*r*.48,r*.35,0,TAU); g.fill();
      g.fillStyle = '#080d17'; g.beginPath(); g.arc(r*.56,side*r*.48,r*.16,0,TAU); g.fill();
    }
    g.restore();
  }
  /**
   * Protected snakes with the same paleness are drawn whole (pale) into the
   * layer, which is then composited once, translucently, so overlapping stamps
   * never accumulate opacity. Snakes spawned together share a single pass.
   */
  function drawGhosts(group: readonly Snake[], alpha: number, pale: number) {
    // Only the group's on-screen bounding box is cleared and composited.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const snake of group) {
      const pad = spriteSize(headRadius(snake))/2+2;
      for (const p of [snake.previous,...snake.body]) { minX = Math.min(minX,p.x-pad); maxX = Math.max(maxX,p.x+pad); minY = Math.min(minY,p.y-pad); maxY = Math.max(maxY,p.y+pad); }
    }
    const k = dpr*view.zoom, ox = dpr*(view.width/2-view.x*view.zoom), oy = dpr*(view.height/2-view.y*view.zoom);
    const x0 = Math.max(0,Math.floor(minX*k+ox)), y0 = Math.max(0,Math.floor(minY*k+oy));
    const x1 = Math.min(canvas.width,Math.ceil(maxX*k+ox)), y1 = Math.min(canvas.height,Math.ceil(maxY*k+oy));
    if (x1 <= x0 || y1 <= y0) return;
    // Allocated on first use, then kept at the canvas's backing size.
    if (layer.width !== canvas.width || layer.height !== canvas.height) { layer.width = canvas.width; layer.height = canvas.height; }
    ghost.setTransform(1,0,0,1,0,0); ghost.clearRect(x0,y0,x1-x0,y1-y0);
    ghost.setTransform(k,0,0,k,ox,oy);
    for (const snake of group) drawBody(ghost,snake,alpha,pale);
    for (const snake of group) drawHead(ghost,snake,alpha,pale);
    ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = 1-IMMUNE_OPACITY_DROP*pale;
    ctx.drawImage(layer,x0,y0,x1-x0,y1-y0,x0,y0,x1-x0,y1-y0); ctx.restore();
  }
  const ghosts = new Map<number, Snake[]>();
  function drawLabel(snake: Snake, alpha: number) {
    interpolate(snake,alpha); if (!inView(head.x,head.y,60)) return;
    const x = (head.x-view.x)*view.zoom+view.width/2, y = (head.y-view.y+radius(snake)*3.2)*view.zoom+view.height/2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 12px system-ui,sans-serif'; ctx.lineJoin = 'round';
    ctx.lineWidth = 3; ctx.strokeStyle = '#090f19'; ctx.strokeText(snake.id === 0 ? 'YOU' : snake.name,x,y);
    ctx.fillStyle = '#f7faff'; ctx.fillText(snake.id === 0 ? 'YOU' : snake.name,x,y);
  }
  // repaint=true redraws the current frame (glass lens) without advancing boost easing.
  function draw(s: Arena, alpha = 1, reduced = false, repaint = false) {
    const now = performance.now();
    if (arena !== s) { arena = s; boostIntensity.clear(); lastFrame = null; }
    const elapsed = repaint || lastFrame === null ? 0 : Math.max(0,Math.min(250,now-lastFrame)); if (!repaint) lastFrame = now;
    for (const snake of s.snakes) {
      const target = snake.alive && snake.boosting ? 1 : 0, value = boostIntensity.get(snake.id) ?? 0;
      boostIntensity.set(snake.id,reduced ? target : target ? Math.min(1,value+elapsed/100) : Math.max(0,value-elapsed/150));
    }
    const player = s.snakes[0]; interpolate(player,alpha); view.x = head.x; view.y = head.y;
    const baseZoom = Math.min(1.2,Math.max(.72,view.height/760));
    view.zoom = baseZoom/(1+Math.min(.3,Math.max(0,player.mass-30)/1000));
    halfW = view.width/view.zoom/2; halfH = view.height/view.zoom/2;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.save(); ctx.translate(view.width/2,view.height/2); ctx.scale(view.zoom,view.zoom); ctx.translate(-view.x,-view.y);
    const left = view.x-halfW, top = view.y-halfH, width = halfW*2, height = halfH*2;
    ctx.fillStyle = pattern; ctx.fillRect(left,top,width,height);
    // Outside the actual circular world, clipped in world space, never a HUD overlay.
    if (Math.hypot(Math.abs(view.x)+halfW,Math.abs(view.y)+halfH) >= ARENA_RADIUS-3) {
      ctx.save(); ctx.beginPath(); ctx.rect(left-3,top-3,width+6,height+6); ctx.moveTo(ARENA_RADIUS,0); ctx.arc(0,0,ARENA_RADIUS,0,TAU); ctx.clip('evenodd');
      ctx.fillStyle = stripes; ctx.fillRect(left-3,top-3,width+6,height+6); ctx.restore();
      ctx.beginPath(); ctx.arc(0,0,ARENA_RADIUS,0,TAU); ctx.lineWidth = 4; ctx.strokeStyle = '#180b13'; ctx.stroke();
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#701e30'; ctx.stroke();
    }
    for (const food of s.food) {
      if (!inView(food.x,food.y,16)) continue;
      let size = food.trail ? Math.min(18,10+Math.sqrt(food.value)) : Math.min(30,12+Math.sqrt(food.value)*4);
      // A hoovered pellet shrinks as it is drawn into its head.
      const owner = food.owner === undefined ? undefined : s.snakes[food.owner];
      if (owner?.alive) size *= .55+.45*Math.min(1,Math.hypot(owner.x-food.x,owner.y-food.y)/hooverRadius(owner));
      const color = food.trail ? ((Math.imul(food.id,2654435761) >>> 0)%TRAIL_COLORS.length) : food.color;
      ctx.drawImage(foodSprites[color],food.x-size/2,food.y-size/2,size,size);
    }
    visible.length = 0;
    for (const snake of s.snakes) if (snake.id !== 0 && snake.alive && snakeVisible(snake)) visible.push(snake);
    if (player.alive) visible.push(player);
    // Protected snakes draw last, as translucent pale ghosts over the others.
    for (const snake of visible) if (!immunityPaleness(snake,alpha)) drawBody(ctx,snake,alpha,0);
    for (const snake of visible) if (!immunityPaleness(snake,alpha)) drawHead(ctx,snake,alpha,0);
    ctx.restore();
    ghosts.clear();
    for (const snake of visible) { const pale = immunityPaleness(snake,alpha); if (pale) { const group = ghosts.get(pale); if (group) group.push(snake); else ghosts.set(pale,[snake]); } }
    for (const [pale,group] of ghosts) drawGhosts(group,alpha,pale);
    for (const snake of visible) drawLabel(snake,alpha);
    // Retain the true world map, above the compact boost control and host footer.
    if (view.width >= 700 && view.height >= 500) {
      const mx = 54, my = view.height-minimapLift, r = 27;
      ctx.beginPath(); ctx.arc(mx,my,r+5,0,TAU); ctx.fillStyle = '#0b101a80'; ctx.fill();
      ctx.beginPath(); ctx.arc(mx,my,r,0,TAU); ctx.lineWidth = 1; ctx.strokeStyle = '#6c7a8a55'; ctx.stroke();
      for (const snake of s.snakes) if (snake.alive) {
        ctx.beginPath(); ctx.arc(mx+snake.x/ARENA_RADIUS*r,my+snake.y/ARENA_RADIUS*r,snake.id === 0 ? 2.5 : 1.1,0,TAU);
        ctx.fillStyle = snake.id === 0 ? '#22d3ee' : '#7e91a899'; ctx.fill();
      }
    }
  }
  /** Distance from the viewport bottom to the minimap centre (lifted above the thumb stick on touch layouts). */
  function setMinimapLift(lift = 175) { minimapLift = lift; }
  return { resize, draw, view, setMinimapLift };
}
