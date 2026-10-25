"""Élection générale en Colombie-Britannique du 24 octobre 2026 : copie de secours des résultats préliminaires d'Elections BC.

Même travail que le relais du site (api/cb.php) : lit la page d'accueil des résultats (results.elections.bc.ca) et les rapports
qu'elle relie (HTML ou JSON), seulement sur les hôtes d'Elections BC, et les écrit tels quels dans en-direct/resultats.json
(« pages ») ; l'interprétation se fait dans en-direct/direct.js. Le workflow .github/workflows/cb-election.yml lance ce script
toutes les 5 minutes le soir du vote et pousse le fichier quand il change.

Usage : python3 en-direct/outils/cb.py [--force]   (--force : hors de la fenêtre des résultats)
"""
import datetime as dt, json, os, re, sys, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "resultats.json"))
DEPART = "https://results.elections.bc.ca/"
FENETRE = (dt.datetime(2026, 10, 25, 3, 0, tzinfo=dt.timezone.utc), dt.datetime(2026, 11, 19, 8, 0, tzinfo=dt.timezone.utc))
PERMIS = {"results.elections.bc.ca", "electionsbcenr.blob.core.windows.net"}


class SansRenvoi(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None if urllib.parse.urlparse(newurl).hostname not in PERMIS else super().redirect_request(req, fp, code, msg, headers, newurl)


OUVRIR = urllib.request.build_opener(SansRenvoi)


def lire(url):
    try:
        with OUVRIR.open(urllib.request.Request(url, headers={"User-Agent": "fveilleux.com (resultats en direct)"}), timeout=30) as r:
            if urllib.parse.urlparse(r.geturl()).hostname not in PERMIS: return None
            corps = r.read().decode("utf-8", "replace")
            return {"url": r.geturl(), "type": "json" if "json" in (r.headers.get("content-type") or "") else "html", "corps": corps}
    except Exception as e:
        print("Lecture impossible :", url, e); return None


def main():
    if "--force" not in sys.argv and not (FENETRE[0] <= dt.datetime.now(dt.timezone.utc) <= FENETRE[1]):
        print("Hors de la période des résultats : rien à lire."); return
    pages = []
    accueil = lire(DEPART)
    if accueil:
        pages.append(accueil)
        liens = []
        for l in dict.fromkeys(re.findall(r'(?:href|src)\s*=\s*["\']([^"\'#]+\.(?:html?|json)(?:\?[^"\']*)?)["\']', accueil["corps"], re.I)):
            a = urllib.parse.urljoin(accueil["url"], l)
            if urllib.parse.urlparse(a).hostname in PERMIS and a != accueil["url"]: liens.append(a)
        cand = [a for a in liens if re.search("candidat", a, re.I)]   # le rapport par candidat suffit (comme api/cb.php)
        if cand: pages = []
        for l in (cand or liens)[:5]:
            p = lire(l)
            if p: pages.append(p)
    if not pages: print("Elections BC ne répond pas : fichier inchangé."); return
    d = {"disponible": True, "maj": dt.datetime.now(dt.timezone.utc).isoformat(), "source": DEPART, "copie": "pipeline", "pages": pages}
    try: avant = json.load(open(SORTIE, encoding="utf-8"))
    except (OSError, ValueError): avant = {}
    if [p["corps"] for p in avant.get("pages", [])] == [p["corps"] for p in pages]: print("Aucun changement."); return
    with open(SORTIE, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(pages)} page(s) : {SORTIE} mis à jour.")


if __name__ == "__main__":
    main()
