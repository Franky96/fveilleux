"""Élections générales en Espagne du 29 novembre 2026 : copie de secours des résultats provisoires du ministère de l'Intérieur.

Même travail que le relais du site (api/direct-es.php) : lit la page des résultats (hôtes en 29neleccionesgenerales.es seulement),
repère les fichiers .json nommés dans la page ou ses scripts (ou lit les 52 fichiers par province si PLANTILLES est rempli) et les
écrit tels quels dans en-direct/espagne/resultats.json (« pages ») ; l'interprétation se fait dans en-direct/espagne/direct.js.
Hypothèse sur l'adresse : voir api/direct-es.php (modèle de 2023, resultados.generales23j.es ; rien d'annoncé au 26 octobre 2026).
Le workflow .github/workflows/es-election.yml lance ce script toutes les 5 minutes le soir du vote et pousse le fichier s'il change.

Usage : python3 en-direct/espagne/outils/es.py [--force]   (--force : hors de la fenêtre des résultats)
"""
import concurrent.futures as cf, datetime as dt, json, os, re, sys, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "resultats.json"))
DEPARTS = ["https://resultados.29neleccionesgenerales.es/", "https://29neleccionesgenerales.es/"]
PLANTILLES = []                    # ex. "https://resultados.29neleccionesgenerales.es/assets/data/congreso/{prov}.json" (à remplir le soir du vote)
# bureaux fermés à 20 h (heure de la péninsule) = 19 h UTC le 29 novembre ; jusqu'à la fin du recensement général (7 décembre)
FENETRE = (dt.datetime(2026, 11, 29, 18, 30, tzinfo=dt.timezone.utc), dt.datetime(2026, 12, 8, 12, 0, tzinfo=dt.timezone.utc))
MAX_PAGES, MAX_SCRIPTS = 12, 4
# le pare-feu du site (CloudFront) refuse les agents sans « Mozilla/5.0 (…) » (403, vérifié le 26 octobre 2026)
UA = "Mozilla/5.0 (compatible; fveilleux.com; resultados en directo)"


def permis(url):
    u = urllib.parse.urlparse(url); h = (u.hostname or "").lower()
    return u.scheme == "https" and (h == "29neleccionesgenerales.es" or h.endswith(".29neleccionesgenerales.es"))


class SansRenvoi(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, newurl) if permis(newurl) else None


OUVRIR = urllib.request.build_opener(SansRenvoi)


def lire(url):
    if not permis(url): return None
    try:
        with OUVRIR.open(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/html,*/*"}), timeout=30) as r:
            if not permis(r.geturl()): return None
            corps = r.read().decode("utf-8", "replace"); ct = r.headers.get("content-type") or ""
            typ = "json" if "json" in ct or re.match(r"\s*[\[{]", corps) else "js" if "javascript" in ct else "html"
            return {"url": r.geturl(), "type": typ, "corps": corps}
    except Exception as e:
        print("Lecture impossible :", url, e); return None


def plusieurs(urls):
    with cf.ThreadPoolExecutor(8) as ex: return [p for p in ex.map(lire, urls) if p]


def pages_depuis(depart):
    accueil = lire(depart)
    if not accueil: return []
    if not urllib.parse.urlparse(accueil["url"]).hostname.startswith("resultados"):
        for l in dict.fromkeys(re.findall(r'href\s*=\s*["\']([^"\']*resultados[^"\']*)["\']', accueil["corps"], re.I)):
            a = urllib.parse.urljoin(accueil["url"], l)
            if permis(a) and a != accueil["url"]:
                r = lire(a)
                if r: accueil = r; break
    # adresses relatives au <base href> de l'application s'il y en a un
    m = re.search(r'<base[^>]+href\s*=\s*["\']([^"\']+)["\']', accueil["corps"], re.I)
    base = urllib.parse.urljoin(accueil["url"], m.group(1)) if m else accueil["url"]
    textes = [accueil["corps"]]
    for l in list(dict.fromkeys(re.findall(r'<script[^>]+src\s*=\s*["\']([^"\']+\.js[^"\']*)["\']', accueil["corps"], re.I)))[:MAX_SCRIPTS]:
        r = lire(urllib.parse.urljoin(base, l))
        if r: textes.append(r["corps"])
    json_ = {}
    for t in textes:
        for l in re.findall(r'["\'(]((?:https://[a-z0-9.-]+)?/?[A-Za-z0-9_./-]+\.json(?:\?[^"\')\s]*)?)["\')]', t):
            a = urllib.parse.urljoin(base, l)
            if permis(a): json_[a] = True
    liste = sorted(json_, key=lambda a: not re.search(r"congres|cong|_co|total|nacional|99", a, re.I))
    return plusieurs(liste[:MAX_PAGES]) or [accueil]


def main():
    if "--force" not in sys.argv and not (FENETRE[0] <= dt.datetime.now(dt.timezone.utc) <= FENETRE[1]):
        print("Hors de la période des résultats : rien à lire."); return
    pages = plusieurs([t.replace("{prov}", f"{p:02d}") for t in PLANTILLES for p in range(1, 53)]) if PLANTILLES else []
    if not pages:
        for d in DEPARTS:
            pages = pages_depuis(d)
            if pages: break
    if not any(p["type"] == "json" for p in pages): print("Pas encore de fichier de résultats : fichier inchangé."); return
    d = {"disponible": True, "maj": dt.datetime.now(dt.timezone.utc).isoformat(), "source": DEPARTS[0], "copie": "pipeline", "pages": pages}
    try: avant = json.load(open(SORTIE, encoding="utf-8"))
    except (OSError, ValueError): avant = {}
    if [p["corps"] for p in avant.get("pages", [])] == [p["corps"] for p in pages]: print("Aucun changement."); return
    with open(SORTIE, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(pages)} page(s) : {SORTIE} mis à jour.")


if __name__ == "__main__":
    main()
