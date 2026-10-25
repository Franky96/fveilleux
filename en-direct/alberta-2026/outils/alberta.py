"""Référendum en Alberta du 19 octobre 2026 : copie des résultats d'Élections Alberta pour la page « En direct ».

Copie de secours du relais api/alberta.php (même forme de fichier) : le pipeline GitHub (.github/workflows/alberta-referendum.yml)
lance ce script toutes les 5 minutes après la fermeture des bureaux et pousse en-direct/resultats.json sur master quand il change.

Élections Alberta publie les résultats non officiels sur results.elections.ab.ca (tableau de bord, données en JSON :
/data/<code>?version=<v>&questions=…&wards=). On lit le code et la version dans la page, puis les 10 questions avec le
détail par circonscription (identifiants 1 à 9, et 11 pour la question 10) ; l'interprétation se fait dans en-direct/direct.js.

Usage : python3 alberta.py            (ne fait rien hors de la soirée du vote et des jours de dépouillement)
        python3 alberta.py --force    (lit quand même, pour tester)
"""
import datetime as dt, json, os, re, sys, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "resultats.json"))
BASE = "https://results.elections.ab.ca/"
QUESTIONS = "1,2,3,4,5,6,7,8,9,11"
# fermeture des bureaux : 19 octobre 20 h, heure de l'Alberta (2 h UTC le 20) ; dépouillement non officiel, puis résultats
# officiels le 29 octobre
FENETRE = (dt.datetime(2026, 10, 19, 23, 0, tzinfo=dt.timezone.utc), dt.datetime(2026, 10, 30, 8, 0, tzinfo=dt.timezone.utc))
UA = {"User-Agent": "fveilleux.com (resultats en direct)"}


def lire(url, accept):
    req = urllib.request.Request(url, headers={**UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def main():
    maintenant = dt.datetime.now(dt.timezone.utc)
    if "--force" not in sys.argv and not (FENETRE[0] <= maintenant <= FENETRE[1]):
        print("Hors de la période des résultats : rien à lire."); return
    try:
        page = lire(BASE, "text/html")
        mun = (re.search(r"countyMun:\s*'(\d+)'", page) or [None, "8400"])[1]
        ver = (re.search(r"version:\s*'([\w.]+)'", page) or [None, "3.3.3"])[1]
        j = json.loads(lire(f"{BASE}data/{mun}?version={ver}&questions={QUESTIONS}&wards=", "application/json"))
    except Exception as e:
        print("Élections Alberta ne répond pas :", e, "— fichier inchangé."); return
    if not j.get("success") or not j.get("referendumResults"):
        print("Réponse inattendue : fichier inchangé."); return
    r = j["referendumResults"]
    eab = {"lastUpdated": j.get("lastUpdated"), "widgets": r.get("widgets", {}), "wards": r.get("wards", []),
           "questionStats": r.get("votes", {}).get("questionStats", [])}
    d = {"disponible": (r.get("widgets", {}).get("summary", {}).get("valid") or 0) > 0, "maj": j.get("lastUpdated"),
         "source": BASE, "copie": "pipeline", "eab": eab}
    try: avant = json.load(open(SORTIE, encoding="utf-8"))
    except (OSError, ValueError): avant = {}
    if avant.get("eab", {}).get("questionStats") == eab["questionStats"] and avant.get("eab", {}).get("wards") == eab["wards"]:
        print("Aucun changement."); return
    with open(SORTIE, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    s = eab["widgets"].get("summary", {})
    print(f"Sections dépouillées : {s.get('pollsReporting')}/{s.get('totalPolls')} : {SORTIE} mis à jour.")


if __name__ == "__main__":
    main()
