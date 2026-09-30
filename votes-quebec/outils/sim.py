"""Simulation: projection Qc125 (28 sept. 2026) sous le mode de scrutin du projet de loi 39 (2019)."""
import json, math
from collections import Counter, defaultdict

PARTIES = ["PQ", "PLQ", "CAQ", "PCQ", "QS"]

# Population 2020 (Wikipédia), approximation du nombre d'électeurs. Limites de 2019 (loi 39, annexe I).
POP = {
    "Bas-Saint-Laurent": 197736, "Saguenay–Lac-Saint-Jean": 277897, "Capitale-Nationale": 751366,
    "Mauricie": 270016, "Estrie": 329747, "Montréal": 2050053, "Outaouais": 396000,
    "Abitibi-Témiscamingue": 148216, "Côte-Nord": 91121, "Nord-du-Québec": 46202,
    "Gaspésie–Îles-de-la-Madeleine": 90634, "Chaudière-Appalaches": 428924, "Laval": 439754,
    "Lanaudière": 515682, "Laurentides": 621736, "Montérégie": 1581697, "Centre-du-Québec": 249216,
}

REGION_OF = {}
def put(region, names):
    for n in names.split("|"):
        REGION_OF[n] = region

put("Bas-Saint-Laurent", "Matane-Matapédia-Mitis|Rimouski|Rivière-du-Loup–Témiscouata–Les Basques")
put("Saguenay–Lac-Saint-Jean", "Chicoutimi|Dubuc|Jonquière|Lac-Saint-Jean|Roberval")
put("Capitale-Nationale", "Charlesbourg|Charlevoix–Côte-de-Beaupré|Chauveau|Jean-Lesage|Jean-Talon|La Peltrie|"
    "Louis-Hébert|Montmorency|Portneuf|Taschereau|Vanier-Les Rivières")
put("Mauricie", "Champlain|Laviolette–Saint-Maurice|Maskinongé|Trois-Rivières")
put("Estrie", "Mégantic|Orford|Richmond|Saint-François|Sherbrooke")
put("Montréal", "Acadie|Anjou–Louis-Riel|Bourassa-Sauvé|Camille-Laurin|D’Arcy-McGee|Gouin|Hochelaga-Maisonneuve|"
    "Jacques-Cartier|Jeanne-Mance–Viger|LaFontaine|Laurier-Dorion|Marguerite-Bourgeoys|Marquette|Maurice-Richard|"
    "Mercier|Mont-Royal–Outremont|Nelligan|Notre-Dame-de-Grâce|Pointe-aux-Trembles|Robert-Baldwin|Rosemont|"
    "Saint-Henri–Sainte-Anne|Saint-Laurent|Sainte-Marie–Saint-Jacques|Verdun|Viau|Westmount–Saint-Louis")
put("Outaouais", "Chapleau|Gatineau|Hull|Papineau|Pontiac")
put("Abitibi-Témiscamingue", "Abitibi-Est|Abitibi-Ouest|Rouyn-Noranda–Témiscamingue")
put("Côte-Nord", "Duplessis|René-Lévesque")
put("Nord-du-Québec", "Ungava")
put("Gaspésie–Îles-de-la-Madeleine", "Bonaventure|Gaspé|Îles-de-la-Madeleine")
put("Chaudière-Appalaches", "Beauce-Nord|Beauce-Sud|Bellechasse|Chutes-de-la-Chaudière|Côte-du-Sud|Lévis|"
    "Lotbinière-Frontenac")
put("Laval", "Chomedey|Fabre|Laval-des-Rapides|Mille-Îles|Sainte-Rose|Vimont-Auteuil")
put("Lanaudière", "Berthier|Joliette|L’Assomption|Les Plaines|Masson|Repentigny|Rousseau|Terrebonne")
put("Laurentides", "Argenteuil|Bertrand|Blainville|Deux-Montagnes|Groulx|Labelle|Mirabel|Prévost|Saint-Jérôme|"
    "Bellefeuille")
# Granby et Brome-Missisquoi : Montérégie selon les limites de 2019 (passées en Estrie en 2021).
put("Montérégie", "Beauharnois|Borduas|Brome-Missisquoi|Chambly|Châteauguay|Granby|Huntingdon|Iberville|"
    "La Pinière|La Prairie|Marie-Victorin|Montarville|Richelieu|Saint-Hyacinthe|Saint-Jean|Sanguinet|Soulanges|"
    "Taillon|Vachon|Vaudreuil|Verchères|Pierre-Laporte|Daniel-Johnson")
put("Centre-du-Québec", "Arthabaska-L’Érable|Drummond–Bois-Francs|Nicolet-Bécancour|Marie-Lacoste-Gérin-Lajoie")


def highest_quotients(weights, n):
    """Diviseurs 1, 2, 3... ; retient les n plus grands quotients (art. 14.2 3° et 14.3 2°)."""
    q = sorted(((w / d, r) for r, w in weights.items() for d in range(1, n + 1)), reverse=True)[:n]
    return Counter(r for _, r in q)


def largest_remainder(counts, total):
    s = sum(counts.values())
    if s == 0:
        return Counter()
    exact = {p: c * total / s for p, c in counts.items()}
    out = Counter({p: math.floor(v) for p, v in exact.items()})
    for p in sorted(exact, key=lambda p: exact[p] - out[p], reverse=True)[: total - sum(out.values())]:
        out[p] += 1
    return out


proj = json.load(open("proj.json"))
missing = set(proj) - set(REGION_OF)
assert not missing, missing

# 1. Sièges par région
extra_d = highest_quotients(POP, 62)
dist_seats = {r: 1 + (r == "Gaspésie–Îles-de-la-Madeleine") + extra_d[r] for r in POP}
extra_l = highest_quotients(POP, 29)
list_seats = {r: (r != "Nord-du-Québec") + extra_l[r] for r in POP}
assert sum(dist_seats.values()) == 80 and sum(list_seats.values()) == 45

# 2. Votes par région (chaque circonscription pondérée également) et gagnants actuels
votes = defaultdict(Counter)
winners = defaultdict(Counter)
fptp = Counter()
for riding, shares in proj.items():
    r = REGION_OF[riding]
    for p in PARTIES:
        votes[r][p] += shares.get(p, 0)
    w = max(shares, key=shares.get)
    winners[r][w] += 1
    fptp[w] += 1

nat = Counter()
for r in votes:
    nat.update(votes[r])
nat_share = {p: nat[p] / sum(nat.values()) for p in PARTIES}
eligible = [p for p in PARTIES if nat_share[p] >= 0.10]  # art. 379.2

# 3. Sièges de circonscription (80) : gagnants projetés ramenés à l'échelle du nombre de sièges de la région
# 4. Sièges de région (45) : art. 379.1, diviseur = 1 + ceil(élus_circ / 2), +1 par siège de région obtenu
result = {}
tot_d, tot_l = Counter(), Counter()
for r in POP:
    d = largest_remainder(winners[r], dist_seats[r])
    lst = Counter()
    for _ in range(list_seats[r]):
        best = max(eligible, key=lambda p: votes[r][p] / (1 + math.ceil(d[p] / 2) + lst[p]))
        lst[best] += 1
    result[r] = {"pop": POP[r], "ridings_now": sum(winners[r].values()), "dist_seats": dist_seats[r],
                 "list_seats": list_seats[r],
                 "share": {p: round(100 * votes[r][p] / sum(votes[r].values()), 1) for p in PARTIES},
                 "fptp_now": dict(winners[r]), "dist": dict(d), "list": dict(lst)}
    tot_d.update(d)
    tot_l.update(lst)

summary = {
    "nat_share": {p: round(100 * nat_share[p], 1) for p in PARTIES},
    "eligible": eligible,
    "fptp_127": dict(fptp),
    "loi39_dist": dict(tot_d), "loi39_list": dict(tot_l),
    "loi39_total": {p: tot_d[p] + tot_l[p] for p in PARTIES},
    "regions": result,
}
json.dump(summary, open("result.json", "w"), ensure_ascii=False, indent=1)

print("Vote (moyenne des circ.):", summary["nat_share"], "admissibles:", eligible)
print(f"{'Parti':6}{'SMU 127':>9}{'Circ.80':>9}{'Rég.45':>8}{'Total125':>10}{'% sièges':>10}")
for p in PARTIES:
    t = tot_d[p] + tot_l[p]
    print(f"{p:6}{fptp[p]:>9}{tot_d[p]:>9}{tot_l[p]:>8}{t:>10}{100*t/125:>9.1f}%")
print()
for r, v in result.items():
    print(f"{r:32} circ {v['dist_seats']:2} rég {v['list_seats']:2} | circ {v['dist']} | rég {v['list']}")
