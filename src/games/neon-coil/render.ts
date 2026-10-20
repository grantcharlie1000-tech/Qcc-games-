import { ARENA_RADIUS, radius, wrapAngle, type Arena, type Point, type Snake } from './model';
const FOOD_COLORS = ['#c7fb70', '#73e7ff', '#ffb0da', '#b8a5ff', '#ffcb7e', '#8df4c7', '#ff9995'];
export interface View { width: number; height: number; zoom: number; x: number; y: number }
export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const tile = document.createElement('canvas'); tile.width = tile.height = 240;
  const ink = tile.getContext('2d')!; ink.strokeStyle = '#162536'; ink.lineWidth = 3; ink.lineCap = 'round';
  // Original, quiet woven paths; no reference assets or repeating UI grid.
  for (const [x, y, rot] of [[25, 30, .2], [135, 65, 1.1], [60, 165, -.7], [194, 190, .4]]) {
    ink.save(); ink.translate(x, y); ink.rotate(rot); ink.beginPath(); ink.moveTo(-24, 0);
    ink.bezierCurveTo(-14, -28, 12, 27, 23, 0); ink.bezierCurveTo(30, -14, 39, -12, 43, -2); ink.stroke(); ink.restore();
  }
  const pattern = ctx.createPattern(tile, 'repeat')!;
  const sprites = FOOD_COLORS.map(color => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 48;
    const c = sprite.getContext('2d')!, g = c.createRadialGradient(24, 24, 1, 24, 24, 24);
    g.addColorStop(0, color); g.addColorStop(.22, color + 'c0'); g.addColorStop(.5, color + '24'); g.addColorStop(1, color + '00');
    c.fillStyle = g; c.fillRect(0, 0, 48, 48); return sprite;
  });
  let dpr = 1;
  const view: View = { width: 1, height: 1, zoom: 1, x: 0, y: 0 };
  function resize(width: number, height: number) {
    view.width = Math.max(1, width); view.height = Math.max(1, height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  function drawSnake(snake: Snake, alpha: number, reduced: boolean) {
    const x = snake.previous.x + (snake.x - snake.previous.x) * alpha;
    const y = snake.previous.y + (snake.y - snake.previous.y) * alpha;
    const angle = snake.previousAngle + wrapAngle(snake.angle - snake.previousAngle) * alpha, r = radius(snake);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); const tail = snake.body[snake.body.length - 1]; ctx.moveTo(tail.x, tail.y);
    for (let i = snake.body.length - 2; i > 0; i--) ctx.lineTo(snake.body[i].x, snake.body[i].y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#050e18'; ctx.lineWidth = r * 2 + 5; ctx.stroke();
    if (snake.boosting && !reduced) { ctx.shadowColor = snake.color; ctx.shadowBlur = 14; }
    ctx.strokeStyle = snake.color; ctx.lineWidth = r * 2; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff24'; ctx.lineWidth = r * .6; ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = snake.color; ctx.beginPath(); ctx.ellipse(0, 0, r + 2, r + 1, 0, 0, Math.PI * 2); ctx.fill();
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fffef0'; ctx.beginPath(); ctx.arc(3, side * r * .52, r * .43, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#132139'; ctx.beginPath(); ctx.arc(4.5, side * r * .52, r * .22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.textAlign = 'center'; ctx.font = `${snake.id === 0 ? '700' : '500'} 12px system-ui,sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = '#0b1727'; ctx.strokeText(snake.name, x, y - r - 15);
    ctx.fillStyle = snake.id === 0 ? '#d7ff9c' : '#d2dce7'; ctx.fillText(snake.name, x, y - r - 15);
  }
  function draw(s: Arena, alpha = 1, reduced = false) {
    const player = s.snakes[0];
    view.x = player.previous.x + (player.x - player.previous.x) * alpha;
    view.y = player.previous.y + (player.y - player.previous.y) * alpha;
    const baseZoom = Math.min(1.2, Math.max(.72, view.height / 760));
    view.zoom = baseZoom / (1 + Math.min(.3, Math.max(0, player.mass - 30) / 1000));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0c1727'; ctx.fillRect(0, 0, view.width, view.height);
    ctx.save(); ctx.translate(view.width / 2, view.height / 2); ctx.scale(view.zoom, view.zoom); ctx.translate(-view.x, -view.y);
    const halfW = view.width / view.zoom / 2, halfH = view.height / view.zoom / 2;
    ctx.fillStyle = pattern; ctx.fillRect(view.x - halfW, view.y - halfH, halfW * 2, halfH * 2);
    // The rim is an actual hazard. It becomes visible as the camera approaches it.
    ctx.beginPath(); ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2); ctx.lineWidth = 16; ctx.strokeStyle = '#f4857950'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffab96'; ctx.stroke();
    for (const food of s.food) {
      if (Math.abs(food.x - view.x) > halfW + 25 || Math.abs(food.y - view.y) > halfH + 25) continue;
      const size = Math.min(7, 2.5 + Math.sqrt(food.value)), glow = size * 5;
      ctx.drawImage(sprites[food.color], food.x - glow / 2, food.y - glow / 2, glow, glow);
      ctx.fillStyle = FOOD_COLORS[food.color]; ctx.beginPath(); ctx.arc(food.x, food.y, size * .58, 0, Math.PI * 2); ctx.fill();
      if (food.trail) { ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = .7; ctx.stroke(); }
    }
    const visible = (snake: Snake) => snake.body.some((p: Point, i: number) => i % 8 === 0 && Math.abs(p.x - view.x) < halfW + 50 && Math.abs(p.y - view.y) < halfH + 50);
    for (const snake of s.snakes) if (snake.id !== 0 && snake.alive && visible(snake)) drawSnake(snake, alpha, reduced);
    if (player.alive) drawSnake(player, alpha, reduced);
    ctx.restore();
    // A true world map: every dot comes from a live snake's world coordinates.
    if (view.width >= 700 && view.height >= 500) {
      const mx = 66, my = view.height - 76, r = 38;
      ctx.beginPath(); ctx.arc(mx, my, r + 7, 0, Math.PI * 2); ctx.fillStyle = '#07111fc9'; ctx.fill();
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = '#405269'; ctx.stroke();
      for (const snake of s.snakes) if (snake.alive) {
        ctx.beginPath(); ctx.arc(mx + snake.x / ARENA_RADIUS * r, my + snake.y / ARENA_RADIUS * r, snake.id === 0 ? 3 : 1.4, 0, Math.PI * 2);
        ctx.fillStyle = snake.id === 0 ? '#c7fb70' : '#7e91a8'; ctx.fill();
      }
      ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#95a8bd'; ctx.fillText('ARENA', mx, my + 58);
    }
  }
  return { resize, draw, view };
}
