"""Découpage hypothétique en 80 circonscriptions (projet de loi 39), version d'un seul tenant.

1. Région de chaque section de vote : annexe I, par sa municipalité et sa MRC (m80/regions39.py → m80/mun_region.csv).
   Les circonscriptions sont tracées région par région : aucune ne franchit une limite de région.
2. Nombre de circonscriptions par région : art. 14.2, électeurs des sections de vote 2026 (le même compte sert partout).
3. Graphe de voisinage des sections de vote (frontières communes sur la terre ferme : m80/adj_terre.json).
4. Diagramme de puissance équilibré (voir partition()) : des circonscriptions compactes, d'un seul tenant, aux formes
   simples (demande de l'utilisateur, 3 novembre 2026 ; l'ancienne croissance section par section donnait des dentelles).
5. Continuité réparée sur le graphe, puis équilibrage par transferts de sections de bordure qui abîment le moins la
   compacité, seulement si la circonscription qui cède reste d'un seul morceau.
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

S, SANS_XY = {}, []
for r in csv.DictReader(open('m80/sections_pts.csv', encoding='utf-8')):
    p = dict(prov=Q[norm(r['NM_CEP'])], reg=REG[r['CODE_MUNCP'].zfill(5)], mun=r['CODE_MUNCP'].zfill(5), munn=r['NM_MUNCP'],
             w=int(r['ELEC_2026'] or 0))
    # une section sans géométrie (434 électeurs à Pointe-aux-Trembles) : comptée, puis rattachée après le découpage
    if not r['X']: SANS_XY.append(p); continue
    S[int(r['IDX'])] = dict(p, x=float(r['X']) / 1000, y=float(r['Y']) / 1000)
# voisinage sur la terre ferme (sections découpées par le masque des terres) : deux sections qui ne se touchent que par
# l'eau (le fleuve, le Saguenay, un lac) ne sont pas voisines, et une circonscription ne s'étend pas d'une rive à l'autre ;
# les îles sont rattachées à la section la plus proche (connect)
ADJ = {int(k): [j for j in v if j in S] for k, v in json.load(open('m80/adj_terre.json')).items() if int(k) in S}
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
    """Découpe une région en k circonscriptions compactes : diagramme de puissance équilibré (chaque section va au centre
    j qui minimise distance² − λj ; les λj montent ou descendent jusqu'à ce que les circonscriptions aient le même nombre
    d'électeurs, et les centres suivent le centre de gravité). Les cellules sont presque convexes : des blocs d'un seul
    tenant aux formes simples (demande de l'utilisateur, 3 novembre 2026, au lieu des formes en dentelle de la croissance
    section par section). Ensuite : continuité réparée sur le graphe des sections, puis petits transferts de bordure qui
    abîment le moins la compacité."""
    if k == 1: return {n: 0 for n in nodes}, 0.0
    import numpy as np
    adj = connect(nodes)
    nodes = list(nodes); ix = {n: i for i, n in enumerate(nodes)}
    xy = np.array([[S[n]['x'], S[n]['y']] for n in nodes]); w = np.array([S[n]['w'] for n in nodes], float)
    wc = w + 0.01                                   # poids des centres (les territoires inhabités pèsent presque rien)
    T = w.sum() / k
    # centres de départ : k-moyennes pondérées, partant de points répartis le long de l'axe x (déterministe)
    order = np.lexsort((xy[:, 1], xy[:, 0]))
    cs = np.array([xy[order[int((i + .5) * len(nodes) / k)]] for i in range(k)])
    for _ in range(40):
        lab = ((xy[:, None, :] - cs[None]) ** 2).sum(2).argmin(1)
        for j in range(k):
            m = lab == j
            if m.any(): cs[j] = (xy[m] * wc[m, None]).sum(0) / wc[m].sum()
    # diagramme de puissance équilibré
    lam = np.zeros(k)
    r2 = ((xy - (xy * wc[:, None]).sum(0) / wc.sum()) ** 2 * wc[:, None]).sum() / wc.sum() / k   # échelle des distances²
    best = None
    for it in range(1500):
        d2 = ((xy[:, None, :] - cs[None]) ** 2).sum(2) - lam[None]
        lab = d2.argmin(1)
        load = np.bincount(lab, weights=w, minlength=k)
        dev = np.abs(load - T).max() / T
        if best is None or dev < best[0]: best = (dev, lab.copy())
        if dev < 0.01: break
        step = 0.5 * (0.997 ** it) + 0.02
        lam += step * r2 * (T - load) / T
        if it % 5 == 0:                              # les centres suivent leurs électeurs (cellules bien rondes)
            for j in range(k):
                m = lab == j
                if m.any(): cs[j] = 0.7 * cs[j] + 0.3 * (xy[m] * wc[m, None]).sum(0) / wc[m].sum()
    lab = best[1]
    A = {n: int(lab[ix[n]]) for n in nodes}
    members = defaultdict(set)
    for n, j in A.items(): members[j].add(n)

    def comps_of(j):
        return components(list(members[j]), {n: [m for m in adj[n] if A.get(m) == j] for n in members[j]})

    # continuité : chaque morceau détaché (autre que le plus peuplé) va à la circonscription voisine qui le touche le plus
    for _ in range(50):
        changed = False
        for j in range(k):
            cc = comps_of(j)
            if len(cc) < 2: continue
            cc.sort(key=lambda c: (sum(S[n]['w'] for n in c), len(c)), reverse=True)
            for c in cc[1:]:
                touch = Counter(A[m] for n in c for m in adj[n] if A[m] != j)
                if not touch: continue
                b = touch.most_common(1)[0][0]
                for n in c: A[n] = b; members[j].discard(n); members[b].add(n)
                changed = True
        if not changed: break

    load = [sum(S[n]['w'] for n in members[j]) for j in range(k)]
    cen = []
    for j in range(k):
        m = [n for n in members[j]]
        tw = sum(S[n]['w'] + 0.01 for n in m)
        cen.append([sum(S[n]['x'] * (S[n]['w'] + 0.01) for n in m) / tw, sum(S[n]['y'] * (S[n]['w'] + 0.01) for n in m) / tw])

    def still_connected(j, n):
        rest = members[j] - {n}
        if not rest: return False
        start = next(iter(rest)); seen = {start}; q = deque([start])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if v in rest and v not in seen: seen.add(v); q.append(v)
        return len(seen) == len(rest)

    d2c = lambda n, j: (S[n]['x'] - cen[j][0]) ** 2 + (S[n]['y'] - cen[j][1]) ** 2
    # équilibrage fin : la section de bordure qui abîme le moins la compacité (moment d'inertie) passe à la voisine moins peuplée
    exhausted = set()
    for it in range(20000):
        dev = [(load[j] - T) / T for j in range(k)]
        if max(abs(d) for d in dev) <= TOL: break
        pairs = {(A[u], A[v]) for u in A for v in adj[u] if A[v] != A[u]}
        cand = sorted(((load[a] - load[b], a, b) for a, b in pairs if load[a] > load[b] and (a, b) not in exhausted
                       and (abs(dev[a]) > TOL or abs(dev[b]) > TOL)), reverse=True)
        if not cand:
            if exhausted: exhausted.clear(); continue
            break
        _, a, b = cand[0]
        opts = sorted(((S[n]['w'] + 0.01) * (d2c(n, b) - d2c(n, a)), n) for n in members[a]
                      if any(A[m] == b for m in adj[n]) and load[a] - S[n]['w'] >= load[b] + S[n]['w'] - 1)
        moved = False
        for _, n in opts[:400]:
            if still_connected(a, n):
                A[n] = b; members[a].discard(n); members[b].add(n)
                load[a] -= S[n]['w']; load[b] += S[n]['w']; moved = True; break
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
