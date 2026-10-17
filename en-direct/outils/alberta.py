"""Référendum en Alberta du 19 octobre 2026 : copie des résultats d'Élections Alberta pour la page « En direct ».

Copie de secours du relais api/alberta.php (même forme de fichier) : le pipeline GitHub (.github/workflows/alberta-referendum.yml)
lance ce script toutes les 5 minutes le soir du vote et pousse en-direct/resultats.json sur master quand il change.

Pour chacune des 10 questions, Élections Alberta publie une page (orEDResultsReferendum2026.cfm?EventId=202601 à 202610) ;
tant que l'événement n'est pas ouvert, le site redirige (302). On garde le contenu brut de chaque page : texte et
tableaux, cellule par cellule (colspan répété) ; l'interprétation se fait dans en-direct/direct.js.

Usage : python3 alberta.py            (ne fait rien hors de la soirée du vote et des 2 jours de dépouillement)
        python3 alberta.py --force    (lit quand même, pour tester)
"""
import datetime as dt, html.parser, json, os, re, sys, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "resultats.json"))
BASE = "https://officialresults.elections.ab.ca/"
EVENEMENTS = list(range(202601, 202611))
# fermeture des bureaux : 19 octobre 20 h, heure de l'Alberta (2 h UTC le 20) ; dépouillement terminé au plus tard 48 h après
FENETRE = (dt.datetime(2026, 10, 19, 23, 0, tzinfo=dt.timezone.utc), dt.datetime(2026, 10, 22, 8, 0, tzinfo=dt.timezone.utc))


class Extracteur(html.parser.HTMLParser):
    """Texte hors tableaux (8000 caractères au plus) et tableaux : [[cellule, …], …] (lignes du tableau lui-même)."""
    IGNORE = {"script", "style", "select", "nav"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.pile, self.texte, self.titre = [], [], [], ""
        self.ignore = 0; self.cellule = None; self.colspan = 1; self.dans_titre = False

    def handle_starttag(self, tag, attrs):
        if tag in self.IGNORE: self.ignore += 1
        elif tag == "title": self.dans_titre = True
        elif tag == "table": self.pile.append([])
        elif tag == "tr" and self.pile: self.fermer_cellule(); self.pile[-1].append([])
        elif tag in ("td", "th") and self.pile:
            if not self.pile[-1]: self.pile[-1].append([])
            self.fermer_cellule(); self.cellule = []
            try: self.colspan = max(1, min(12, int(dict(attrs).get("colspan") or 1)))
            except ValueError: self.colspan = 1
        elif tag == "br": self.handle_data(" ")

    def fermer_cellule(self):
        if self.cellule is not None and self.pile and self.pile[-1]:
            t = re.sub(r"\s+", " ", "".join(self.cellule).replace("\xa0", " ")).strip()[:300]
            self.pile[-1][-1].extend([t] * self.colspan)
        self.cellule = None

    def handle_endtag(self, tag):
        if tag in self.IGNORE: self.ignore = max(0, self.ignore - 1)
        elif tag == "title": self.dans_titre = False
        elif tag in ("td", "th"): self.fermer_cellule()
        elif tag == "table" and self.pile:
            self.fermer_cellule()
            t = [l for l in self.pile.pop() if l][:400]
            if len(t) >= 2 and len(self.tables) < 30: self.tables.append(t)

    def handle_data(self, d):
        if self.dans_titre: self.titre += d
        if self.ignore: return
        if self.cellule is not None: self.cellule.append(d)
        elif not self.pile: self.texte.append(d)

    def resultat(self):
        net = lambda s: re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()
        return {"titre": net(self.titre), "texte": net(" ".join(self.texte))[:8000], "tables": self.tables}


class SansRedirection(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


OUVRIR = urllib.request.build_opener(SansRedirection)


def lire(evt):
    req = urllib.request.Request(f"{BASE}orEDResultsReferendum2026.cfm?EventId={evt}",
                                 headers={"User-Agent": "fveilleux.com (resultats en direct)", "Accept": "text/html"})
    try:
        with OUVRIR.open(req, timeout=20) as r:
            corps = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return evt, {"statut": e.code}                     # 302 : événement pas encore ouvert
    except Exception:
        return evt, {"statut": 0}
    x = Extracteur(); x.feed(corps); x.close()
    return evt, {"statut": 200, **x.resultat()}


def main():
    maintenant = dt.datetime.now(dt.timezone.utc)
    if "--force" not in sys.argv and not (FENETRE[0] <= maintenant <= FENETRE[1]):
        print("Hors de la soirée du vote : rien à lire."); return
    with ThreadPoolExecutor(5) as ex:
        pages = dict(ex.map(lire, EVENEMENTS))
    if not any(p["statut"] for p in pages.values()):
        print("Élections Alberta ne répond pas : fichier inchangé."); return
    ok = sum(p["statut"] == 200 for p in pages.values())
    d = {"disponible": ok > 0, "maj": maintenant.isoformat(timespec="seconds"), "source": BASE, "copie": "pipeline",
         "pages": {str(k): v for k, v in pages.items()}}
    try: avant = json.load(open(SORTIE, encoding="utf-8"))
    except (OSError, ValueError): avant = {}
    if {**avant, "maj": None} == {**d, "maj": None}:
        print(f"{ok}/10 questions publiées, aucun changement."); return
    with open(SORTIE, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{ok}/10 questions publiées : {SORTIE} mis à jour.")


if __name__ == "__main__":
    main()
