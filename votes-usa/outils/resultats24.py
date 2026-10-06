"""Votes États-Unis : résultat de l'élection de 2024 à la Chambre, district par district → ../resultats-2024.json

Source : Wikipédia anglais, « 2024 United States House of Representatives elections » (tableaux par État : candidats,
parti et pourcentage, d'après les résultats certifiés de chaque État). Fichier fixe.
Usage : /usr/bin/python3 resultats24.py   (dans le dossier outils/ ; la page brute est mise dans brut/)
"""
import json, os, re, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
URL = "https://en.wikipedia.org/w/index.php?title=2024_United_States_House_of_Representatives_elections&action=raw"
HDR = {"User-Agent": "fveilleuxBot/1.0 (https://fveilleux.com)"}
AB = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
      "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA",
      "WA", "WV", "WI", "WY"]

brut = os.path.join(ICI, "brut", "house2024.wiki")
if not os.path.exists(brut):
    open(brut, "wb").write(urllib.request.urlopen(urllib.request.Request(URL, headers=HDR), timeout=60).read())
s = open(brut, encoding="utf-8").read()
s = s[s.find("== Alabama =="):]                       # tableaux par État (pas les listes du début)
def parti(p):
    p = p.lower()
    return "D" if "democrat" in p or "dfl" in p else "R" if "republican" in p else "AUT"
res = {}
# chaque district : en-tête de ligne « ! … {{ushr|ST|N|X}} », puis les candidats « Nom (Parti) 54.6% » jusqu'au district suivant
tetes = list(re.finditer(r"\n!\s*(?:rowspan=\d+\s*\|\s*)?\{\{ushr\|([A-Z]{2})\|(AL|\d+)\|X\}\}", s))
for k, m in enumerate(tetes):
    st, n = m[1], m[2]
    if st not in AB: continue
    seg = s[m.end(): tetes[k + 1].start() if k + 1 < len(tetes) else len(s)]
    seg = seg[:seg.find("\n|}")] if "\n|}" in seg else seg
    cands = []
    vus = set()
    for ligne in re.findall(r"[^\n]*\([^()\n]+\)\s*[\d.]+%[^\n]*", seg):
        ligne = re.sub(r"\{\{(?!Aye\}\})[^{}]*\}\}", "", ligne)          # modèles (bande de parti…), sauf la coche du gagnant
        for c in re.finditer(r"(\{\{Aye\}\})?\s*(?:''')?\[{0,2}(?:[^\]|\n]*\|)?([^\]\[(\n]+?)\]{0,2}(?:''')?\s*\(([^()\n]+)\)\s*([\d.]+)%", ligne):
            nom = re.sub(r"\{\{[^}]*\}\}|'''", "", c[2]).strip(" *")
            if nom in vus: break                             # vote préférentiel (Alaska, Maine) : on garde le tour final, listé en premier
            vus.add(nom)
            cands.append({"nom": nom, "p": parti(c[3]), "v": float(c[4]), "elu": bool(c[1])})
    if not cands: continue
    cid = f"{st}-{0 if n == 'AL' else int(n)}"
    parts = {}
    for c in cands: parts[c["p"]] = round(parts.get(c["p"], 0) + c["v"], 1)
    gagnant = next((c for c in cands if c["elu"]), max(cands, key=lambda c: c["v"]))
    res[cid] = {"g": gagnant["p"], "elu": gagnant["nom"], "s": dict(sorted(parts.items(), key=lambda x: -x[1])),
                "c": [{k2: c[k2] for k2 in ("nom", "p", "v")} for c in sorted(cands, key=lambda c: -c["v"])[:3]]}
if len(res) != 435: raise SystemExit(f"{len(res)} districts lus (435 attendus) : resultats-2024.json inchangé.")
g = {}
for r in res.values(): g[r["g"]] = g.get(r["g"], 0) + 1
# vote populaire national (infobox)
pop = {}
for p, k in (("R", "1"), ("D", "2")):
    mp = re.search(r"\|\s*percentage" + k + r"\s*=\s*(?:''')?([\d.]+)", open(brut, encoding="utf-8").read())
    if mp: pop[p] = float(mp[1])
json.dump({"source": "Wikipédia, « 2024 United States House of Representatives elections » (résultats certifiés des États)",
           "date": "2024-11-05", "sieges": g, "national": pop, "circ": res},
          open(os.path.join(ICI, "..", "resultats-2024.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(res)} districts · sièges {g} · vote national {pop}")
