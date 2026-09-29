"""Découpage hypothétique en 80 circonscriptions (projet de loi 39), version d'un seul tenant.

1. Nombre de circonscriptions par région : art. 14.2, électeurs inscrits 2026.
2. Graphe de voisinage des sections de vote (frontières communes).
3. Croissance : chaque circonscription part d'un germe et n'ajoute que des sections voisines ;
   la plus petite grandit en premier. Coût = distance au centre + pénalité si on franchit une limite
   de municipalité ou de circonscription actuelle.
4. Équilibrage : transferts de sections de bordure seulement si la circonscription qui cède
   reste d'un seul morceau.
"""
import csv, json, re, math, importlib.util, io, contextlib
from collections import defaultdict, Counter, deque

spec = importlib.util.spec_from_file_location("sim", "sim.py"); sim = importlib.util.module_from_spec(spec)
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(sim)
norm = lambda s: re.sub(r'[^a-z]', '', s.lower().replace('’', '').translate(str.maketrans('éèêëàâîïôöûùüç', 'eeeeaaiioouuuc')))
Q = {norm(k): k for k in sim.REGION_OF}
GASP, NORD = "Gaspésie–Îles-de-la-Madeleine", "Nord-du-Québec"
FIXED = {"Îles-de-la-Madeleine", "Ungava"}
TOL = 0.08          # écart visé par rapport à la moyenne régionale (la Loi électorale permet ±25 %)
PEN_MUN, PEN_RID = 0.45, 0.30

S = {}
for r in csv.DictReader(open('m80/sections_pts.csv', encoding='utf-8')):
    if not r['X']: continue
    prov = Q[norm(r['NM_CEP'])]
    S[int(r['IDX'])] = dict(prov=prov, reg=sim.REGION_OF[prov], mun=r['CODE_MUNCP'], munn=r['NM_MUNCP'],
                            w=int(r['ELEC_2026'] or 0), x=float(r['X']) / 1000, y=float(r['Y']) / 1000)
ADJ = {int(k): [j for j in v if j in S] for k, v in json.load(open('m80/adj.json')).items() if int(k) in S}
for i in S: ADJ.setdefault(i, [])

elec_reg = Counter()
for p in S.values(): elec_reg[p['reg']] += p['w']
extra = sim.highest_quotients(elec_reg, 62)
DIST = {r: 1 + (r == GASP) + extra[r] for r in sim.POP}
extra_l = sim.highest_quotients(elec_reg, 29)
LIST = {r: (r != NORD) + extra_l[r] for r in sim.POP}
dist = lambda a, b: math.hypot(S[a]['x'] - b[0], S[a]['y'] - b[1])


def components(nodes, adj):
    seen, comps = set(), []
    for n in nodes:
        if n in seen: continue
        q, c = deque([n]), []
        seen.add(n)
        while q:
            u = q.popleft(); c.append(u)
            for v in adj[u]:
                if v not in seen: seen.add(v); q.append(v)
        comps.append(c)
    return comps


def connect(nodes):
    """Graphe de la région, avec des liens ajoutés entre morceaux isolés (îles) et le reste."""
    ns = set(nodes)
    adj = {n: [m for m in ADJ[n] if m in ns] for n in nodes}
    comps = sorted(components(nodes, adj), key=len, reverse=True)
    main = set(comps[0])
    for c in comps[1:]:
        best = min(((math.hypot(S[a]['x'] - S[b]['x'], S[a]['y'] - S[b]['y']), a, b)
                    for a in c for b in main), key=lambda t: t[0])
        _, a, b = best
        adj[a].append(b); adj[b].append(a)
        main |= set(c)
    return adj


def partition(nodes, k):
    if k == 1: return {n: 0 for n in nodes}, 0.0
    adj = connect(nodes)
    W = sum(S[n]['w'] for n in nodes); T = W / k
    xs = [S[n]['x'] for n in nodes]; ys = [S[n]['y'] for n in nodes]
    r0 = math.sqrt(max(1.0, (max(xs) - min(xs)) * (max(ys) - min(ys))) / k)
    # Germes : k-moyennes pondérées (déterministe : points de départ répartis le long de l'axe principal)
    heavy = sorted(nodes, key=lambda n: (S[n]['x'], S[n]['y']))
    cs = [(S[heavy[int((i + .5) * len(heavy) / k)]]['x'], S[heavy[int((i + .5) * len(heavy) / k)]]['y']) for i in range(k)]
    for _ in range(40):
        acc = [[0, 0, 0] for _ in range(k)]
        for n in nodes:
            j = min(range(k), key=lambda j: dist(n, cs[j]))
            w = S[n]['w'] + 0.01
            acc[j][0] += S[n]['x'] * w; acc[j][1] += S[n]['y'] * w; acc[j][2] += w
        cs = [(a[0] / a[2], a[1] / a[2]) if a[2] else cs[j] for j, a in enumerate(acc)]
    seeds, used = [], set()
    for c in cs:
        s = min((n for n in nodes if n not in used and S[n]['w'] > 0), key=lambda n: dist(n, c))
        seeds.append(s); used.add(s)

    A = {}
    load = [0] * k; sx = [0.0] * k; sy = [0.0] * k; sw = [1e-9] * k
    muns = [Counter() for _ in range(k)]; rids = [Counter() for _ in range(k)]
    front = [set() for _ in range(k)]

    def add(n, j):
        A[n] = j; w = S[n]['w'] + 0.01
        load[j] += S[n]['w']; sx[j] += S[n]['x'] * w; sy[j] += S[n]['y'] * w; sw[j] += w
        muns[j][S[n]['mun']] += 1; rids[j][S[n]['prov']] += 1
        for f in front: f.discard(n)
        for m in adj[n]:
            if m not in A: front[j].add(m)

    def cost(n, j):
        c = dist(n, (sx[j] / sw[j], sy[j] / sw[j])) / r0
        if S[n]['mun'] not in muns[j]: c += PEN_MUN
        if S[n]['prov'] not in rids[j]: c += PEN_RID
        return c

    for j, s in enumerate(seeds): add(s, j)
    while len(A) < len(nodes):
        cand = [j for j in range(k) if front[j]]
        if not cand: break
        j = min(cand, key=lambda j: load[j])
        n = min(front[j], key=lambda n: cost(n, j))
        add(n, j)

    # Équilibrage par transferts de bordure
    members = defaultdict(set)
    for n, j in A.items(): members[j].add(n)

    def still_connected(j, n):
        rest = members[j] - {n}
        if not rest: return False
        start = next(iter(rest)); seen = {start}; q = deque([start])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if v in rest and v not in seen: seen.add(v); q.append(v)
        return len(seen) == len(rest)

    def centroid(j): return (sx[j] / sw[j], sy[j] / sw[j])

    def move(n, a, b):
        w = S[n]['w'] + 0.01
        members[a].discard(n); members[b].add(n); A[n] = b
        load[a] -= S[n]['w']; load[b] += S[n]['w']
        sx[a] -= S[n]['x'] * w; sy[a] -= S[n]['y'] * w; sw[a] -= w
        sx[b] += S[n]['x'] * w; sy[b] += S[n]['y'] * w; sw[b] += w
        muns[a][S[n]['mun']] -= 1; rids[a][S[n]['prov']] -= 1
        if muns[a][S[n]['mun']] <= 0: del muns[a][S[n]['mun']]
        if rids[a][S[n]['prov']] <= 0: del rids[a][S[n]['prov']]
        muns[b][S[n]['mun']] += 1; rids[b][S[n]['prov']] += 1

    def district_pairs():
        pairs = set()
        for u, j in A.items():
            for v in adj[u]:
                if A[v] != j: pairs.add((j, A[v]))
        return pairs

    pairs = district_pairs(); exhausted = set()
    for it in range(60000):
        dev = [(load[j] - T) / T for j in range(k)]
        if max(abs(d) for d in dev) <= TOL: break
        if it % 40 == 0: pairs = district_pairs()
        cand = [(load[a] - load[b], a, b) for a, b in pairs if load[a] > load[b] and (a, b) not in exhausted
                and (abs(dev[a]) > TOL or abs(dev[b]) > TOL)]
        if not cand:
            if exhausted: exhausted.clear(); pairs = district_pairs(); continue
            break
        _, a, b = max(cand)
        opts = []
        for n in members[a]:
            if any(A[m] == b for m in adj[n]) and load[a] - S[n]['w'] >= load[b] + S[n]['w'] - 1:
                opts.append((cost(n, b) - cost(n, a), n))
        opts.sort()
        moved = False
        for _, n in opts[:12]:
            if still_connected(a, n):
                move(n, a, b); moved = True; break
        if moved: exhausted.clear()
        else: exhausted.add((a, b))
    return A, max(abs(load[j] - T) / T for j in range(k))


assign, districts = {}, {}
did = 0
for reg in sim.POP:
    nodes = [n for n, p in S.items() if p['reg'] == reg]
    fixed = [n for n in nodes if S[n]['prov'] in FIXED]
    free = [n for n in nodes if S[n]['prov'] not in FIXED]
    groups = [[n for n in fixed if S[n]['prov'] == fp] for fp in sorted({S[n]['prov'] for n in fixed})]
    k = DIST[reg] - len(groups)
    if k > 0:
        A, dev = partition(free, k)
        g = defaultdict(list)
        for n, j in A.items(): g[j].append(n)
        groups += [g[j] for j in sorted(g)]
        print(f"{reg:32} {len(nodes):5} sections → {DIST[reg]:2} circ. (écart max {dev*100:4.1f} %)", flush=True)
    for G in groups:
        did += 1
        comp = Counter(); mun = Counter()
        for n in G:
            comp[S[n]['prov']] += S[n]['w']; mun[S[n]['munn']] += S[n]['w']; assign[n] = did
        districts[did] = dict(reg=reg, electors=sum(comp.values()), comp=dict(comp.most_common()), mun=dict(mun.most_common(4)))

used = Counter()
for d in districts.values():
    top = list(d['comp'].items()); tot = d['electors']
    d['name'] = top[0][0] if len(top) == 1 or top[0][1] / tot >= 0.6 else f"{top[0][0]} / {top[1][0]}"
    used[d['name']] += 1
for i, d in districts.items():
    if used[d['name']] > 1 and len(d['comp']) > 1:
        t = list(d['comp']); d['name'] = f"{t[0]} / {t[1]}"
names = Counter(d['name'] for d in districts.values())
for i, d in districts.items():
    if names[d['name']] > 1: d['name'] += f" ({i})"

with open('m80/assign.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['IDX', 'DID'])
    for k, v in assign.items(): w.writerow([k, v])
json.dump({'districts': districts, 'DIST': DIST, 'LIST': LIST, 'elec_reg': dict(elec_reg)},
          open('m80/districts.json', 'w'), ensure_ascii=False, indent=1)
e = [d['electors'] for d in districts.values()]
print(f"\n{len(districts)} circonscriptions · électeurs min {min(e)} · max {max(e)}")
