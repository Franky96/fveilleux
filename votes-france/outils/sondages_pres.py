"""Présidentielle 2027 : intentions de vote au 1er tour (Wikipédia anglais, « Opinion polling for the 2027 French presidential
election », qui cite la notice de chaque sondage) → ../sondages-pres.json

Chaque sondage teste plusieurs scénarios (listes de candidats différentes) : on garde le premier, comme Wikipédia le
présente en tête. Les tableaux du 1er tour sont lus un par un (chacun a sa propre liste de candidats).
Usage : /usr/bin/python3 sondages_pres.py   (dans le dossier outils/)
"""
import json, os, re, urllib.request


def verifie(page):
    """Date et heure de la vérification (heure de Montréal) dans /votes-verif.json : affichée sur la page même si rien n'a changé."""
    import datetime, json as _j, os as _o, zoneinfo
    f = _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), "..", "..", "votes-verif.json")
    v = _j.load(open(f, encoding="utf-8")) if _o.path.exists(f) else {}
    h = datetime.datetime.now(zoneinfo.ZoneInfo("America/Montreal")); a = h.date()
    m = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    v[page] = {"date": a.isoformat(), "heure": h.strftime("%H:%M"), "texte": f"{a.day} {m[a.month - 1]} {a.year} à {h.hour} h {h.minute:02d}"}
    _j.dump(dict(sorted(v.items())), open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

ICI = os.path.dirname(os.path.abspath(__file__))
URL = "https://en.wikipedia.org/w/index.php?title=Opinion_polling_for_the_2027_French_presidential_election&action=raw"
HDR = {"User-Agent": "fveilleuxBot/1.0 (https://fveilleux.com; franky.veilleux@gmail.com)"}
MOIS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
# parti (modèle {{party color|…}} de Wikipédia) → étiquette et couleur de la page
PARTI = {
    "Lutte Ouvrière": ("LO", "#7A1A1A"), "New Anticapitalist Party": ("NPA", "#8E1B1B"), "French Communist Party": ("PCF", "#B5172B"),
    "La France Insoumise": ("LFI", "#C00D0D"), "Picardie debout": ("Picardie debout", "#D95F43"),
    "Europe Ecology – The Greens": ("Écologistes", "#3E9B4F"), "The Ecologists (France)": ("Écologistes", "#3E9B4F"),
    "Republican and Socialist Left": ("GRS", "#B04060"), "Socialist Party (France)": ("PS", "#E8579A"), "Place Publique": ("Place publique", "#E0458A"),
    "Together (coalition)": ("Ensemble", "#F5A623"), "Renaissance (French political party)": ("Renaissance", "#F5A623"),
    "Horizons (political party)": ("Horizons", "#2AA7DE"), "United Republic": ("République unie", "#8E7CC3"),
    "Democratic Movement (France)": ("MoDem", "#F07E26"), "The Republicans (France)": ("LR", "#1B5FB0"),
    "Debout la France": ("DLF", "#5C7BA8"), "National Rally (France)": ("RN", "#4656B0"), "National Rally": ("RN", "#4656B0"),
    "Reconquête (political party)": ("Reconquête", "#8C6B3E"),
    "The Ecologists": ("Écologistes", "#3E9B4F"), "Debout !": ("Debout !", "#D95F43"), "La Convention": ("La Convention", "#E8579A"),
    "Independent politician": ("Indépendant", "#8D949A"), "Nous France": ("Nous France", "#1B5FB0"), "Résistons": ("Résistons", "#8D949A"),
    "Reconquête": ("Reconquête", "#8C6B3E"),
}


def sans_modeles(s):
    s = re.sub(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    while True:
        t = re.sub(r"\{\{(?!Opdrts)[^{}]*\}\}", "", s)
        if t == s: return t
        s = t


def cellule(ligne):
    s, prof = ligne[1:], 0
    for i, c in enumerate(s):
        if c in "{[": prof += 1
        elif c in "}]": prof -= 1
        elif c == "|" and prof == 0 and i + 1 < len(s) and s[i + 1] != "|":
            return s[:i], s[i + 1:]
    return "", s


def date_de(txt):
    m = re.search(r"\{\{Opdrts\|([^}]*)\}\}", txt)
    if m:
        p = [x for x in m[1].split("|") if x and x != "year"]
        mois = [x for x in p if x[:3].lower() in MOIS]
        an = [x for x in p if re.fullmatch(r"\d{4}", x)]
        jours = [x for x in p if re.fullmatch(r"\d{1,2}", x)]
        if mois and an and jours: return f"{an[-1]}-{MOIS[mois[-1][:3].lower()]:02d}-{int(jours[-1]):02d}"
    m = re.search(r"(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})", txt)
    return f"{m[3]}-{MOIS[m[2].lower()]:02d}-{int(m[1]):02d}" if m and m[2].lower() in MOIS else None


texte = urllib.request.urlopen(urllib.request.Request(URL, headers=HDR), timeout=60).read().decode("utf-8")
premier = texte[texte.find("== First round =="): texte.find("== Second round ==")]
sondages, candidats, REJETS = [], {}, []
for table in re.findall(r"\{\|.*?\n\|\}", premier, flags=re.S):
    # en-têtes : « vert header|…|[[Nom]] » ou « …|[[Nom]] [[Parti|(SIGLE)]] » (ancien tableau)
    tetes = re.findall(r"vert header\|mw=[^|]*\|stp=1\|([^\n]*?)\}\}\s*\n", table)
    noms, partis_lien = [], []
    for t in tetes:
        liens = re.findall(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", t)
        if not liens: continue
        noms.append(liens[0].strip()); partis_lien.append(liens[1].strip() if len(liens) > 1 else "")
    partis = re.findall(r"party color\|([^}]+)\}\}", table)[:len(noms)]
    if len(partis) != len(noms): partis = partis_lien
    if not noms: continue
    for n, p in zip(noms, partis):
        lab, coul = PARTI.get(p.strip(), (p.strip(), "#8D949A"))
        candidats.setdefault(n, {"parti": lab, "c": coul})
    for bloc in table.split("\n|-")[1:]:
        lignes = [l for l in bloc.split("\n") if l.startswith("|") and not l.startswith("|-") and not l.startswith("|}")]
        if len(lignes) < 3 + len(noms) // 2: continue
        cell = [cellule(l) for l in lignes]
        d = date_de(cell[1][0] + cell[1][1])
        if not d: continue                                  # scénario suivant d'un même sondage (pas de firme ni de date)
        firme = sans_modeles(cell[0][1])
        firme = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", firme)
        firme = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", firme).strip()
        ech = re.sub(r"[^\d]", "", sans_modeles(cell[2][1]))
        vals, col = {}, 0
        for attrs, contenu in cell[3:]:
            if col >= len(noms): break
            n = int(re.search(r'colspan="?(\d+)', attrs)[1]) if "colspan" in attrs else 1
            v = re.search(r"(\d+(?:\.\d+)?)\s*%", sans_modeles(contenu).replace("'", ""))
            if v and n == 1: vals[noms[col]] = float(v[1])
            col += n
        if col < len(noms) or not 85 <= sum(vals.values()) <= 102 or not firme:
            REJETS.append((d, firme, col, len(noms), sum(vals.values()))); continue
        sondages.append({"d": d, "f": firme, "n": ech, "v": vals})

sondages.sort(key=lambda s: s["d"])
if "-v" in __import__("sys").argv: print(*REJETS[:40], sep="\n")
if len(sondages) < 30: raise SystemExit(f"Seulement {len(sondages)} sondages lus : sondages-pres.json inchangé.")
utilises = {n for s in sondages for n in s["v"]}
json.dump({"source": "Wikipédia, « Opinion polling for the 2027 French presidential election » (notices de la Commission des sondages)",
           "candidats": {n: c for n, c in candidats.items() if n in utilises}, "sondages": sondages},
          open(os.path.join(ICI, "..", "sondages-pres.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(sondages)} sondages · du {sondages[0]['d']} au {sondages[-1]['d']} · {len(utilises)} candidats · dernier : {sondages[-1]['f']}")
verifie("france")
