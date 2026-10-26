"""Mi-mandat aux États-Unis du 3 novembre 2026 : copie de secours des résultats (en-direct/etats-unis/resultats.json).

Même travail que le relais du site (api/usa.php) : lit les flux de résultats de CNN (Chambre HG, Sénat SG, gouverneurs GG),
garde l'élection générale et les champs utiles, et écrit le tout dans resultats.json ; la page le lit si le relais et la lecture
directe des flux ne répondent pas. Le workflow .github/workflows/usa-election.yml lance ce script le soir du vote et les semaines
suivantes, et pousse le fichier quand il change.

Usage : python3 en-direct/etats-unis/outils/usa.py [--force] [--annee 2024]   (--force : hors de la fenêtre des résultats)
"""
import datetime as dt, json, os, sys, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "resultats.json"))
FENETRE = (dt.datetime(2026, 11, 3, 22, 0, tzinfo=dt.timezone.utc), dt.datetime(2026, 12, 3, 6, 0, tzinfo=dt.timezone.utc))
ANNEE = sys.argv[sys.argv.index("--annee") + 1] if "--annee" in sys.argv else "2026"


def lire(t):
    url = f"https://politics.api.cnn.io/results/national-races/{ANNEE}-{t}.json"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "fveilleux.com (resultats en direct)", "Accept": "application/json"}), timeout=30) as r:
            return json.load(r)
    except Exception as e:
        print("Lecture impossible :", url, e); return None


def alleger(r):
    e = r.get("raceEmbargo") or {}
    return {"k": r.get("ecKey", ""), "st": r.get("stateAbbreviation", ""), "type": r.get("electionType", ""), "statut": r.get("status", ""),
            "pct": r.get("percentReporting"), "total": r.get("totalVote"), "appel": r.get("editorialStatus", ""),
            "ferme": e.get("pollsClosed"), "fermeture": e.get("assignedPollsClose"), "maj": r.get("voteTimestamp"),
            "cands": [{"nom": c.get("fullName", ""), "p": c.get("candidatePartyCode", ""), "v": c.get("voteNum") or 0, "g": bool(c.get("winner")),
                       "sortant": bool(c.get("isIncumbent")), "tour2": bool(c.get("runoffCandidate"))} for c in r.get("candidates") or []]}


def main():
    if "--force" not in sys.argv and not (FENETRE[0] <= dt.datetime.now(dt.timezone.utc) <= FENETRE[1]):
        print("Hors de la période des résultats : rien à lire."); return
    courses = {}
    for t in ("HG", "SG", "GG"):
        d = lire(t)
        if d is not None: courses[t] = [alleger(r) for r in d if r.get("electionType", "G") == "G"]
    if not courses: print("Aucun flux lisible : fichier inchangé."); return
    ancien = json.load(open(SORTIE, encoding="utf-8")) if os.path.exists(SORTIE) else {}
    if ancien.get("courses") == courses: print("Aucun changement."); return
    json.dump({"disponible": True, "maj": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "annee": ANNEE,
               "source": "politics.api.cnn.io", "courses": courses}, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("resultats.json :", {t: len(v) for t, v in courses.items()})


main()
