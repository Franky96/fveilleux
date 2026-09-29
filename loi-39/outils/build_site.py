"""Génère la page publiée, la version autonome et le kit d'intégration à partir de page.author.html."""
import re, os, json, shutil

SRC = open("page.author.html", encoding="utf-8").read()
from pathlib import Path
HERE = Path(__file__).resolve().parent
KIT = os.environ.get("LOI39_KIT", str(HERE.parent))
AUTONOME = os.environ.get("LOI39_AUTONOME", str(Path(KIT).parent / "loi39-simulation.html"))

# --- Découpage ---
head = SRC[:SRC.index("<style>")]
css = SRC[SRC.index("<style>") + 7 : SRC.index("</style>")]
body_start = SRC.index('<div class="wrap">')
d3_tag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>'
markup = SRC[body_start : SRC.index(d3_tag)].strip()
js = SRC[SRC.index('<script type="module">') + len('<script type="module">') : SRC.rindex("</script>")]

# --- Identifiants préfixés l39- ---
def prefix_ids(s):
    s = re.sub(r'(\s)id="', r'\1id="l39-', s)
    s = re.sub(r'(\s)for="', r'\1for="l39-', s)
    s = re.sub(r'aria-labelledby="', 'aria-labelledby="l39-', s)
    s = re.sub(r'href="#(h-[a-z]+)"', r'href="#l39-\1"', s)   # liens internes vers les titres
    s = s.replace('getElementById("', 'getElementById("l39-')
    s = re.sub(r'#(map|fsBtn|partyChips)\b', r'#l39-\1', s)
    return s
markup, js, css = prefix_ids(markup), prefix_ids(js), prefix_ids(css)

# --- JS : racine configurable ---
old_fetch = 'const DATA = await (await fetch("data.json")).json();'
assert old_fetch in js
js = js.replace(old_fetch,
    'const ROOT = document.querySelector(".loi39");\n'
    'const DATA = window.LOI39_DATA ?? await (await fetch(ROOT.dataset.src || "data.json")).json();')
js = js.replace('document.querySelector(".zoombar")', 'ROOT.querySelector(".zoombar")')
js = js.replace('document.querySelector(".mapgrid")', 'ROOT.querySelector(".mapgrid")')
assert js.count('document.querySelector(') == 1  # seulement ROOT

# --- CSS limité à .loi39 ---
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
def scope_sel(sel):
    sel = sel.strip()
    if sel.startswith(':root:not([data-theme="light"])'): return ':root:not([data-theme="light"]) .loi39'
    if sel.startswith(':root[data-theme="dark"]'): return ':root[data-theme="dark"] .loi39'
    if sel == ":root" or sel == "body": return ".loi39"
    if sel == "*": return ".loi39, .loi39 *"
    return ".loi39 " + sel
def scope(block):
    out, i = [], 0
    while i < len(block):
        j = block.find("{", i)
        if j < 0: out.append(block[i:]); break
        prelude = block[i:j].strip()
        depth, k = 1, j + 1
        while depth:
            depth += {"{": 1, "}": -1}.get(block[k], 0); k += 1
        inner = block[j + 1 : k - 1]
        if prelude.startswith("@media"):
            out.append(f"{prelude}{{\n{scope(inner)}}}\n")
        else:
            sels = ",".join(scope_sel(s) for s in prelude.split(","))
            out.append(f"{sels}{{{inner.strip()}}}\n")
        i = k
    return "".join(out)
scoped_css = scope(css)
scoped_css = scoped_css.replace(".loi39{box-sizing", ".loi39{box-sizing")  # no-op, lisibilité

page_bg = """body{margin:0;background:#F1F3F7}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) body{background:#0C1019}}
:root[data-theme="dark"] body{background:#0C1019}"""
fonts = head[head.index("<link"):].strip()
title = head[: head.index("<link")].strip()

def page(data_inline=None):
    data_js = f"<script>window.LOI39_DATA = {data_inline};</script>\n" if data_inline else ""
    return (f"{title}\n{fonts}\n<style>\n{page_bg}\n</style>\n<style>\n{scoped_css}</style>\n\n"
            f'<div class="loi39" data-src="data.json">\n{markup}\n</div>\n\n'
            f'{d3_tag}\n{data_js}<script type="module">{js}</script>\n')

data = open("data.json", encoding="utf-8").read()
open("page.src.html", "w", encoding="utf-8").write(page())
open("check.mjs", "w", encoding="utf-8").write(js)
open(AUTONOME, "w", encoding="utf-8").write(
    "<!doctype html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
    + page(data).replace(f'<div class="loi39"', '</head>\n<body>\n<div class="loi39"', 1) + "</body>\n</html>\n")

# --- Kit ---
os.makedirs(KIT, exist_ok=True)
open(f"{KIT}/loi39.css", "w", encoding="utf-8").write(
    "/* Simulation loi 39 : tout est limité au conteneur .loi39 */\n" + scoped_css)
open(f"{KIT}/loi39.js", "w", encoding="utf-8").write(
    "// Simulation loi 39 : à charger avec type=\"module\", après d3 (global).\n" + js.strip() + "\n")
shutil.copy("data.json", f"{KIT}/data.json")
fragment = f'<div class="loi39" data-src="data.json">\n{markup}\n</div>\n'
open(f"{KIT}/fragment.html", "w", encoding="utf-8").write(fragment)
open(f"{KIT}/exemple.html", "w", encoding="utf-8").write(f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{title}
{fonts}
<link rel="stylesheet" href="loi39.css">
<style>body{{margin:0}}</style>
</head>
<body>
<!-- Votre en-tête de site ici -->
{fragment}
<!-- Votre pied de page ici -->
{d3_tag}
<script type="module" src="loi39.js"></script>
</body>
</html>
""")
print("ok", len(scoped_css))
