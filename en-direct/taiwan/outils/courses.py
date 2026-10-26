"""Élections locales à Taïwan du 28 novembre 2026 (九合一) : les 22 courses de maire et de chef de comté (en-direct/taiwan/courses.json).

Candidatures : enregistrement du 31 août au 4 septembre 2026, listes de l'Agence centrale de presse (CNA, « 2026九合一選舉 22縣市長登記參選名單一次看 »,
4 septembre 2026) et de Focus Taiwan (« 2026 local elections: County, city head candidates », 7 septembre 2026, romanisations reprises de là).
Numéros sur le bulletin (號次) : tirés au sort le 23 octobre (reporté au 27 dans les villes fermées par le typhon) ; pas encore relevés ici (null).
Résultats de 2022 : base de données électorale de la Commission électorale centrale (db.cec.gov.tw), lue dans la copie CSV de Finjon Kiang
(github.com/kiang/db.cec.gov.tw, data/elections/2022.csv : db.cec.gov.tw refuse les connexions venant de l'étranger) ; Chiayi (ville), vote reporté
au 18 décembre 2022 après le décès d'un candidat, absent de ce fichier : chiffres de la CEC repris par Wikipédia.
La population (champ pop) est ajoutée ensuite par population.py.

Usage : python3 en-direct/taiwan/outils/courses.py && python3 en-direct/taiwan/outils/population.py
"""
import csv, io, json, os, re, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "courses.json"))
CSV2022 = "https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/data/elections/2022.csv"

# parti selon le libellé de la CEC
def parti(aff):
    if "國民黨" in aff: return "kmt"
    if "民主進步黨" in aff: return "dpp"
    if "民眾黨" in aff or "民衆黨" in aff: return "tpp"
    if "無黨籍" in aff or "未經政黨推薦" in aff: return "ind"
    return "aut"

AFF = {"kmt": "中國國民黨", "dpp": "民主進步黨", "tpp": "台灣民眾黨", "ind": "無黨籍"}

def C(zh, fr, p, bio="", aff=None, sortant=False):
    return {"zh": zh, "fr": fr, "p": p, "aff": aff or AFF.get(p, ""), "bio": bio, "no": None, **({"sortant": True} if sortant else {})}

# code de la CEC (5 premiers chiffres) : nom français, nom chinois, type (mun = municipalité spéciale, ville = ville provinciale, comte),
# titulaire actuel et candidatures de 2026 (ordre de l'enregistrement)
COURSES = {
 "63000": ("Taipei", "臺北市", "mun", ("蔣萬安", "Chiang Wan-an", "kmt", "se représente"), [
    C("蔣萬安", "Chiang Wan-an", "kmt", "Maire sortant, élu en 2022", sortant=True),
    C("沈伯洋", "Puma Shen (Shen Po-yang)", "dpp", "Député (liste nationale), ancien professeur de criminologie"),
    C("郭璽", "Kuo Hsi", "aut", "Capitaine de vaisseau à la retraite", "台灣麻將最大黨"),
    C("蕭文乾", "Hsiao Wen-chien", "aut", "", "台灣SoR無法黨"),
    C("唐新民", "Tang Hsin-min", "aut", "", "三勢團結促進聯盟"),
    C("林志成", "Lin Chih-cheng", "ind")]),
 "65000": ("Nouveau Taipei", "新北市", "mun", ("侯友宜", "Hou Yu-ih", "kmt", "limité à deux mandats"), [
    C("蘇巧慧", "Su Chiao-hui", "dpp", "Députée"),
    C("李四川", "Lee Shu-chuan", "kmt", "Ancien vice-maire de Taipei · candidat commun du KMT et du PPT (Huang Kuo-chang s'est retiré en avril)"),
    C("蘇輝湟", "Su Hui-huang", "ind")]),
 "68000": ("Taoyuan", "桃園市", "mun", ("張善政", "Chang San-cheng", "kmt", "se représente"), [
    C("張善政", "Chang San-cheng", "kmt", "Maire sortant, ancien premier ministre", sortant=True),
    C("黃世杰", "Huang Shih-chieh", "dpp", "Ancien vice-ministre de la Justice")]),
 "66000": ("Taichung", "臺中市", "mun", ("盧秀燕", "Lu Shiow-yen", "kmt", "limitée à deux mandats"), [
    C("何欣純", "Ho Hsin-chun", "dpp", "Députée"),
    C("江啟臣", "Johnny Chiang (Chiang Chi-chen)", "kmt", "Vice-président du Yuan législatif, ancien président du KMT"),
    C("洪麗華", "Hung Li-hua", "aut", "", "司法正義黨")]),
 "67000": ("Tainan", "臺南市", "mun", ("黃偉哲", "Huang Wei-che", "dpp", "limité à deux mandats"), [
    C("蕭燐洪", "Hsiao Lin-hung", "aut", "", "台灣SoR無法黨"),
    C("謝龍介", "Hsieh Lung-chieh", "kmt", "Député, candidat en 2018 et en 2022"),
    C("葉人文", "Yeh Jen-wen", "ind"),
    C("陳亭妃", "Chen Ting-fei", "dpp", "Députée")]),
 "64000": ("Kaohsiung", "高雄市", "mun", ("陳其邁", "Chen Chi-mai", "dpp", "limité à deux mandats"), [
    C("張靜", "Chang Ching", "aut", "", "司法改革黨"),
    C("賴瑞隆", "Lai Jui-lung", "dpp", "Député"),
    C("王肇民", "Wang Chao-min", "ind"),
    C("柯志恩", "Ko Chih-en", "kmt", "Députée, candidate en 2022"),
    C("洪方隆", "Hung Fang-lung", "ind")]),
 "10017": ("Keelung", "基隆市", "ville", ("謝國樑", "Hsieh Kuo-liang", "kmt", "se représente"), [
    C("謝國樑", "Hsieh Kuo-liang (George Hsieh)", "kmt", "Maire sortant", sortant=True),
    C("魏造文", "Wei Tsao-wen", "ind"),
    C("童子瑋", "Tung Tzu-wei", "dpp", "Président du conseil municipal")]),
 "10018": ("Hsinchu", "新竹市", "ville", ("高虹安", "Kao Hung-an", "ind", "se représente (élue sous l'étiquette du PPT en 2022)"), [
    C("高虹安", "Kao Hung-an (Ann Kao)", "ind", "Mairesse sortante, élue pour le PPT en 2022, sans parti depuis 2024 · soutenue par le KMT et le PPT", sortant=True),
    C("莊競程", "Chuang Ching-cheng", "dpp", "Ancien député, dirigeant du Taiwan Thinktank"),
    C("何志勇", "Ho Chih-yung", "ind", "Ancien porte-parole du KMT")]),
 "10004": ("comté de Hsinchu", "新竹縣", "comte", ("楊文科", "Yang Wen-ke", "kmt", "limité à deux mandats"), [
    C("鄭朝方", "Cheng Chao-fang", "dpp", "Maire de la ville de Zhubei"),
    C("朱定瑀", "Chu Ting-yu", "ind"),
    C("徐欣瑩", "Hsu Hsin-ying", "kmt", "Députée")]),
 "10005": ("comté de Miaoli", "苗栗縣", "comte", ("鍾東錦", "Chung Tung-chin", "kmt", "se représente (élu sans étiquette en 2022, revenu au KMT)"), [
    C("陳品安", "Chen Pin-an", "dpp", "Conseillère de comté"),
    C("鍾東錦", "Chung Tung-chin", "kmt", "Chef de comté sortant, élu sans étiquette en 2022", sortant=True)]),
 "10007": ("comté de Changhua", "彰化縣", "comte", ("王惠美", "Wang Hui-mei", "kmt", "limitée à deux mandats"), [
    C("陳重嘉", "Chen Chung-chia", "ind", "Conseiller de comté"),
    C("陳素月", "Chen Su-yueh", "dpp", "Députée"),
    C("邱建富", "Chiu Chien-fu", "ind", "Ancien maire de la ville de Changhua"),
    C("魏平政", "Wei Ping-cheng", "kmt", "Avocat, ancien président de la commission de discipline du KMT")]),
 "10008": ("comté de Nantou", "南投縣", "comte", ("許淑華", "Hsu Shu-hua", "kmt", "se représente"), [
    C("温世政", "Wen Shih-cheng", "dpp", "Dentiste"),
    C("許淑華", "Hsu Shu-hua", "kmt", "Cheffe de comté sortante", sortant=True)]),
 "10009": ("comté de Yunlin", "雲林縣", "comte", ("張麗善", "Chang Li-shan", "kmt", "limitée à deux mandats"), [
    C("吳炳輝", "Wu Ping-hui", "ind", "Avocat"),
    C("張嘉郡", "Alice Chang (Chang Chia-chun)", "kmt", "Députée, nièce de la cheffe de comté sortante"),
    C("劉建國", "Liu Chien-kuo", "dpp", "Député, candidat en 2022"),
    C("林佳瑜", "Lin Chia-yu", "ind")]),
 "10020": ("Chiayi", "嘉義市", "ville", ("黃敏惠", "Huang Min-hui", "kmt", "limitée à deux mandats"), [
    C("黃宏成台灣阿成世界偉人財神總統", "Huang Hung-chen", "ind", "Candidat de toutes les élections"),
    C("陳愷璜", "Chen Kai-huang", "ind", "Ancien recteur de l'Université nationale des arts de Taipei"),
    C("張啓楷", "Chang Chi-kai", "tpp", "Ancien député · soutenu par le KMT"),
    C("王美惠", "Wang Mei-hui", "dpp", "Députée"),
    C("王義成", "Wang Yi-cheng", "ind")]),
 "10010": ("comté de Chiayi", "嘉義縣", "comte", ("翁章梁", "Weng Chang-liang", "dpp", "limité à deux mandats"), [
    C("吳品叡", "Wu Pin-jui", "ind", "Maire de la ville de Puzi"),
    C("蔡易餘", "Tsai Yi-yu", "dpp", "Député")]),
 "10013": ("comté de Pingtung", "屏東縣", "comte", ("周春米", "Chou Chun-mi", "dpp", "se représente"), [
    C("蘇清泉", "Su Ching-chuan", "kmt", "Ancien député, candidat en 2018 et en 2022"),
    C("周春米", "Chou Chun-mi", "dpp", "Cheffe de comté sortante", sortant=True)]),
 "10002": ("comté de Yilan", "宜蘭縣", "comte", ("林姿妙", "Lin Zi-miao", "kmt", "limitée à deux mandats ; suspendue depuis sa condamnation de décembre 2024 (appel en cours), intérim par Lin Mao-sheng"), [
    C("陳宏毅", "Chen Hung-yi", "ind"),
    C("吳宗憲", "Wu Tsung-hsien", "kmt", "Député"),
    C("劉燦輝", "Liu Tsan-hui", "ind"),
    C("林國漳", "Lin Kuo-chang", "dpp", "Avocat"),
    C("楊鉯婷", "Yang Yi-ting", "ind")]),
 "10014": ("comté de Taitung", "臺東縣", "comte", ("饒慶鈴", "April Yao (Rao Ching-ling)", "kmt", "limitée à deux mandats"), [
    C("陳瑩", "Chen Ying", "dpp", "Députée"),
    C("吳秀華", "Wu Hsiu-hua", "kmt", "Présidente du conseil de comté"),
    C("李吳穎智", "Li Wu Ying-chih", "ind"),
    C("王志偉", "Wang Chih-wei", "ind")]),
 "10015": ("comté de Hualien", "花蓮縣", "comte", ("徐榛蔚", "Hsu Chen-wei", "kmt", "limitée à deux mandats"), [
    C("游淑貞", "Yu Shu-chen", "kmt", "Cheffe du canton de Ji'an"),
    C("張峻", "Chang Chun", "ind", "Président du conseil de comté"),
    C("魏嘉賢", "Wei Chia-hsien", "ind", "Conseiller de comté, ancien maire de la ville de Hualien"),
    C("羅佩秦", "Lo Pei-chin", "aut", "", "台灣工黨")]),
 "10016": ("comté de Penghu", "澎湖縣", "comte", ("陳光復", "Chen Kuang-fu", "dpp", "limité à deux mandats"), [
    C("吳淑瑾", "Wu Shu-chin", "dpp", "Épouse du chef de comté sortant"),
    C("陳振中", "Chen Chen-chung", "kmt", "Ancien chef du canton de Huxi"),
    C("周倪安", "Chou Ni-an", "aut", "Présidente de l'Union pour la solidarité de Taïwan", "台灣團結聯盟"),
    C("許智富", "Hsu Chih-fu", "ind", "Ancien chef de comté adjoint"),
    C("陳盡川", "Chen Chin-chuan", "ind"),
    C("葉竹林", "Yeh Chu-lin", "ind", "Ancien maire de Magong, 3e en 2022")]),
 "09020": ("comté de Kinmen", "金門縣", "comte", ("陳福海", "Chen Fu-hai", "ind", "ne peut se représenter (condamnation passée, loi électorale modifiée)"), [
    C("洪和成", "Hung Ho-chen", "ind"),
    C("陳玉珍", "Chen Yu-jen", "kmt", "Députée"),
    C("李文良", "Lee Wen-liang", "ind", "Ancien chef de comté adjoint"),
    C("黃世團", "Hwang Shyh-twan", "ind", "Artiste"),
    C("張國威", "Chang Kuo-wei", "ind", "Entrepreneur"),
    C("梁文韜", "Leung Man-to", "ind", "Professeur de science politique (Université nationale Cheng Kung)"),
    C("張火木", "Chang Huo-mu", "ind")]),
 "09007": ("comté de Lienchiang (Matsu)", "連江縣", "comte", ("王忠銘", "Wang Chung-ming", "kmt", "se représente"), [
    C("王忠銘", "Wang Chung-ming", "kmt", "Chef de comté sortant", sortant=True),
    C("曹爾元", "Tsao Erh-yuan", "ind", "Ancien directeur de l'administration foncière du comté, 2e en 2022")]),
}

# romanisations des élus et des principaux candidats de 2022 (fiche)
FR22 = {"蔣萬安": "Chiang Wan-an", "陳時中": "Chen Shih-chung", "黃珊珊": "Vivian Huang", "侯友宜": "Hou Yu-ih", "林佳龍": "Lin Chia-lung", "張善政": "Chang San-cheng",
        "鄭運鵬": "Cheng Yun-peng", "盧秀燕": "Lu Shiow-yen", "蔡其昌": "Tsai Chi-chang", "黃偉哲": "Huang Wei-che", "謝龍介": "Hsieh Lung-chieh", "陳其邁": "Chen Chi-mai",
        "柯志恩": "Ko Chih-en", "謝國樑": "Hsieh Kuo-liang", "蔡適應": "Tsai Shih-ying", "高虹安": "Kao Hung-an", "沈慧虹": "Shen Hui-hung", "林耕仁": "Lin Keng-jen",
        "楊文科": "Yang Wen-ke", "周江杰": "Chou Chiang-chieh", "鍾東錦": "Chung Tung-chin", "徐定禎": "Hsu Ting-chen", "許淑華": "Hsu Shu-hua", "蔡培慧": "Tsai Pei-hui",
        "王惠美": "Wang Hui-mei", "黃秀芳": "Huang Hsiu-fang", "張麗善": "Chang Li-shan", "劉建國": "Liu Chien-kuo", "黃敏惠": "Huang Min-hui", "李俊俋": "Lee Chun-yi",
        "翁章梁": "Weng Chang-liang", "王育敏": "Wang Yu-min", "周春米": "Chou Chun-mi", "蘇清泉": "Su Ching-chuan", "林姿妙": "Lin Zi-miao", "江聰淵": "Chiang Tsung-yuan",
        "饒慶鈴": "April Yao", "劉櫂豪": "Liu Chao-hao", "徐榛蔚": "Hsu Chen-wei", "陳光復": "Chen Kuang-fu", "賴峰偉": "Lai Feng-wei", "葉竹林": "Yeh Chu-lin",
        "陳福海": "Chen Fu-hai", "楊鎮浯": "Yang Chen-wu", "王忠銘": "Wang Chung-ming", "曹爾元": "Tsao Erh-yuan", "宋國鼎": "Sung Kuo-ting", "謝福弘": "Hsieh Fu-hung",
        "陳薇仲": "Chen Wei-chung", "賴香伶": "Lai Hsiang-ling", "陳琬惠": "Chen Wan-hui", "詹智鈞": "Chan Chih-chun", "李應文": "Lee Yin-wen"}
CORR22 = {"江淵": "江聰淵"}   # la CEC écrit certains caractères rares dans la zone privée d'Unicode (江\ue018淵) : retirés, puis corrigés ici
# Chiayi (ville), 18 décembre 2022 (CEC ; 214 130 inscrits, 94 188 votants, 93 813 valides)
CHIAYI22 = [("黃敏惠", "中國國民黨", 59874, True), ("李俊俋", "民主進步黨", 32790, False), ("黃宏成台灣阿成世界偉人財神總統", "無黨籍及未經政黨推薦", 535, False),
            ("鄭凱升", "無黨籍及未經政黨推薦", 368, False), ("陳泰山", "無黨籍及未經政黨推薦", 246, False)]


def resultats2022():
    with urllib.request.urlopen(urllib.request.Request(CSV2022, headers={"User-Agent": "fveilleux.com"}), timeout=120) as r:
        lignes = list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))
    noms = {v[1]: k for k, v in COURSES.items()}
    par = {}
    for l in lignes:
        code = noms.get(l["area"])
        if not code: continue
        nom = re.sub("[\ue000-\uf8ff]", "", l["cand_name"]); nom = CORR22.get(nom, nom)
        par.setdefault(code, []).append((nom, l["party"], int(l["ticket_num"] or 0), l["is_victor"] == "Y", int(l["cand_no"] or 0)))
    par["10020"] = [(n, a, v, e, i + 1) for i, (n, a, v, e) in enumerate(CHIAYI22)]
    out = {}
    for code, L in par.items():
        tot = sum(x[2] for x in L)
        L.sort(key=lambda x: -x[2])
        out[code] = {"valides": tot, "date": "2022-12-18" if code == "10020" else "2022-11-26",
                     "cands": [{"zh": n, **({"fr": FR22[n]} if n in FR22 else {}), "p": parti(a), "aff": a.replace("無黨籍及未經政黨推薦", "無黨籍"), "no": no,
                                "voix": v, "pct": round(100 * v / tot, 2), **({"elu": True} if e else {})} for n, a, v, e, no in L]}
    return out


def main():
    r22 = resultats2022()
    try: avant = json.load(open(SORTIE, encoding="utf-8"))
    except (OSError, ValueError): avant = {"courses": {}}
    courses = {}
    for code, (fr, zh, typ, (szh, sfr, sp, sstat), cands) in COURSES.items():
        courses[code] = {"fr": fr, "zh": zh, "type": typ, "sortant": {"zh": szh, "fr": sfr, "p": sp, "statut": sstat}, "cands": cands, "r22": r22[code]}
        if "pop" in avant["courses"].get(code, {}): courses[code]["pop"] = avant["courses"][code]["pop"]
    d = {"election": "2026-11-28", "source": "CNA et Focus Taiwan (enregistrement des candidatures, 4 et 7 septembre 2026) ; 2022 : db.cec.gov.tw",
         **({"popMois": avant["popMois"]} if "popMois" in avant else {}), "courses": courses}
    with open(SORTIE, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, indent=1)
    print(f"{len(courses)} courses, {sum(len(c['cands']) for c in courses.values())} candidatures : {SORTIE}")
    for code, c in courses.items():
        w = c["r22"]["cands"][0]
        print(f"  {code} {c['zh']} 2022 : {w['zh']} ({w['p']}) {w['pct']} %")


if __name__ == "__main__":
    main()
