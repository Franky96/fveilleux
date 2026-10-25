"""Démo de la page « En direct » : résultats FICTIFS du référendum albertain, au format brut du relais (api/alberta.php).

Écrit en-direct/demo.json : les 10 pages de questions, chacune avec un tableau par circonscription, comme pourrait les
publier Élections Alberta (en-tête Option 1 / Option 2 pour la question 10, Yes / No pour les autres ; deux façons
d'écrire les sections dépouillées, pour éprouver l'analyse). Les chiffres sont inventés (tirage au hasard à graine fixe,
par grande région) : ils ne disent rien du vrai résultat. La page ne les montre qu'avec ?demo (compte admin),
et les ramène au pourcentage de sections demandé (?demo=40 → environ 40 % des sections dépouillées).

Usage : python3 demo.py
"""
import json, os, random

ICI = os.path.dirname(os.path.abspath(__file__))
GEO = os.path.join(ICI, "..", "circonscriptions.json")
SORTIE = os.path.join(ICI, "..", "demo.json")

rnd = random.Random(20261019)
eds = sorted(((f["properties"]["n"], f["properties"]["nom"]) for f in json.load(open(GEO, encoding="utf-8"))["features"]))
# base par grande région (Calgary 1–26, Edmonton 27–46, reste 47–87) : part fictive de l'option 2 / du oui
def region(n): return "cal" if n <= 26 else "edm" if n <= 46 else "reste"
SEP = {"cal": 0.21, "edm": 0.14, "reste": 0.36}
circ = {}
for n, nom in eds:
    r = region(n)
    inscrits = rnd.randint(28000, 41000)
    circ[n] = {"nom": nom, "inscrits": inscrits, "votants": round(inscrits * rnd.uniform(0.47, 0.64)),
               "sections": rnd.randint(70, 130), "sep": max(0.05, min(0.6, SEP[r] + rnd.gauss(0, 0.06)))}

fmt = lambda x: f"{x:,}"
pct = lambda a, t: f"{100 * a / t:.1f}%" if t else "0.0%"
pages = {}
for q in range(1, 11):
    rows, tot = [], {"a": 0, "b": 0, "rej": 0, "vot": 0, "ins": 0, "sec": 0}
    for n, c in circ.items():
        if q == 10: part_a = 1 - c["sep"]                                     # option 1 : rester au Canada
        elif q <= 5: part_a = min(0.9, 0.5 + 0.5 * c["sep"] + rnd.gauss(0.05, 0.04))
        else: part_a = min(0.85, 0.36 + 0.55 * c["sep"] + rnd.gauss(0.04, 0.05))
        blancs = 0.004 if q == 10 else rnd.uniform(0.02, 0.07)                 # bulletins laissés en blanc (refusés)
        valides = round(c["votants"] * (1 - blancs - 0.003))
        a = round(valides * part_a); b = valides - a; rej = c["votants"] - valides
        for k, v in (("a", a), ("b", b), ("rej", rej), ("vot", c["votants"]), ("ins", c["inscrits"]), ("sec", c["sections"])): tot[k] += v
        sect = [f"{c['sections']} of {c['sections']}"] if q == 10 else [str(c["sections"]), str(c["sections"])]
        rows.append([str(n), c["nom"].upper(), *sect, fmt(c["votants"]), fmt(a), fmt(b), fmt(rej), f"{100 * c['votants'] / c['inscrits']:.1f}"])
    va, vb = ("Option 1", "Option 2") if q == 10 else ("Yes", "No")
    sect_t = ["Voting Locations Reported"] if q == 10 else ["Voting Locations Reported", "Total Voting Locations"]
    tete = ["ED", "ED Name", *sect_t, "Number of Electors Who Voted", va, vb, "Rejected", "Voter Turnout (%)"]
    v = tot["a"] + tot["b"]
    sect_p = [f"{tot['sec']} of {tot['sec']}"] if q == 10 else [str(tot["sec"]), str(tot["sec"])]
    prov = ["Provincial Total Valid Vote Count Percentage", "Provincial Total Valid Vote Count Percentage", *sect_p, fmt(tot["vot"]),
            f"{fmt(tot['a'])} {pct(tot['a'], v)}", f"{fmt(tot['b'])} {pct(tot['b'], v)}", fmt(tot["rej"]), f"{100 * tot['vot'] / tot['ins']:.1f}"]
    pages[str(202600 + q)] = {"statut": 200, "titre": "Referendum Results | Elections Alberta (DÉMO FICTIVE)",
                             "texte": f"DÉMONSTRATION : résultats fictifs, inventés pour tester la page. 2026 Provincial Referendum Question {q} Unofficial Results",
                             "tables": [[tete, prov, *rows]]}
d = {"disponible": True, "demo": True, "maj": "2026-10-20T03:30:00+00:00", "source": "démo (chiffres fictifs)", "pages": pages}
json.dump(d, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(SORTIE, os.path.getsize(SORTIE), "octets")
