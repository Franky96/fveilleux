"""Derniers sondages des élections générales espagnoles du 29 novembre 2026 pour en-direct/espagne/direct.js.

Source : Wikipédia (anglais), « Opinion polling for the 2026 Spanish general election » (CC BY-SA 4.0), qui compile les sondages publiés
par les maisons de sondage et les médias (lien vers chaque article gardé). Tableaux « 2026 (with Broad Front) » puis « 2026 (before
Broad Front) » (Sumar à la place du Frente Amplio). Les sondages commandés par un parti sont écartés. Garde les 10 plus récents.
La loi électorale (LOREG, art. 69.7) interdit de publier des sondages en Espagne à partir du 24 novembre.

Usage : python3 en-direct/espagne/outils/sondages.py      (écrit en-direct/espagne/sondages.json)
"""
import json, os, re, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "sondages.json"))
PAGE = "Opinion_polling_for_the_2026_Spanish_general_election"
URL = f"https://en.wikipedia.org/w/index.php?title={PAGE}&action=raw"
TABLES = ["=====2026 (with Broad Front)=====", "=====2026 (before Broad Front)====="]
COLS = {"pp": "PP", "psoe": "PSOE", "vox": "Vox", "fa": "FA", "sumar": "Sumar", "erc": "ERC", "junts": "Junts", "bildu": "EH Bildu", "pnv": "PNV",
        "bng": "BNG", "cc": "CCa", "upn": "UPN", "adelante": "Adelante", "podemos": "Podemos", "salf": "SALF", "ac": "Aliança"}
PARTIS = {"PSOE", "PP", "VOX", "SUMAR", "PODEMOS", "ERC", "JUNTS"}
MOIS_FR = ["", "janv.", "févr.", "mars", "avril", "mai", "juin", "juill.", "août", "sept.", "oct.", "nov.", "déc."]
MOIS = {"January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6, "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12}


def entetes(corps):
    out = []
    for l in re.findall(r"^! style=\"width:\d+px;\"\| (.+)$", corps, re.M):
        for k, mot in COLS.items():
            if re.search(r"\b" + re.escape(mot), l, re.I) and not re.search(r"Polling|Fieldwork|Sample|Turnout|Lead", l):
                out.append(k); break
        else:
            if not re.search(r"Polling|Fieldwork|Sample|Turnout|Lead", l): out.append("?")
    return out


def cellule(l):
    l = re.sub(r"\{\{efn[^}]*\}\}", "", l); l = re.sub(r"<!--.*?-->", "", l)
    v = re.sub(r"^\|\s*(\{\{Party shading/[^}]*\}\}\|)?\s*", "", l).strip()
    m = re.match(r"'*([\d.,?–]+)'*(?:<br/>\{\{font\|[^}]*text=([\d/]+)\}\})?", v)
    return (m.group(1), m.group(2)) if m else (v, None)


def lire_table(texte, debut):
    s = texte.index(debut); e = texte.index("\n|}", s); corps = texte[s:e]
    cols = entetes(corps)
    for r in corps.split("\n|-\n")[1:]:
        lignes = [l for l in r.split("\n") if l.startswith("|")]
        if len(lignes) < 6: continue
        tete = lignes[0]
        firme = re.sub(r"<ref.*", "", tete[1:]).strip()
        if firme.upper() in PARTIS: continue                     # sondage commandé par un parti
        g = lambda k: (re.search(k + r"=([^|}]+)", tete) or [None, None])[1]
        cells = [cellule(l) for l in lignes[1:]]
        date, n, part = cells[0][0], cells[1][0], cells[2][0]
        v, sieges = {}, {}
        for k, (x, e2) in zip(cols, cells[3:]):
            if k == "?": continue
            if re.fullmatch(r"\d+(\.\d+)?", x or ""): v[k] = float(x)
            if e2: sieges[k] = e2
        pub = (g(r"\|date") or "").strip()
        m = re.search(r"([A-Z][a-z]+)", date) or re.search(r"([A-Z][a-z]+)", pub)  # « 17–23 » : mois de la publication
        date = re.sub(r"[A-Z][a-z]+", "", date).strip() + " " + MOIS_FR[MOIS[m.group(1)]] if m and m.group(1) in MOIS else date
        yield {"s": firme, "d": date, "pub": pub, "n": int(n.replace(",", "")) if re.fullmatch(r"[\d,]+", n or "") else None,
               "url": (g("url") or "").strip(), "titre": (g("title") or "").strip(), "media": (g("work") or "").strip(), "v": v, "e": sieges,
               "fa": "fa" in v or "fa" in sieges}


def main():
    texte = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "fveilleux.com (sondages)"}), timeout=60).read().decode("utf-8")
    L = []
    for t in TABLES:
        for p in lire_table(texte, t):
            L.append(p)
            if len(L) >= 10: break
        if len(L) >= 10: break
    d = {"source": f"https://en.wikipedia.org/wiki/{PAGE}", "licence": "CC BY-SA 4.0", "sondages": L}
    with open(SORTIE, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, indent=1)
    print(len(L), "sondages :", SORTIE)


if __name__ == "__main__":
    main()
