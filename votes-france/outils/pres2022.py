"""Présidentielle 2022, 1er tour, par circonscription législative (ministère de l'Intérieur, data.gouv.fr) → ../pres2022.json

Sert de carte de référence au mode « Présidentielle » de la page Votes France (mêmes 577 circonscriptions qu'en 2024).
Usage : /usr/bin/python3 pres2022.py   (dans le dossier outils/ ; le fichier brut est mis dans brut/)
"""
import csv, io, json, os, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
URL = "https://static.data.gouv.fr/resources/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour/20220414-152430/resultats-par-niveau-cirlg-t1-france-entiere.txt"
OUTREMER = {"971": "ZA", "972": "ZB", "973": "ZC", "974": "ZD", "975": "ZS", "976": "ZM", "977": "ZX", "986": "ZW", "987": "ZP", "988": "ZN"}
# candidat → (nom affiché, parti, couleur)
CAND = {"ARTHAUD": ("Nathalie Arthaud", "LO", "#7A1A1A"), "ROUSSEL": ("Fabien Roussel", "PCF", "#B5172B"),
        "MACRON": ("Emmanuel Macron", "Renaissance", "#F5A623"), "LASSALLE": ("Jean Lassalle", "Résistons", "#A0896B"),
        "LE PEN": ("Marine Le Pen", "RN", "#4656B0"), "ZEMMOUR": ("Éric Zemmour", "Reconquête", "#8C6B3E"),
        "MÉLENCHON": ("Jean-Luc Mélenchon", "LFI", "#C00D0D"), "HIDALGO": ("Anne Hidalgo", "PS", "#E8579A"),
        "JADOT": ("Yannick Jadot", "Écologistes", "#3E9B4F"), "PÉCRESSE": ("Valérie Pécresse", "LR", "#1B5FB0"),
        "POUTOU": ("Philippe Poutou", "NPA", "#8E1B1B"), "DUPONT-AIGNAN": ("Nicolas Dupont-Aignan", "DLF", "#5C7BA8")}

brut = os.path.join(ICI, "brut", "pres22.txt")
if not os.path.exists(brut):
    os.makedirs(os.path.dirname(brut), exist_ok=True)
    open(brut, "wb").write(urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=120).read())
lignes = list(csv.reader(io.StringIO(open(brut, encoding="latin-1").read()), delimiter=";"))
circ, voix_nat, exp_nat = {}, {}, 0
for r in lignes[1:]:
    if len(r) < 20: continue
    dep = OUTREMER.get(r[0], r[0].zfill(2) if r[0].isdigit() else r[0])
    cid = dep + f"{int(r[2]):02d}"
    exp = int(r[16]); exp_nat += exp
    parts = {}
    for k in range(19, len(r) - 6, 7):
        nom = r[k + 2].strip()
        if nom not in CAND: continue
        v = int(r[k + 4]); voix_nat[nom] = voix_nat.get(nom, 0) + v
        parts[CAND[nom][0]] = round(100 * v / max(1, exp), 2)
    circ[cid] = dict(sorted(parts.items(), key=lambda x: -x[1]))
if len(circ) != 577: raise SystemExit(f"{len(circ)} circonscriptions lues (577 attendues)")
national = {CAND[n][0]: round(100 * v / exp_nat, 2) for n, v in sorted(voix_nat.items(), key=lambda x: -x[1])}
json.dump({"titre": "Présidentielle 2022, 1er tour (10 avril 2022)", "candidats": {c[0]: {"parti": c[1], "c": c[2]} for c in CAND.values()},
           "national": national, "circ": circ},
          open(os.path.join(ICI, "..", "pres2022.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(circ)} circonscriptions · national {list(national.items())[:4]}")
