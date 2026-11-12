#!/usr/bin/env python3
"""Main-thread script per frame from a CPU profile made by perfprofile.mjs (unminified build): each frame is a run of
samples under the game loop; each sample is charged to the first of these it is under, innermost first:
  three.js render submission (WebGLRenderer.render), HUD (hud update), simulation (advance), scene update (render in
  scene.ts, the rest of it), arcade shell (other bundles), other (the loop itself).
  python3 scripts/breachline-assets/scriptsplit.py <profile prefix>"""
import json, sys, statistics
prof = json.load(open(sys.argv[1] + '.cpuprofile'))
nodes = {n['id']: n for n in prof['nodes']}; parent = {}
for n in prof['nodes']:
    for c in n.get('children', []): parent[c] = n['id']
def stack(i):
    out = []
    while i in nodes: cf = nodes[i]['callFrame']; out.append((cf['functionName'], cf['url'].split('/')[-1])); i = parent.get(i)
    return out
def part(st):
    outer = [f for f, _ in reversed(st)]
    if 'loop' not in outer:
        if outer and outer[-1] in ('(idle)', '(program)'): return None
        if outer and outer[-1] == '(garbage collector)': return 'gc'
        return None if any(u.startswith('index-') or 'three' in u for _, u in st) else 'shell'
    i = outer.index('loop'); rest = outer[i + 1:]
    if not rest: return 'loop other'
    if rest[0] in ('advance', 'advance2'): return 'simulation'
    if rest[0] == 'draw' and len(rest) > 1:
        if rest[1] == 'render': return 'three.js submission' if 'WebGLRenderer.render' in rest else 'scene update'
        if rest[1] == 'update': return 'hud'
        return 'draw other (' + rest[1] + ')'
    return 'loop other'
frames, cur, totals, nat, own = [], None, {}, {}, {}
paths, curp = [], None
for s, dt in zip(prof['samples'], prof['timeDeltas']):
    st = stack(s); p = part(st); ms = dt / 1000
    if p in (None, 'shell', 'gc'):
        if p: totals[p] = totals.get(p, 0) + ms
        if cur: frames.append(cur); paths.append(curp or {}); cur = None; curp = None
        continue
    cur = cur or {}; cur[p] = cur.get(p, 0) + ms
    # Where in the game this sample was: the loop's path two calls below draw / render / advance.
    outer = [f for f, _ in reversed(st)]
    if 'loop' in outer:
        rest = [f or '(anon)' for f in outer[outer.index('loop') + 1:]]
        key = ' > '.join(rest[:4]); curp = curp if curp is not None else {}; curp[key] = curp.get(key, 0) + ms
    # The innermost frame with no script URL is a native call: inside the loop, almost all of it is WebGL.
    f0, u0 = st[0]
    if not u0: cur['(native: WebGL and other browser calls)'] = cur.get('(native: WebGL and other browser calls)', 0) + ms; nat[f0] = nat.get(f0, 0) + ms
    else: own[f'{f0 or "(anon)"} {u0}'] = own.get(f'{f0 or "(anon)"} {u0}', 0) + ms
if cur: frames.append(cur); paths.append(curp or {})
tot = [sum(v for k, v in f.items() if k != '(native: WebGL and other browser calls)') for f in frames]
print(f"frames {len(frames)}  script per frame: median {statistics.median(tot):.1f} ms, worst {max(tot):.1f} ms")
keys = [k for k in sorted({k for f in frames for k in f}, key=lambda k: -sum(f.get(k, 0) for f in frames)) if k != '(native: WebGL and other browser calls)']
for k in keys:
    v = [f.get(k, 0) for f in frames]; print(f"  {k:22s} median {statistics.median(v):5.2f}  mean {sum(v)/len(v):5.2f}  worst {max(v):6.2f} ms")
print(f"  outside the game loop, per frame on average: arcade shell and page {totals.get('shell', 0) / max(1, len(frames)):.2f} ms, garbage collection {totals.get('gc', 0) / max(1, len(frames)):.2f} ms")

NAT = '(native: WebGL and other browser calls)'
tot_nat = [f.get(NAT, 0) for f in frames]; tot_js = [sum(v for k, v in f.items() if k != NAT) - f.get(NAT, 0) for f in frames]
print(f"  of the script: native calls median {statistics.median(tot_nat):.2f} ms, our JavaScript and three.js median {statistics.median([a - b for a, b in zip(tot, tot_nat)]):.2f} ms")
print('  top native calls:', ', '.join(f'{k} {v / len(frames):.2f}' for k, v in sorted(nat.items(), key=lambda x: -x[1])[:6]))
print('  top JavaScript (self ms per frame):')
for k, v in sorted(own.items(), key=lambda x: -x[1])[:10]: print(f'    {v / len(frames):5.2f}  {k}')

over8 = sum(1 for t in tot if t > 8); over12 = sum(1 for t in tot if t > 12)
print(f'  frames over 8 ms of script: {over8}, over 12 ms: {over12} (of {len(frames)})')
if '--spikes' in sys.argv:
    for t, pth in sorted(zip(tot, paths), key=lambda x: -x[0])[:8]:
        print(f'  spike {t:.1f} ms: ' + '; '.join(f'{k} {v:.1f}' for k, v in sorted(pth.items(), key=lambda x: -x[1])[:4]))
