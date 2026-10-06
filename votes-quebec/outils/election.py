"""Résultat de l'élection générale du 5 octobre 2026 (Élections Québec) → ../election-2026.json

Sert à l'onglet « Votes Québec » (intentions de vote) tant que Qc125 n'a pas publié de sondage postérieur
à l'élection. Relancé par le pipeline jusqu'à ce que les résultats soient finaux, puis le fichier ne bouge plus.
Usage : /usr/bin/python3 election.py   (dans le dossier outils/)
"""
import json, re, os, unicodedata, urllib.request

URL = "https://donnees.electionsquebec.qc.ca/production/provincial/resultats/resultats.json"
URL_CAND = "https://donnees.electionsquebec.qc.ca/production/provincial/candidatures/candidatures.json"
SORTIE = os.path.join(os.path.dirname(__file__), "..", "election-2026.json")
PARTIS = ["PQ", "PLQ", "CAQ", "PCQ", "QS"]
HDR = {"User-Agent": "Mozilla/5.0 (fveilleux.com)", "Accept": "application/json"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def norm(s):
    return re.sub("[^a-z]", "", unicodedata.normalize("NFD", str(s).lower()).encode("ascii", "ignore").decode())


def parti(abrev):  # mêmes règles que partiDe() dans live.js (« PCQ/CPQ » = Parti canadien → autres)
    a = re.sub("[^A-Z]", "", str(abrev or "").upper())
    if a == "PQ": return "PQ"
    if a.startswith("PLQ"): return "PLQ"
    if "CAQ" in a: return "CAQ"
    if a == "QS": return "QS"
    if a.startswith("PCOQ") or re.match("^PCQE", a): return "PCQ"
    return "AUT"


# déjà final : rien à refaire
if os.path.exists(SORTIE) and json.load(open(SORTIE, encoding="utf-8")).get("final"):
    print("Résultats déjà finaux, election-2026.json inchangé."); raise SystemExit(0)

d = get(URL)
data = json.load(open(os.path.join(os.path.dirname(__file__), "..", "data.json"), encoding="utf-8"))
par_nom = {norm(r["n"]): r["n"] for r in data["ridings"]}
code_nom = {}
try:
    for c in get(URL_CAND):
        if norm(c["nom_circonscription"]) in par_nom: code_nom[c["code_circonscription"]] = par_nom[norm(c["nom_circonscription"])]
except Exception:
    pass

st = d["statistiques"]
national = {}
for p in st["partisPolitiques"]:
    k = parti(p["abreviationPartiPolitique"]); national[k] = round(national.get(k, 0) + float(p["tauxVoteTotal"] or 0), 2)
circ, sieges = {}, {}
for c in d["circonscriptions"]:
    nom = par_nom.get(norm(c["nomCirconscription"])) or code_nom.get(c["numeroCirconscription"])
    if not nom: continue
    tot = sum(k["nbVoteTotal"] for k in c["candidats"])
    if not tot: continue
    parts, cands = {}, []
    for k in sorted(c["candidats"], key=lambda k: -k["nbVoteTotal"]):
        p = parti(k["abreviationPartiPolitique"])
        parts[p] = round(parts.get(p, 0) + 100 * k["nbVoteTotal"] / tot, 1)
        cands.append({"p": p, "sigle": k["abreviationPartiPolitique"], "nom": f'{k["prenom"]} {k["nom"]}', "v": k["nbVoteTotal"]})
    g = cands[0]["p"]
    sieges[g] = sieges.get(g, 0) + 1
    circ[nom] = {"g": g, "s": parts, "c": cands[:3], "f": bool(c["isResultatsFinaux"]),
                 "b": round(100 * c["nbBureauComplete"] / max(1, c["nbBureauTotal"]), 1), "part": float(c["tauxParticipation"] or 0)}

sortie = {
    "titre": "Élection générale du 5 octobre 2026", "date": "2026-10-05",
    "final": bool(st["isResultatsFinaux"]), "maj": st["iso8601DateMAJ"],
    "bureaux": round(float(st["tauxBureauVoteRempli"]), 1), "participation": float(st["tauxParticipationTotal"] or 0),
    "national": {p: national.get(p, 0) for p in PARTIS + ["AUT"]}, "sieges": sieges, "circ": circ,
}
json.dump(sortie, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(circ)} circonscriptions · {'final' if sortie['final'] else str(sortie['bureaux']) + ' % des bureaux'} · sièges {sieges}")
