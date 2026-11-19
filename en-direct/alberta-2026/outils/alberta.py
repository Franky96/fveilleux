"""Référendum en Alberta du 19 octobre 2026 : copie des résultats d'Élections Alberta pour la page « En direct ».

Copie de secours du relais api/alberta.php (même forme de fichier) : le pipeline GitHub (.github/workflows/alberta-referendum.yml)
lance ce script toutes les 5 minutes après la fermeture des bureaux et pousse en-direct/resultats.json sur master quand il change.

Élections Alberta publie les résultats non officiels sur results.elections.ab.ca (tableau de bord, données en JSON :
/data/<code>?version=<v>&questions=…&wards=). On lit le code et la version dans la page, puis les 10 questions avec le
détail par circonscription (identifiants 1 à 9, et 11 pour la question 10) ; l'interprétation se fait dans en-direct/direct.js.

Résultats officiels (29 octobre 2026) : officialresults.elections.ab.ca/orEDResultsReferendum2026.cfm?EventId=2026NN
(NN = 01 à 10, numéro de la question), un tableau par question : circonscription, sections, électeurs, oui / non (option 1 /
option 2 pour la question 10), participation. Depuis, results.elections.ab.ca renvoie vers ces pages. Le script les lit en
premier et écrit « pages » (tableaux en texte, cellules fusionnées dépliées) avec « officiel » : la page les préfère au relais.

Usage : python3 alberta.py            (ne fait rien hors de la soirée du vote et des jours de dépouillement)
        python3 alberta.py --force    (lit quand même, pour tester)
        python3 alberta.py --officiel (résultats officiels seulement)
"""
import datetime as dt, html, json, os, re, sys, urllib.request
from html.parser import HTMLParser

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


OFFICIEL = "https://officialresults.elections.ab.ca/orEDResultsReferendum2026.cfm?EventId={}"


class Tables(HTMLParser):
    """Tableaux d'une page : lignes de cellules en texte ; une cellule fusionnée (colspan) est répétée pour garder les colonnes alignées."""
    def __init__(self):
        super().__init__(); self.tables, self.pile, self.cell, self.span = [], [], None, 1
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table": self.pile.append([])
        elif tag == "tr" and self.pile: self.pile[-1].append([])
        elif tag in ("td", "th") and self.pile and self.pile[-1]:
            self.cell, self.span = [], max(1, int(a.get("colspan") or 1))
        elif tag == "br" and self.cell is not None: self.cell.append(" ")
    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None and self.pile and self.pile[-1]:
            t = re.sub(r"\s+", " ", "".join(self.cell)).strip()
            self.pile[-1][-1].extend([t] * self.span); self.cell = None
        elif tag == "table" and self.pile:
            t = [l for l in self.pile.pop() if l]
            if t: self.tables.append(t)
    def handle_data(self, d):
        if self.cell is not None: self.cell.append(d)


def officiels():
    pages = {}
    for k in range(1, 11):
        evt = f"2026{k:02d}"
        corps = lire(OFFICIEL.format(evt), "text/html")
        p = Tables(); p.feed(corps)
        texte = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"(?s)<(script|style).*?</\1>", " ", corps))))
        m = re.search(r"2026 Referendum Results (Question \d+:.*?)(?: Event:|$)", texte)
        tables = [t for t in p.tables if any("option" in " ".join(l).lower() or re.search(r"\byes\b", " ".join(l).lower()) for l in t[:3])]
        for t in tables:   # en-tête fusionné « ELECTORAL DIVISION NAME » sur le numéro et le nom : la 1re colonne est le numéro
            if len(t[0]) > 1 and t[0][0] == t[0][1]: t[0][0] = "ED No."
        if not tables: raise ValueError(f"question {k} : tableau introuvable")
        pages[evt] = {"statut": 200, "url": OFFICIEL.format(evt), "titre": f"Question {k}", "texte": m[1][:600] if m else "", "tables": tables}
    return pages


def main():
    maintenant = dt.datetime.now(dt.timezone.utc)
    # résultats officiels (publiés le 29 octobre 2026) : toujours lus d'abord ; s'ils changent, le fichier est réécrit
    try:
        pages = officiels()
        d = {"disponible": True, "officiel": True, "maj": "2026-10-29T16:00:00+00:00", "lu": maintenant.isoformat(timespec="seconds"),
             "source": OFFICIEL.format("202610"), "copie": "pipeline", "pages": pages}
        try: avant = json.load(open(SORTIE, encoding="utf-8"))
        except (OSError, ValueError): avant = {}
        if avant.get("officiel") and avant.get("pages") == pages:
            print("Résultats officiels : aucun changement."); return
        with open(SORTIE, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        print(f"Résultats officiels des 10 questions : {SORTIE} mis à jour."); return
    except Exception as e:
        print("Résultats officiels illisibles :", e)
        if "--officiel" in sys.argv: return
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
