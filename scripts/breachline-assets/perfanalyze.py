import json, sys, collections
prof = json.load(open(sys.argv[1] + '.cpuprofile')); fr = json.load(open(sys.argv[1] + '.frames.json'))
nodes = {n['id']: n for n in prof['nodes']}
parent = {}
for n in prof['nodes']:
    for c in n.get('children', []): parent[c] = n['id']
def key(n):
    cf = n['callFrame']; u = cf['url'].split('/')[-1]
    return f"{cf['functionName'] or '(anon)'} {u}:{cf['lineNumber']+1}"
self_t = collections.Counter(); incl = collections.Counter()
for s, dt in zip(prof['samples'], prof['timeDeltas']):
    n = nodes[s]; self_t[key(n)] += dt
    seen = set(); i = s
    while i in nodes:
        k = key(nodes[i])
        if k not in seen: incl[k] += dt; seen.add(k)
        i = parent.get(i)
total = sum(prof['timeDeltas']) / 1000
idle = sum(v for k, v in self_t.items() if k.startswith('(idle)') or k.startswith('(program)')) / 1000
frames = fr['frames']; n = len(frames)
print(f"wall {total:.0f} ms, frames {n}, idle+program {idle:.0f} ms, script/frame {(total - idle) / n:.1f} ms")
print("frame ms: avg %.1f worst %.1f" % (sum(frames)/n, max(frames)))
print("\nTop self time:")
for k, v in self_t.most_common(int(sys.argv[2]) if len(sys.argv) > 2 else 25): print(f"{v/1000:8.1f} ms  {v/1000/n:6.2f} ms/frame  {k}")
if len(sys.argv) > 3:
    print("\nInclusive matching:")
    for k, v in incl.most_common(400):
        if any(p in k for p in sys.argv[3].split(',')): print(f"{v/1000:8.1f} ms  {v/1000/n:6.2f} ms/frame  {k}")
