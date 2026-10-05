"""Photos des candidats (vue « En direct ») : assemble photos/<parti>.json (relevés sur les sites des partis)
en ../photos.json = { "PQ": { "<circonscription officielle>": "<url>" }, … }.
Les noms de circonscription des sites sont rapprochés des 127 noms officiels (data.json) par nom normalisé,
puis, à défaut, par le nom du candidat dans la liste officielle des candidatures d'Élections Québec.
Usage : /usr/bin/python3 photos.py   (dans outils/)"""
import json, os, re, unicodedata, urllib.request

def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    return re.sub(r"[^a-z]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))

PARTIS = {"pq": "PQ", "plq": "PLQ", "caq": "CAQ", "qs": "QS", "pcq": "PCQ"}
SIGLES = {"PQ": "PQ", "PLQ/QLP": "PLQ", "ÉCF-CAQ": "CAQ", "QS": "QS", "PCOQ": "PCQ"}
officiels = {norm(r["n"]): r["n"] for r in json.load(open("data.json", encoding="utf-8"))["ridings"]}

# liste officielle des candidatures : (parti, nom normalisé) → circonscription
req = urllib.request.Request("https://donnees.electionsquebec.qc.ca/production/provincial/candidatures/candidatures.json",
                             headers={"User-Agent": "fveilleux.com"})
cands = json.load(urllib.request.urlopen(req, timeout=30))
parNom = {}
for c in cands:
    p = SIGLES.get(c.get("abreviation_parti"))
    if p: parNom[(p, norm(f"{c['prenom_bulletin_vote']} {c['nom_bulletin_vote']}"))] = c["nom_circonscription"]

sortie, bilan = {}, []
for fichier, p in PARTIS.items():
    chemin = f"photos/{fichier}.json"
    if not os.path.exists(chemin): bilan.append(f"{p} : aucun fichier"); continue
    sortie[p], perdus = {}, []
    for e in json.load(open(chemin, encoding="utf-8")):
        if not str(e.get("photo", "")).startswith("https://"): continue
        circ = officiels.get(norm(e.get("circ", "")))
        if not circ and e.get("nom"): circ = parNom.get((p, norm(e["nom"])))
        if circ: sortie[p][circ] = e["photo"]
        else: perdus.append(e.get("circ") or e.get("nom"))
    bilan.append(f"{p} : {len(sortie[p])} photos" + (f", non rapprochées : {perdus[:6]}" if perdus else ""))
json.dump(sortie, open("../photos.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("\n".join(bilan))
