"""Élections locales à Taïwan : démo du lecteur des résultats avec l'élection de 2022 (en-direct/taiwan/demo-2022.json).

Le site des résultats de 2022 (www.cec.gov.tw/zh-TW/TC/<code>.html) n'est plus en ligne : on refait ses 22 pages au format des pages de
résultats de la Commission électorale centrale (en-tête « 已送投票所數/總投票所數 », tableau tablesaw des candidats : numéro, nom, sexe,
voix en td.numeric, pourcentage, parti « … 推薦 », marque « 當選 » ; tableau des votes valides ; « 資料時間 »), d'après le gabarit des pages
du référendum de 2025 (vote.cec.gov.tw/zh-TW/F1/…) et du direct de 2024 (vote2024.cec.gov.tw/zh-TW/P1/…), avec les résultats officiels de 2022
de courses.json. Même forme que la sortie du relais (api/direct-tw.php) : le lecteur de direct.js les lit comme le soir du vote.
Nombre de bureaux par comté : celui du référendum du 23 août 2025 (le total de 2022, 17 648, en diffère d'environ 1 %).

Usage : python3 en-direct/taiwan/outils/demo.py
"""
import csv, html, io, json, os, re, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
COURSES = os.path.normpath(os.path.join(ICI, "..", "courses.json"))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "demo-2022.json"))
CSV2022 = "https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/data/elections/2022.csv"
BUREAUX = {"63000": 1760, "65000": 2683, "68000": 1388, "66000": 1898, "67000": 1547, "64000": 2056, "10017": 283, "10018": 356, "10004": 482,
           "10005": 484, "10007": 1083, "10008": 493, "10009": 620, "10020": 196, "10010": 536, "10013": 732, "10002": 432, "10014": 236,
           "10015": 339, "10016": 121, "09020": 95, "09007": 12}
MUN = {"63000", "65000", "68000", "66000", "67000", "64000"}


def sexes():
    try:
        with urllib.request.urlopen(urllib.request.Request(CSV2022, headers={"User-Agent": "fveilleux.com"}), timeout=120) as r:
            return {re.sub("[-]", "", l["cand_name"]): ("男" if l["cand_sex"] == "m" else "女") for l in csv.DictReader(io.StringIO(r.read().decode("utf-8")))}
    except Exception:
        return {}


def page(code, c, sx):
    r = c["r22"]; b = BUREAUX[code]; e = html.escape
    titre = f"111年{'直轄市長' if code in MUN else '縣市長'}選舉 候選人得票數 - {c['zh']}"
    lignes = "".join(f"""
        <tr>
            <td class="numeric">{k['no']}</td>
            <td><div>{e(k['zh'])}</div></td>
            <td>{sx.get(k['zh'], '')}</td>
            <td class="numeric">{k['voix']:,}</td>
            <td class="numeric">{k['pct']:.2f}</td>
            <td><div>{e(k['aff'])}{'' if k['aff'] == '無黨籍' else ' 推薦'}</div></td>
            <td>{'<img src="../assets/img/elected.png" alt="當選" title="當選" />' if k.get('elu') else ''}</td>
        </tr>""" for k in sorted(r["cands"], key=lambda k: k["no"]))
    heure = "12/18 19:45" if code == "10020" else "11/26 21:30"
    return f"""<div id="vote-table-header">
    <div class="vote-table-header-title">
<img src="../assets/img/search.png" alt="search" title="search" /> <b>{e(titre)}</b>    </div>
    <div class="vote-table-header-subtitle">
<div class="bullet"> <img src="../assets/img/nav.gif" />已送投票所數/總投票所數: {b}/{b} </div>    </div>
</div>
<div id="vote-table-content">
<table class="tablesaw">
    <thead><tr><th scope="col">號次</th><th scope="col">姓名</th><th scope="col">性別</th><th scope="col">得票數</th><th scope="col">得票率%</th><th scope="col">推薦政黨</th><th scope="col">當選註記</th></tr></thead>
    <tbody>{lignes}
    </tbody>
</table>
<table class="tablesaw">
    <thead><tr><th scope="col">有效票數</th></tr></thead>
    <tbody><tr><td class="numeric">{r['valides']:,}</td></tr></tbody>
</table>
</div>
<div id="vote-table-footer">
    <div class="vote-table-footer-right">
<img src="../assets/img/clock2.png" alt="clock">&nbsp;
    <span>資料時間:&nbsp;{heure}</span>
    </div>
</div>"""


def main():
    d = json.load(open(COURSES, encoding="utf-8"))
    sx = sexes()
    pages = [{"url": f"https://www.cec.gov.tw/zh-TW/TC/{code}{'0' * 12}.html", "code": code, "type": "html", "corps": page(code, c, sx)}
             for code, c in d["courses"].items()]
    out = {"disponible": True, "demo": 2022, "maj": "2022-11-26T21:30:00+08:00", "source": "https://www.cec.gov.tw/zh-TW/TC/00000000000000000.html",
           "note": "Pages refaites au format du site de la CEC avec les résultats officiels de 2022 (outils/demo.py).", "pages": pages}
    with open(SORTIE, "w", encoding="utf-8") as f: json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(pages)} pages : {SORTIE}")


if __name__ == "__main__":
    main()
