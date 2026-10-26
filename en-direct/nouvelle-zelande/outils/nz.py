"""Élections générales en Nouvelle-Zélande du 7 novembre 2026 : copie de secours des résultats préliminaires de la Commission électorale.

Même travail que le relais du site (api/direct-nz.php) : lit le flux XML de la Commission électorale (election.xml : voix et
sièges par parti ; e01.xml à e71.xml : voix de parti et de candidat par circonscription ; parties.xml, candidates.xml,
electorates.xml : listes), seulement sur ses hôtes, et l'écrit tel quel (espaces entre balises retirées) dans
en-direct/nouvelle-zelande/resultats.json (« fichiers ») ; l'interprétation se fait dans en-direct/nouvelle-zelande/direct.js.
Flux : media.election.net.nz/xml/ (adresse donnée aux médias dans la trousse de 2026), sinon www.electionresults.govt.nz/xml/
(même flux, déjà en ligne avec les candidatures de 2026 et des voix à zéro). Le workflow .github/workflows/nz-election.yml lance ce
script toutes les 5 minutes le soir du vote et pousse le fichier quand il change.

  --demo 2023        : résultats officiels de 2023, même format (archive.electionresults.govt.nz) → demo-2023.json
  --demo simulation  : simulation de la Commission pour les médias (mediademo.electionresults.govt.nz, données de 2023
                       dévoilées peu à peu) → demo-simulation.json (pour l'essai local seulement, non publié)

Usage : python3 en-direct/nouvelle-zelande/outils/nz.py [--force] [--demo 2023|simulation]
"""
import datetime as dt, json, os, re, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.normpath(os.path.join(ICI, ".."))
FLUX = ["https://media.election.net.nz/xml/", "https://www.electionresults.govt.nz/xml/"]
DEMOS = {"2023": "https://archive.electionresults.govt.nz/electionresults_2023/xml/", "simulation": "https://mediademo.electionresults.govt.nz/xml/"}
# fermeture des bureaux : 7 novembre, 19 h NZDT = 06:00 UTC ; résultats officiels le 27 novembre
FENETRE = (dt.datetime(2026, 11, 7, 5, 30, tzinfo=dt.timezone.utc), dt.datetime(2026, 11, 28, 12, 0, tzinfo=dt.timezone.utc))
PERMIS = {"media.election.net.nz", "www.electionresults.govt.nz", "electionresults.govt.nz", "archive.electionresults.govt.nz", "mediademo.electionresults.govt.nz"}
LISTES = ["parties.xml", "candidates.xml", "electorates.xml"]


class SansRenvoi(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None if urllib.parse.urlparse(newurl).hostname not in PERMIS else super().redirect_request(req, fp, code, msg, headers, newurl)


OUVRIR = urllib.request.build_opener(SansRenvoi)


def lire(url):
    try:
        with OUVRIR.open(urllib.request.Request(url, headers={"User-Agent": "fveilleux.com (resultats en direct)"}), timeout=30) as r:
            if urllib.parse.urlparse(r.geturl()).hostname not in PERMIS: return None
            corps = r.read().decode("utf-8", "replace")
            return re.sub(r">\s+<", "><", corps.strip()) if corps.lstrip().startswith("<?xml") else None
    except Exception as e:
        print("Lecture impossible :", url, e); return None


def lire_tout(base):
    election = lire(base + "election.xml")
    if not election: return None
    f = {"election.xml": election}
    for n in LISTES:
        x = lire(base + n)
        if x: f[n] = x
    try: nums = [e.get("e_no") for e in ET.fromstring(f["electorates.xml"])]
    except (KeyError, ET.ParseError): nums = [str(i) for i in range(1, 72)]
    noms = [f"e{int(n):02d}" for n in nums]
    with ThreadPoolExecutor(8) as ex:
        for n, x in zip(noms, ex.map(lambda n: lire(f"{base}{n}/{n}.xml"), noms)):
            if x: f[n + ".xml"] = x
    return f


def main():
    demo = sys.argv[sys.argv.index("--demo") + 1] if "--demo" in sys.argv else None
    if not demo and "--force" not in sys.argv and not (FENETRE[0] <= dt.datetime.now(dt.timezone.utc) <= FENETRE[1]):
        print("Hors de la période des résultats : rien à lire."); return
    bases = [DEMOS[demo]] if demo else FLUX
    fichiers, source = None, None
    for b in bases:
        fichiers = lire_tout(b)
        if fichiers: source = b; break
    if not fichiers: print("La Commission électorale ne répond pas : fichier inchangé."); return
    sortie = os.path.join(DOSSIER, f"demo-{demo}.json" if demo else "resultats.json")
    d = {"disponible": True, "maj": dt.datetime.now(dt.timezone.utc).isoformat(), "source": source, "copie": "pipeline", **({"demo": demo} if demo else {}), "fichiers": fichiers}
    try: avant = json.load(open(sortie, encoding="utf-8"))
    except (OSError, ValueError): avant = {}
    if avant.get("fichiers") == fichiers: print("Aucun changement."); return
    with open(sortie, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(fichiers)} fichier(s) : {sortie} mis à jour.")


if __name__ == "__main__":
    main()
