"""Lecture des tableaux d'une page Wikipédia (HTML rendu, action=render) : bibliothèque standard seulement.
tableaux(page) → [{titre (dernier intertitre avant le tableau), titres (intertitre en cours à chaque niveau : {"h2": …, "h3": …}), classe, lignes: [[texte de chaque cellule]…]}],
avec colspan et rowspan dépliés (une cellule fusionnée est répétée dans chaque case qu'elle couvre).
"""
import re
from html.parser import HTMLParser
class P(HTMLParser):
    """Tableaux d'une page Wikipédia : [{titre, lignes: [[cellule…]…]}], cellule = (texte, colspan, rowspan, est_th)."""
    def __init__(s):
        super().__init__(convert_charrefs=True); s.tables = []; s.pile = []; s.titre = ""; s.titres = {}; s.h = None; s.htxt = ""; s.cell = None; s.skip = 0
    def handle_starttag(s, tag, a):
        a = dict(a)
        if tag in ("h2", "h3", "h4", "h5"): s.h = tag; s.htxt = ""
        elif tag == "table": s.pile.append({"titre": s.titre, "titres": dict(s.titres), "classe": a.get("class") or "", "lignes": []})
        elif s.pile and tag == "tr": s.pile[-1]["lignes"].append([])
        elif s.pile and tag in ("td", "th"):
            s.cell = {"t": "", "cs": int(re.sub(r"\D", "", a.get("colspan") or "1") or 1), "rs": int(re.sub(r"\D", "", a.get("rowspan") or "1") or 1), "th": tag == "th"}
        elif tag in ("sup", "style", "script") : s.skip += 1
        elif tag == "br" and s.cell is not None: s.cell["t"] += " "
    def handle_endtag(s, tag):
        if tag in ("h2", "h3", "h4", "h5") and s.h == tag:
            s.titre = re.sub(r"\s+", " ", s.htxt).strip(); s.h = None
            s.titres = {k: v for k, v in s.titres.items() if k < tag}; s.titres[tag] = s.titre
        elif tag == "table" and s.pile: s.tables.append(s.pile.pop())
        elif tag in ("td", "th") and s.cell is not None and s.pile:
            if s.pile[-1]["lignes"]: s.pile[-1]["lignes"][-1].append(s.cell)
            s.cell = None
        elif tag in ("sup", "style", "script") and s.skip: s.skip -= 1
    def handle_data(s, d):
        if s.skip: return
        if s.h: s.htxt += d
        if s.cell is not None: s.cell["t"] += d
def tableaux(page):
    p = P(); p.feed(page)
    out = []
    for t in p.tables:
        grille, att = [], {}                      # rowspan en attente : col -> (texte, restant)
        for ligne in t["lignes"]:
            r, col = [], 0
            cells = list(ligne); k = 0
            while k < len(cells) or col in att:
                if col in att:
                    txt, n = att[col]; r.append(txt)
                    if n <= 1: del att[col]
                    else: att[col] = (txt, n - 1)
                    col += 1; continue
                c = cells[k]; k += 1
                txt = re.sub(r"\s+", " ", c["t"]).strip()
                for j in range(c["cs"]):
                    r.append(txt)
                    if c["rs"] > 1: att[col] = (txt, c["rs"] - 1)
                    col += 1
            grille.append(r)
        out.append({"titre": t["titre"], "titres": t["titres"], "classe": t["classe"], "lignes": grille})
    return out
