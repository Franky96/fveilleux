"""Règles communes de la simulation loi 39 (projet de loi n° 39, 2019) : les 17 régions et la formule des diviseurs.

Importé par m80/regions39.py, m80/district2.py et build_data80.py. La région de chaque section de vote vient de
l'annexe I (m80/regions39.py → m80/mun_region.csv) ; il n'y a plus de table circonscription → région ni de population.
"""
from collections import Counter

PARTIES = ["PQ", "PLQ", "CAQ", "PCQ", "QS"]

# codes 01–17 de la page = ordre des régions administratives (l'annexe I les numérote par ordre alphabétique)
REGIONS = ["Bas-Saint-Laurent", "Saguenay–Lac-Saint-Jean", "Capitale-Nationale", "Mauricie", "Estrie", "Montréal",
           "Outaouais", "Abitibi-Témiscamingue", "Côte-Nord", "Nord-du-Québec", "Gaspésie–Îles-de-la-Madeleine",
           "Chaudière-Appalaches", "Laval", "Lanaudière", "Laurentides", "Montérégie", "Centre-du-Québec"]
CODE = {n: f"{i+1:02d}" for i, n in enumerate(REGIONS)}
GASP, NORD = "Gaspésie–Îles-de-la-Madeleine", "Nord-du-Québec"


def highest_quotients(weights, n):
    """Diviseurs 1, 2, 3... ; retient les n plus grands quotients (art. 14.2 3° et 14.3 2°)."""
    q = sorted(((w / d, r) for r, w in weights.items() for d in range(1, n + 1)), reverse=True)[:n]
    return Counter(r for _, r in q)


def sieges(elec_reg):
    """Sièges de circonscription (art. 14.2) et de région (art. 14.3) de chaque région, d'après ses électeurs."""
    extra_d, extra_l = highest_quotients(elec_reg, 62), highest_quotients(elec_reg, 29)
    dist = {r: 1 + (r == GASP) + extra_d[r] for r in REGIONS}
    lst = {r: (r != NORD) + extra_l[r] for r in REGIONS}
    assert sum(dist.values()) == 80 and sum(lst.values()) == 45
    return dist, lst
