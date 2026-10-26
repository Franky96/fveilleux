"""Présidentielle en Bulgarie (2e tour du 1er novembre 2026) : copie de secours des résultats de la Commission électorale centrale (CIK).

Lit les pages de résultats de la CIK (results.cik.bg) : résumé national (rezultati/index.html), les 32 circonscriptions électorales
(МИР 01 à 31 et 32 = « Извън страната », vote à l'étranger : rezultati/01.html … 32.html) et la participation (aktivnost/index.html,
aktivnost/01.html … 31.html), et en tire un JSON compact, le même que celui du relais du site (api/direct-bg.php) :
  { disponible, maj, source, tour, titre, donnees (heure des données de la CIK), pct (% des protocoles traités), final,
    cands: [{ n, nom, comite, v, elu }], nsp (« Не подкрепям никого »), proto (protocole final : inscrits, votants, valides, nuls),
    activite: [{ h, inscrits, votants, pct }], mir: { "1": { pct, final, v: { n: voix }, nsp, activite: […] }, … "32": … } }
results.cik.bg est derrière Cloudflare, qui met au défi certaines lectures sans navigateur (le 26 octobre 2026 : curl refusé, urllib avec un
User-Agent de navigateur accepté) ; au premier défi, le script passe par navigateur.mjs (Playwright, un contexte neuf par page). Le workflow .github/workflows/bg-election.yml le lance et pousse le fichier quand il change.

Adresses : 1er tour (25 octobre 2026) https://results.cik.bg/pvr202610/ ; 2e tour : pas encore publié le 26 octobre. En 2021, les deux
tours étaient sous pvrns2021/tur1/ et pvrns2021/tur2/ ; en 2026, le 1er tour est directement sous pvr202610/. L'adresse du 2e tour est donc
cherchée dans l'index de results.cik.bg (liens « pvr2026…/rezultati/index.html » autres que le 1er tour, page qui dit « втори тур » ou
« 1 ноември 2026 »), sinon parmi des suppositions (pvr202610/tur2/, pvr202611/…).

Usage :
  python3 en-direct/bulgarie/outils/bg.py [--tour 2|1] [--force] [--navigateur]
      --tour 2 (défaut) → en-direct/bulgarie/resultats.json ; --tour 1 → en-direct/bulgarie/tour1.json
      --force : hors de la fenêtre des résultats ; --navigateur : sans essayer la lecture directe
  python3 en-direct/bulgarie/outils/bg.py --demo 2021   → en-direct/bulgarie/demo-2021.json (2e tour du 21 novembre 2021, même format :
      sert de démo, ?demo=2021, et de comparaison avec 2021)
Bibliothèque standard seulement, plus Node et Playwright pour passer Cloudflare.
"""
import datetime as dt, json, os, re, shutil, subprocess, sys, tempfile, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.normpath(os.path.join(ICI, ".."))
RACINE = "https://results.cik.bg/"
TOUR1 = RACINE + "pvr202610/"
ESSAIS2 = ["pvr202610/tur2/", "pvr202611/", "pvr202610_2/", "pvr202610-2/", "pvr2026_2/"]   # suppositions (voir plus haut)
DEMO = {"2021": RACINE + "pvrns2021/tur2/"}
FENETRE = {1: (dt.datetime(2026, 10, 25, 17, 0, tzinfo=dt.timezone.utc), dt.datetime(2026, 11, 1, 0, 0, tzinfo=dt.timezone.utc)),
           2: (dt.datetime(2026, 11, 1, 5, 0, tzinfo=dt.timezone.utc), dt.datetime(2026, 11, 9, 0, 0, tzinfo=dt.timezone.utc))}
SOFIA = ZoneInfo("Europe/Sofia")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
NB_MIR = 32

def permis(url):
    u = urllib.parse.urlparse(url)
    return u.scheme == "https" and u.hostname == "results.cik.bg"


# ---------- lecture ----------
class Lecteur:
    """Lecture directe (urllib) ; au premier défi de Cloudflare, tout passe par le navigateur sans tête (navigateur.mjs)."""
    def __init__(self, navigateur=False):
        self.nav = navigateur

    def direct(self, url):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html", "Accept-Language": "bg,en;q=0.8"}), timeout=30) as r:
                if not permis(r.geturl()): return None, None
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            corps = e.read().decode("utf-8", "replace") if e.fp else ""
            if e.code == 403 and (e.headers.get("cf-mitigated") or "Just a moment" in corps): return "defi", None
            return e.code, None
        except Exception as e:
            print("Lecture impossible :", url, e); return None, None

    def lire(self, urls):
        urls = [u for u in urls if permis(u)]
        out = {}
        if not self.nav:
            for u in urls:
                st, corps = self.direct(u)
                if st == "defi": print("Cloudflare refuse la lecture directe : passage par le navigateur."); self.nav = True; break
                out[u] = corps if st == 200 else None
            else:
                return out
        reste = [u for u in urls if u not in out or out[u] is None]
        out.update(self.navigateur(reste))
        return out

    def navigateur(self, urls):
        if not urls: return {}
        tmp = tempfile.mkdtemp(prefix="bg-cik-")
        try:
            subprocess.run(["node", os.path.join(ICI, "navigateur.mjs"), tmp, *urls], check=False, timeout=60 * 15)
            out = {}
            for i, u in enumerate(urls):
                f = os.path.join(tmp, f"{i}.html")
                out[u] = open(f, encoding="utf-8", errors="replace").read() if os.path.exists(f) else None
            return out
        except Exception as e:
            print("Navigateur impossible :", e); return {u: None for u in urls}
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


# ---------- interprétation des pages (même logique que api/direct-bg.php) ----------
def nombre(t):
    t = re.sub(r"<[^>]+>", "", t or "").replace("&nbsp;", "").replace("\xa0", "")
    t = re.sub(r"\s+", "", t)
    return int(t) if t.isdigit() else None

def texte(t):
    t = re.sub(r"<[^>]+>", " ", t or "").replace("&nbsp;", " ").replace("&quot;", '"').replace("&amp;", "&")
    return re.sub(r"\s+", " ", t).strip()

def bloc_president(html):
    """Le bloc des résultats de la présidentielle (en 2021, le 1er tour avait aussi un onglet des législatives)."""
    onglets = re.findall(r'<li[^>]*data-elem="(\d+)"[^>]*>\s*<a href="#(t\d+)">([^<]*)</a>', html)
    cle = next((t for _, t, nom in onglets if "Президент" in nom), onglets[0][1] if onglets else None)
    if not cle: return html
    i = html.find(f'id="{cle}"')
    if i < 0: return html
    fin = html.find('class="item', i + 10)
    return html[i: fin if fin > 0 else len(html)]

def heure_donnees(html):
    m = re.search(r"Данни към (\d{1,2}):(\d{2}) на (\d{2})\.(\d{2})\.(\d{4})(?: г\.)? при обработени ([\d.,]+)\s*%", html)
    if not m: return None, None
    h, mi, j, mo, a, p = m.groups()
    d = dt.datetime(int(a), int(mo), int(j), int(h), int(mi), tzinfo=SOFIA)
    return d.isoformat(), float(p.replace(",", "."))

def lire_resultats(html):
    titre = texte((re.search(r'class="election-type">(.*?)</h4>', html, re.S) or [None, ""])[1])
    donnees, pct = heure_donnees(html)
    b = bloc_president(html)
    cands, nsp = [], None
    for cl, n, nom, comite, v in re.findall(r'<tr class="([^"]*)">\s*<td[^>]*>\s*<strong>\s*(\d+|-)\s*</strong>\s*</td>\s*<td>\s*<strong>(.*?)</strong>\s*(?:<br\s*/?>)?(.*?)</td>\s*<td class="text-right" data-sort="(\d+)"', b, re.S):
        if n == "-": nsp = int(v); continue
        cands.append({"n": int(n), "nom": texte(nom), "comite": texte(comite), "v": int(v), "elu": "elected" in cl})
    proto = {}
    for lab, val in re.findall(r"<tr>\s*<td>\s*(\d\.[^<]*?)</td>\s*<td[^>]*>([\d\s&nbsp;\xa0]+)</td>", b):
        k = {"1": "liste", "2": "ajoutes", "3": "votants", "6": "nuls", "7": "valides"}.get(lab[0]) if re.match(r"\d\. ", lab) else None
        if k and k not in proto: proto[k] = nombre(val)
    if proto.get("liste") is not None: proto["inscrits"] = proto["liste"] + (proto.get("ajoutes") or 0)
    sic = re.search(r"В\. Брой на СИК, предали протокол\s*</td>\s*<td[^>]*>([^<]+)", b)
    final = donnees is None and bool(cands) and bool(proto)
    return {"titre": titre, "donnees": donnees, "pct": 100.0 if final else pct, "final": final, "cands": cands, "nsp": nsp,
            "proto": proto or None, "sic": nombre(sic.group(1)) if sic else None}

def lire_activite(html):
    L = []
    for h, ins, vot, p in re.findall(r"<td[^>]*>\s*(\d{1,2}:\d{2})\s*</td>\s*<td[^>]*>([^<]+)</td>\s*<td[^>]*>([^<]+)</td>\s*<td[^>]*>\s*([\d.,]+)\s*%", html or ""):
        if nombre(ins) and nombre(vot) is not None: L.append({"h": h, "inscrits": nombre(ins), "votants": nombre(vot), "pct": float(p.replace(",", "."))})
    return L

def assembler(base, pages, tour):
    nat = pages.get(base + "rezultati/index.html")
    if not nat or "election-type" not in nat: return None
    r = lire_resultats(nat)
    act = lire_activite(pages.get(base + "aktivnost/index.html"))
    if not r["cands"] and not act: return None                    # avant la fermeture : la participation seule
    mir = {}
    for k in range(1, NB_MIR + 1):
        p = pages.get(base + f"rezultati/{k:02d}.html")
        if not p: continue
        x = lire_resultats(p)
        actk = lire_activite(pages.get(base + f"aktivnost/{k:02d}.html")) if k < NB_MIR else []
        if not x["cands"] and not actk: continue
        fin = x["donnees"] is None and (r["final"] or (r["pct"] or 0) >= 100)
        mir[str(k)] = {"pct": 100.0 if fin else x["pct"], "final": fin, "v": {str(c["n"]): c["v"] for c in x["cands"]}, "nsp": x["nsp"],
                       "activite": actk}
    return {"disponible": True, "maj": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "source": base, "tour": tour,
            "titre": r["titre"], "donnees": r["donnees"], "pct": r["pct"], "final": r["final"], "sic": r["sic"],
            "cands": r["cands"], "nsp": r["nsp"], "proto": r["proto"], "activite": act, "mir": mir}

def adresses(base):
    L = [base + "rezultati/index.html", base + "aktivnost/index.html"]
    L += [base + f"rezultati/{k:02d}.html" for k in range(1, NB_MIR + 1)]
    L += [base + f"aktivnost/{k:02d}.html" for k in range(1, NB_MIR)]
    return L


# ---------- adresse du 2e tour ----------
def est_tour2(html):
    t = texte((re.search(r'class="election-type">(.*?)</h4>', html or "", re.S) or [None, ""])[1])
    return bool(re.search(r"втори тур|1 ноември 2026|01\.11\.2026", t))

def trouver_tour2(lec):
    memo = os.path.join(tempfile.gettempdir(), "bg-cik-tour2.txt")       # adresse trouvée, gardée 10 minutes (boucle du workflow)
    try:
        if dt.datetime.now().timestamp() - os.path.getmtime(memo) < 600: return open(memo).read().strip() or None
    except OSError: pass
    b = chercher_tour2(lec)
    if b: open(memo, "w").write(b)
    return b

def chercher_tour2(lec):
    idx = lec.lire([RACINE]).get(RACINE) or ""
    bases = []
    for chemin in re.findall(r'href="(?:https://results\.cik\.bg)?/?(pvr2026[^"#?]*?/)rezultati/index\.html"', idx):
        b = RACINE + chemin.lstrip("/")
        if b != TOUR1 and b not in bases: bases.append(b)
    for b in bases + [RACINE + e for e in ESSAIS2 if RACINE + e not in bases] + [TOUR1]:
        p = lec.lire([b + "rezultati/index.html"]).get(b + "rezultati/index.html")
        if p and est_tour2(p): print("2e tour :", b); return b
    return None


def ecrire(chemin, d):
    try: avant = json.load(open(chemin, encoding="utf-8"))
    except (OSError, ValueError): avant = {}
    sans = lambda x: {k: v for k, v in x.items() if k != "maj"}
    if avant and sans(avant) == sans(d): print("Aucun changement."); return
    with open(chemin, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{chemin} mis à jour : {len(d.get('mir', {}))} circonscriptions, {d.get('pct')} % des protocoles.")


def main():
    arg = sys.argv[1:]
    val = lambda o, d=None: arg[arg.index(o) + 1] if o in arg and arg.index(o) + 1 < len(arg) else d
    lec = Lecteur(navigateur="--navigateur" in arg)
    if "--demo" in arg:
        an = val("--demo", "2021"); base = DEMO[an]
        d = assembler(base, lec.lire(adresses(base)), 2)
        if not d: print("Démo illisible."); return
        d["demo"] = an; ecrire(os.path.join(DOSSIER, f"demo-{an}.json"), d); return
    tour = int(val("--tour", "2"))
    maintenant = dt.datetime.now(dt.timezone.utc)
    if "--force" not in arg and not (FENETRE[tour][0] <= maintenant <= FENETRE[tour][1]):
        print("Hors de la période des résultats : rien à lire."); return
    sortie = os.path.join(DOSSIER, "resultats.json" if tour == 2 else "tour1.json")
    base = TOUR1 if tour == 1 else trouver_tour2(lec)
    if not base: print("Pages du 2e tour introuvables pour le moment : fichier inchangé."); return
    d = assembler(base, lec.lire(adresses(base)), tour)
    if not d: print("La CIK ne répond pas (ou page illisible) : fichier inchangé."); return
    d["via"] = "pipeline"
    ecrire(sortie, d)


if __name__ == "__main__":
    main()
