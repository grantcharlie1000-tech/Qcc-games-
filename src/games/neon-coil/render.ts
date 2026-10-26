import { ARENA_RADIUS, radius, wrapAngle, type Arena, type Snake } from './model';
import { bandIndex, resampleBody, SKINS, skinFor, type StampBuffer } from './skin';
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
  bodySprite('#d6ffff');
  const foodSprites = TRAIL_COLORS.map(color => {
    const sprite = surface(64), c = sprite.getContext('2d')!, g = c.createRadialGradient(32,32,2,32,32,31);
    g.addColorStop(0,color+'c0'); g.addColorStop(.25,color+'8c'); g.addColorStop(.52,color+'28'); g.addColorStop(1,color+'00');
    c.fillStyle = g; c.fillRect(0,0,64,64);
    c.fillStyle = color; c.beginPath(); c.arc(32,32,10,0,TAU); c.fill();
    c.fillStyle = '#ffffffa8'; c.beginPath(); c.arc(30,29,3,0,TAU); c.fill(); return sprite;
  });
  const stamps: StampBuffer = { points: [], count: 0, length: 0 }, head = { x: 0, y: 0 };
  const visible: Snake[] = [], boostIntensity = new Map<number, number>();
  let dpr = 1, halfW = 1, halfH = 1, lastFrame: number | null = null, arena: Arena | null = null;
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
  function drawBody(snake: Snake, alpha: number) {
    interpolate(snake,alpha);
    const r = radius(snake), d = r*2, skin = skinFor(snake.id,snake.color), intensity = boostIntensity.get(snake.id) ?? 0;
    resampleBody(snake.body,head,d*.25,stamps);
    for (let i = stamps.count-1; i >= 0; i--) {
      const p = stamps.points[i], taper = .45+.55*Math.min(1,(stamps.length-p.distance)/(d*3)), sr = r*taper;
      if (!inView(p.x,p.y,sr+2)) continue;
      const band = bandIndex(p.distance,d,skin.bands.length,skin.bandWidth), size = sr*2;
      ctx.drawImage(bodySprites.get(skin.bands[band])!,p.x-sr,p.y-sr,size,size);
      if (intensity > 0 && Math.floor(p.distance/(d*1.4))%2 === 0) {
        ctx.globalAlpha = intensity; ctx.drawImage(bodySprites.get('#d6ffff')!,p.x-sr,p.y-sr,size,size); ctx.globalAlpha = 1;
      }
    }
  }
  function drawHead(snake: Snake, alpha: number) {
    interpolate(snake,alpha); if (!inView(head.x,head.y,40)) return;
    const r = radius(snake), hr = r*1.1, angle = snake.previousAngle+wrapAngle(snake.angle-snake.previousAngle)*alpha;
    ctx.drawImage(bodySprites.get(skinFor(snake.id,snake.color).head)!,head.x-hr,head.y-hr,hr*2,hr*2);
    ctx.save(); ctx.translate(head.x,head.y); ctx.rotate(angle);
    for (let side = -1; side <= 1; side += 2) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r*.43,side*r*.48,r*.35,0,TAU); ctx.fill();
      ctx.fillStyle = '#080d17'; ctx.beginPath(); ctx.arc(r*.56,side*r*.48,r*.16,0,TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawLabel(snake: Snake, alpha: number) {
    interpolate(snake,alpha); if (!inView(head.x,head.y,60)) return;
    const x = (head.x-view.x)*view.zoom+view.width/2, y = (head.y-view.y+radius(snake)*3.2)*view.zoom+view.height/2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 12px system-ui,sans-serif'; ctx.lineJoin = 'round';
    ctx.lineWidth = 3; ctx.strokeStyle = '#090f19'; ctx.strokeText(snake.id === 0 ? 'YOU' : snake.name,x,y);
    ctx.fillStyle = '#f7faff'; ctx.fillText(snake.id === 0 ? 'YOU' : snake.name,x,y);
  }
  function draw(s: Arena, alpha = 1, reduced = false) {
    const now = performance.now();
    if (arena !== s) { arena = s; boostIntensity.clear(); lastFrame = null; }
    const elapsed = lastFrame === null ? 0 : Math.max(0,Math.min(250,now-lastFrame)); lastFrame = now;
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
      const size = food.trail ? Math.min(18,10+Math.sqrt(food.value)) : Math.min(30,12+Math.sqrt(food.value)*4);
      const color = food.trail ? ((Math.imul(food.id,2654435761) >>> 0)%TRAIL_COLORS.length) : food.color;
      ctx.drawImage(foodSprites[color],food.x-size/2,food.y-size/2,size,size);
    }
    visible.length = 0;
    for (const snake of s.snakes) if (snake.id !== 0 && snake.alive && snakeVisible(snake)) visible.push(snake);
    if (player.alive) visible.push(player);
    for (const snake of visible) drawBody(snake,alpha);
    for (const snake of visible) drawHead(snake,alpha);
    ctx.restore();
    for (const snake of visible) drawLabel(snake,alpha);
    // Retain the true world map, above the compact boost control and host footer.
    if (view.width >= 700 && view.height >= 500) {
      const mx = 54, my = view.height-175, r = 27;
      ctx.beginPath(); ctx.arc(mx,my,r+5,0,TAU); ctx.fillStyle = '#0b101a80'; ctx.fill();
      ctx.beginPath(); ctx.arc(mx,my,r,0,TAU); ctx.lineWidth = 1; ctx.strokeStyle = '#6c7a8a55'; ctx.stroke();
      for (const snake of s.snakes) if (snake.alive) {
        ctx.beginPath(); ctx.arc(mx+snake.x/ARENA_RADIUS*r,my+snake.y/ARENA_RADIUS*r,snake.id === 0 ? 2.5 : 1.1,0,TAU);
        ctx.fillStyle = snake.id === 0 ? '#22d3ee' : '#7e91a899'; ctx.fill();
      }
    }
  }
  return { resize, draw, view };
}
