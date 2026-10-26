"""Élections locales à Taïwan du 28 novembre 2026 : copie de secours des résultats de la Commission électorale centrale (CEC).

Même travail que le relais du site (api/direct-tw.php) : essaie les hôtes et les types de pages connus de la CEC (page de tout Taïwan),
puis lit la page de chacune des 22 courses de maire et de chef de comté (https://<hôte>/zh-TW/<type>/<code de 17 chiffres>.html, modèle
de 2022), seulement sur les hôtes de la CEC, et les écrit allégées dans en-direct/taiwan/resultats.json (« pages ») ; l'interprétation
se fait dans en-direct/taiwan/direct.js. Le workflow .github/workflows/tw-election.yml lance ce script toutes les 5 minutes le soir du
vote et pousse le fichier quand il change.

Usage : python3 en-direct/taiwan/outils/tw.py [--force]   (--force : hors de la fenêtre des résultats)
"""
import concurrent.futures as cf, datetime as dt, json, os, re, sys, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "resultats.json"))
HOTES = ["vote.cec.gov.tw", "vote2026.cec.gov.tw", "www.cec.gov.tw"]
TYPES = ["TC", "C1", "T1"]
MUN = ["63000", "64000", "65000", "66000", "67000", "68000"]
COMTES = ["10002", "10004", "10005", "10007", "10008", "10009", "10010", "10013", "10014", "10015", "10016", "10017", "10018", "10020", "09007", "09020"]
# fermeture des bureaux (16 h à Taïwan = 8 h UTC le 28 novembre) jusqu'à la proclamation des élus (4 décembre)
FENETRE = (dt.datetime(2026, 11, 28, 7, 45, tzinfo=dt.timezone.utc), dt.datetime(2026, 12, 5, 0, 0, tzinfo=dt.timezone.utc))


class SansRenvoi(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None if urllib.parse.urlparse(newurl).hostname not in HOTES else super().redirect_request(req, fp, code, msg, headers, newurl)


OUVRIR = urllib.request.build_opener(SansRenvoi)


def adresse(hote, typ, code):
    return f"https://{hote}/zh-TW/{typ}/{code.ljust(17, '0')}.html"


def alleger(h):
    m = re.search(r"<body[^>]*>(.*)</body>", h, re.S | re.I)
    if m: h = m.group(1)
    for motif in (r"<script\b.*?</script>", r"<style\b.*?</style>", r"<!--.*?-->", r"<nav\b.*?</nav>"):
        h = re.sub(motif, "", h, flags=re.S | re.I)
    return re.sub(r"\s+", " ", h).strip()


def lire(url):
    try:
        with OUVRIR.open(urllib.request.Request(url, headers={"User-Agent": "fveilleux.com (resultats en direct)", "Accept": "text/html"}), timeout=20) as r:
            if urllib.parse.urlparse(r.geturl()).hostname not in HOTES: return None
            corps = r.read().decode("utf-8", "replace")
            return alleger(corps) if re.search("<table|投票所", corps) else None
    except Exception as e:
        print("Lecture impossible :", url, e); return None


def plusieurs(urls):
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        return {k: v for k, v in zip(urls, ex.map(lire, urls.values())) if v}


def main():
    if "--force" not in sys.argv and not (FENETRE[0] <= dt.datetime.now(dt.timezone.utc) <= FENETRE[1]):
        print("Hors de la période des résultats : rien à lire."); return
    rep = plusieurs({(h, t): adresse(h, t, "0") for h in HOTES for t in TYPES})
    pages = []
    for hote in HOTES:
        types = [t for t in TYPES if (hote, t) in rep]
        if not types: continue
        if "TC" in types: types = ["TC"]
        urls = {}
        for code in MUN + COMTES:
            t = "TC" if types == ["TC"] else ("T1" if "T1" in types else types[0]) if code in MUN else ("C1" if "C1" in types else types[0])
            urls[(t, code)] = adresse(hote, t, code)
        lu = plusieurs(urls)
        for t in types: lu[(t, "00000")] = rep[(hote, t)]
        pages = [{"url": adresse(hote, t, code), "code": code, "type": "html", "corps": corps} for (t, code), corps in lu.items()]
        source = adresse(hote, types[0], "0")
        break
    if not pages: print("La CEC ne répond pas : fichier inchangé."); return
    d = {"disponible": True, "maj": dt.datetime.now(dt.timezone.utc).isoformat(), "source": source, "copie": "pipeline", "pages": pages}
    try: avant = json.load(open(SORTIE, encoding="utf-8"))
    except (OSError, ValueError): avant = {}
    if sorted(p["corps"] for p in avant.get("pages", [])) == sorted(p["corps"] for p in pages): print("Aucun changement."); return
    with open(SORTIE, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(pages)} page(s) : {SORTIE} mis à jour.")


if __name__ == "__main__":
    main()
