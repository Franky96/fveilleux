"""Découpage hypothétique en 80 circonscriptions (projet de loi 39), version d'un seul tenant.

1. Région de chaque section de vote : annexe I, par sa municipalité et sa MRC (m80/regions39.py → m80/mun_region.csv).
   Les circonscriptions sont tracées région par région : aucune ne franchit une limite de région.
2. Nombre de circonscriptions par région : art. 14.2, électeurs des sections de vote 2026 (le même compte sert partout).
3. Graphe de voisinage des sections de vote (frontières communes).
4. Croissance : chaque circonscription part d'un germe et n'ajoute que des sections voisines ;
   la plus petite grandit en premier. Coût = distance au centre + pénalité si on franchit une limite
   de municipalité ou de circonscription actuelle.
5. Équilibrage : transferts de sections de bordure seulement si la circonscription qui cède
   reste d'un seul morceau.
Îles-de-la-Madeleine (annexe II : municipalités des Îles-de-la-Madeleine et de Grosse-Île) et Ungava (annexe III :
toute la région du Nord-du-Québec) sont fixées par la loi.
"""
import csv, json, re, math, importlib.util
from collections import defaultdict, Counter, deque

spec = importlib.util.spec_from_file_location("sim", "sim.py"); sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)
norm = lambda s: re.sub(r'[^a-z]', '', s.lower().replace('’', '').translate(str.maketrans('éèêëàâîïôöûùüç', 'eeeeaaiioouuuc')))
Q = {norm(k): k for k in json.load(open('proj.json', encoding='utf-8'))}      # noms des 127 circonscriptions (Qc125)
REG = {r['CODE_MUNCP']: r['REGION'] for r in csv.DictReader(open('m80/mun_region.csv', encoding='utf-8'))}
GASP, NORD = sim.GASP, sim.NORD
ILES = {'01023', '01042'}       # annexe II : Les Îles-de-la-Madeleine et Grosse-Île
TOL = 0.08          # écart visé par rapport à la moyenne régionale (la Loi électorale permet ±25 %)
PEN_MUN, PEN_RID = 0.45, 0.30

S, SANS_XY = {}, []
for r in csv.DictReader(open('m80/sections_pts.csv', encoding='utf-8')):
    p = dict(prov=Q[norm(r['NM_CEP'])], reg=REG[r['CODE_MUNCP'].zfill(5)], mun=r['CODE_MUNCP'].zfill(5), munn=r['NM_MUNCP'],
             w=int(r['ELEC_2026'] or 0))
    # une section sans géométrie (434 électeurs à Pointe-aux-Trembles) : comptée, puis rattachée après le découpage
    if not r['X']: SANS_XY.append(p); continue
    S[int(r['IDX'])] = dict(p, x=float(r['X']) / 1000, y=float(r['Y']) / 1000)
ADJ = {int(k): [j for j in v if j in S] for k, v in json.load(open('m80/adj.json')).items() if int(k) in S}
for i in S: ADJ.setdefault(i, [])

# électeurs par région et par circonscription actuelle × région : toutes les sections, avec ou sans géométrie
elec_reg, rid_reg = Counter(), defaultdict(Counter)
for p in list(S.values()) + SANS_XY: elec_reg[p['reg']] += p['w']; rid_reg[p['prov']][p['reg']] += p['w']
DIST, LIST = sim.sieges(elec_reg)
assert DIST[NORD] == 1, DIST[NORD]          # Ungava = tout le Nord-du-Québec (annexe III)
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
        # toutes les sections de bordure, de la moins coûteuse à la plus coûteuse (les 12 premières seulement laissaient
        # Labelle bloquée à −44 % dans les Laurentides : ses voisines les moins coûteuses coupaient toutes la cédante en deux)
        for _, n in opts:
            if still_connected(a, n):
                move(n, a, b); moved = True; break
        if moved: exhausted.clear()
        else: exhausted.add((a, b))
    return A, max(abs(load[j] - T) / T for j in range(k))


assign, districts = {}, {}
did = 0
for reg in sim.REGIONS:
    nodes = [n for n, p in S.items() if p['reg'] == reg]
    if reg == NORD: groups, free = [nodes], []
    elif reg == GASP: groups, free = [[n for n in nodes if S[n]['mun'] in ILES]], [n for n in nodes if S[n]['mun'] not in ILES]
    else: groups, free = [], nodes
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
        districts[did] = dict(reg=reg, electors=sum(comp.values()), comp=comp, mun=mun)

# sections sans géométrie : dans la circonscription qui a le plus d'électeurs de la même municipalité et circonscription actuelle
for p in SANS_XY:
    d = max(districts.values(), key=lambda d: sum(S[n]['w'] for n, j in assign.items() if districts[j] is d
                                                  and S[n]['mun'] == p['mun'] and S[n]['prov'] == p['prov']))
    assert d['reg'] == p['reg']
    d['comp'][p['prov']] += p['w']; d['mun'][p['munn']] += p['w']; d['electors'] += p['w']
for d in districts.values(): d['comp'], d['mun'] = dict(d['comp'].most_common()), dict(d['mun'].most_common(4))
assert sum(d['electors'] for d in districts.values()) == sum(elec_reg.values())

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
json.dump({'districts': districts, 'DIST': DIST, 'LIST': LIST, 'elec_reg': dict(elec_reg),
           'rid_reg': {c: dict(v.most_common()) for c, v in sorted(rid_reg.items())}},
          open('m80/districts.json', 'w'), ensure_ascii=False, indent=1)
e = [d['electors'] for d in districts.values()]
print(f"\n{len(districts)} circonscriptions · électeurs min {min(e)} · max {max(e)}")
