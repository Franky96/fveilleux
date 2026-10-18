"""Votes valides par parti dans les 127 circonscriptions, élection générale du 5 octobre 2026 → votes_circ_2026.csv

Source : résultats officiels d'Élections Québec (données ouvertes, archive gen2026-10-05/resultats.json, téléchargée
dans brut/ par reconstruire.sh). Sert à la simulation loi 39 : votes régionaux et nationaux = votes valides réels
(et non parts × électeurs inscrits). Les résultats par section de vote (resultats-bureau-vote.zip) n'étaient pas encore
publiés pour 2026 le 18 octobre 2026 : le vote d'une circonscription est donc supposé uniforme entre ses sections.
Usage : /usr/bin/python3 -I votes_circ.py   (dans outils/)
"""
import csv, json, re

PARTIS = ["PQ", "PLQ", "CAQ", "PCQ", "QS"]


def parti(abrev):  # mêmes règles que parti() dans election.py (« PCQ/CPQ » = Parti canadien → autres)
    a = re.sub("[^A-Z]", "", str(abrev or "").upper())
    if a == "PQ": return "PQ"
    if a.startswith("PLQ"): return "PLQ"
    if "CAQ" in a: return "CAQ"
    if a == "QS": return "QS"
    if a.startswith("PCOQ") or re.match("^PCQE", a): return "PCQ"
    return "AUT"


d = json.load(open("brut/resultats-2026.json", encoding="utf-8"))
assert d["statistiques"]["isResultatsFinaux"]
lignes = []
for c in sorted(d["circonscriptions"], key=lambda c: c["numeroCirconscription"]):
    v = dict.fromkeys(PARTIS + ["AUT"], 0)
    for k in c["candidats"]: v[parti(k["abreviationPartiPolitique"])] += k["nbVoteTotal"]
    assert sum(v.values()) == c["nbVoteValide"] and c["isResultatsFinaux"], c["nomCirconscription"]
    lignes.append({"CO_CEP": c["numeroCirconscription"], "NM_CEP": c["nomCirconscription"], "INSCRITS": c["nbElecteurInscrit"],
                   "VALIDES": c["nbVoteValide"], **v})
with open("votes_circ_2026.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(lignes[0])); w.writeheader(); w.writerows(lignes)
t = {p: sum(l[p] for l in lignes) for p in PARTIS + ["AUT"]}; V = sum(l["VALIDES"] for l in lignes)
print(len(lignes), "circonscriptions ·", V, "votes valides ·", {p: round(100 * n / V, 2) for p, n in t.items()})
