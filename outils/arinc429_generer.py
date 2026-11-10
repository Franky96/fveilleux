#!/usr/bin/env python3
"""Génère arinc429-etiquettes.js (étiquettes 065 à 377 du décodeur ARINC 429) à partir du manuel ARINC 429 Part 1-17.

Le manuel n'est pas dans le dépôt (document protégé) : on lui donne le texte des attachements extraits par
pdftotext -layout, lus par les 3 lecteurs de outils/arinc429_lire.py :
    python3 outils/arinc429_lire.py Manuel_Arinc_429.pdf /tmp/a429      (écrit att11.json, att12.json, att2.json)
    python3 outils/arinc429_generer.py /tmp/a429 arinc429-etiquettes.js

Règles (mêmes que pour 001-064, faits à la main) :
  - une configuration par paramètre et par format ; ses équipements (Eqpt. ID) dans eq ;
  - par défaut, la configuration émise par le plus d'équipements (à égalité : renvoi à l'attachement 6, puis l'ordre du manuel) ;
  - BNR : msb = moitié de la plage (Range/Scale), bits significatifs 28 → (29 - n), PAD en dessous ; 19-20 bits → bits 9-10 ;
  - BCD : n chiffres significatifs depuis le caractère de poids fort (bits 29-27), PAD en dessous ; décimales selon la résolution ;
  - format absent ou défini ailleurs → « hors » : pas de décodage, une note le dit.
"""
import json, math, re, sys
from collections import OrderedDict

dossier, sortie = sys.argv[1], sys.argv[2]
att11 = json.load(open(f'{dossier}/att11.json'))
att2 = json.load(open(f'{dossier}/att2.json'))
eqpt = json.load(open(f'{dossier}/att12.json'))

UNITES = {
    'knots': 'kt', 'feet': 'ft', 'ft.': 'ft', 'deg': 'deg', 'deg/180': 'deg', 'deg./180': 'deg', 'deg.': 'deg',
    'ft/min': 'ft/min', 'feet/min': 'ft/min', 'deg c': '°C', 'lbs.': 'lb', 'lbs': 'lb', 'lb.': 'lb', 'n.m.': 'nm',
    'nm': 'nm', 'meters': 'm', 'deg/sec': 'deg/s', 'deg/sec2': 'deg/s²', 'percent': '%', 'kilograms': 'kg',
    'seconds': 's', 'min.': 'min', 'volts': 'V', 'amperes': 'A', 'ft/sec': 'ft/s', 'm/s': 'm/s', 'ins hg': 'inHg',
    'pf': 'pF', 'hz': 'Hz', 'mach': 'Mach', 'mb': 'mb', 'psia': 'PSIA', 'psig': 'PSIG', 'inches': 'in', 'g': 'g',
}
def unite(u):
    u = (u or '').strip()
    return UNITES.get(u.lower(), u)

def cle(s): return re.sub(r'[^a-z0-9]', '', s.lower())

def chiffres(s):
    v = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', (s or '').replace(',', ''))]
    return max(v) if v else None

def decimales(res):
    m = re.match(r'^\s*(\d+)(?:\.(\d*?))0*\s*$', res or '')
    if not m: return None
    return len(m.group(2) or '')

def trouve_att2(r):
    cands = [a for a in att2 if a['oct'] == r['oct'] and a['eq'] == r['eq']]
    if not cands: return None
    if len(cands) == 1: return cands[0]
    k = cle(r['nom'])
    def score(a):
        n = cle(a['nom']); i = 0
        while i < min(len(n), len(k)) and n[i] == k[i]: i += 1
        return i
    return max(cands, key=score)

def unites_de(r, a):
    if a is None: return ''
    if a['units']: return a['units']
    # l'unité est restée collée au nom dans l'attachement 2 : ce qui suit le nom de l'attachement 1-1
    n, k = a['nom'], r['nom']
    if n.lower().startswith(k.lower()): return n[len(k):].strip()
    mots = n.split()
    return mots[-1] if len(mots) > 1 and not mots[-1][0].isupper() else ''

def binaire(x):
    """un « nombre binaire entier » du manuel : 2^k, ou 2^k / 10^j (ex. 4.096, 131.072, 163.84)"""
    for j in range(0, 7):
        v = x * 10 ** j
        if v >= 1 and abs(math.log2(v) - round(math.log2(v))) < 1e-6: return True
    return False

def format_bnr(a):
    n = int(a['sig']) if a['sig'].isdigit() else None
    try: res = float(a['res'])
    except ValueError: res = None
    if not n: return None, 'format non précisé dans ce manuel'
    nombres = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', re.sub(r'(\d),\s?(\d{3})', r'\1\2', a['range'] or ''))]
    exacte = res * 2 ** n if res else None
    note = None
    texte = (a['range'] or '').strip()
    if not nombres:
        if exacte is None: return None, 'plage non précisée dans ce manuel'
        plage = exacte
    elif re.search(r'\d\s*(to|-)\s*\d', texte):
        # plage d'utilisation (« 0-359 », « -55 to 160 », « 5-600 ») : l'échelle binaire vient de la résolution
        if exacte is None: return None, 'échelle non précisée dans ce manuel'
        plage = exacte if exacte >= max(nombres) * 0.99 else max(nombres)
    else:
        # la plage (échelle) fait foi, les résolutions du manuel sont approximatives ; on ne corrige que les coquilles
        plage = max(nombres)
        if exacte and abs(exacte - plage) / exacte < 0.01 and not binaire(plage) and binaire(exacte):
            plage = exacte                                   # 655.35 → 655.36, 131068 → 131072
        elif exacte and not binaire(plage) and binaire(exacte) and re.sub(r'\D', '', f'{exacte:g}') in re.sub(r'\D', '', texte):
            note = f"Att. 2 : plage « {texte} » lue {exacte:g} (coquille probable ; résolution {a['res']} sur {n} bits)"
            plage = exacte                                   # 1131072 → 131072, ± 131.072 → 131072
    if re.search(r'deg\.?/180', a['units'] or '', re.I) or ('/180' in (a['nom'] or '')):
        plage = 180.0                                    # angles en demi-cercles (Deg/180) : échelle ±180°, toujours
    meta = OrderedDict(msb=plage / 2)
    if n < 18: meta['spareBits'] = list(range(11, 29 - n))
    elif n > 18: meta['extendSdi'] = True       # 19-20 bits : la donnée descend dans les bits 9-10
    d = decimales(a['res'])
    if d is not None: meta['bnrDecimals'] = d
    if res and not note and abs(plage / 2 ** n - res) / res > 0.6:
        note = f"Att. 2 : plage {a['range'].strip()} sur {n} bits donne {plage / 2 ** n:.4g} de résolution, pas {a['res']}"
    return meta, note

def format_bcd(a, u):
    if not a['sig'].isdigit(): return None, None
    n = int(a['sig'])
    try: res = float(a['res'])
    except ValueError: return None, 'résolution non précisée dans ce manuel'
    if res <= 0 or not (1 <= n <= 5): return None, None
    lg = math.log10(res)
    if abs(lg - round(lg)) > 1e-9: return None, f"résolution {a['res']} : pas une puissance de 10, format BCD non standard"
    pad = 5 - n
    meta = OrderedDict(decimals=pad - round(lg))
    if pad: meta['padLow'] = pad
    if '±' in a['range'] or re.match(r'^\s*-', a['range'] or ''): meta['signe'] = True
    if re.match(r'^100\s', u or ''): meta['bcdScale'] = 100
    if 'hr' in (u or '').lower() and 'min' in (u or '').lower():
        # heures:minutes.dixième : toujours les 5 caractères (exemple 6-25 : 15:45.5, même quand le tableau dit 4 chiffres)
        meta = OrderedDict(decimals=1, fmt='utc', utcFmt=True)
    return meta, None

def att6(notes):
    return ', '.join(dict.fromkeys(re.findall(r'6-\d+(?:-\d+)?', notes or '')))

# les paramètres par défaut de la version précédente de la page (départage à égalité)
anciens = {}
try:
    for m in re.finditer(r"\{ oct: '(\d{3})', enc: '\w+', param: '([^']*)'", open(sys.argv[3]).read()):
        anciens[m.group(1)] = m.group(2)
except (IndexError, OSError):
    pass

gen = OrderedDict()
for oct_ in sorted({r['oct'] for r in att11}):
    if oct_ < '065': continue
    configs = OrderedDict()
    for ordre, r in enumerate(x for x in att11 if x['oct'] == oct_):
        a = trouve_att2(r)
        typ = r['type'] or (a['table'] if a else 'DISC')
        enc = {'BNR': 'BNR', 'BCD': 'BCD'}.get(typ, 'DIS')
        if enc == 'BNR' and a and a['table'] == 'BCD': a = None
        if enc == 'BCD' and a and a['table'] == 'BNR': a = None
        u = unites_de(r, a)
        meta, note, hors = None, None, None
        if enc == 'BNR':
            if a: meta, note = format_bnr(a)
            if meta is None: hors = note or 'format non précisé dans ce manuel'; note = None
        elif enc == 'BCD':
            if a and re.search(r'see (chap|sec)', (a['units'] + ' ' + a['range']).lower()):
                hors = 'format radio (chapitre 3)'
            elif a:
                meta, note = format_bcd(a, u)
                if meta is None: hors = note or 'format non précisé dans ce manuel'; note = None
            else:
                hors = 'format non précisé dans ce manuel'
        signature = (cle(r['nom']), enc, json.dumps(meta, sort_keys=True), hors)
        if signature not in configs:
            unit = unite(re.sub(r'^100\s+', '', u)) if enc != 'DIS' else ''
            configs[signature] = OrderedDict(param=r['nom'], unit=unit, enc=enc, eq=[], meta=meta, ordre=ordre,
                                             att6=att6(r['notes'] + ' ' + (a['notes'] if a else '')))
            if hors: configs[signature]['hors'] = hors
            if note: configs[signature]['note'] = note
        c = configs[signature]
        if r['eq'] not in c['eq']: c['eq'].append(r['eq'])
        if not c['att6']: c['att6'] = att6(r['notes'])
    liste = list(configs.values())
    # même nom, formats différents : préciser le format dans le nom
    noms = {}
    for c in liste: noms.setdefault(cle(c['param']), []).append(c)
    for groupe in noms.values():
        if len(groupe) > 1:
            for c in groupe:
                m = c['meta'] or {}
                if c['enc'] == 'BNR' and m: c['param'] += f" ({18 - len(m.get('spareBits', [])) if not m.get('extendSdi') else 20} bits)"
                elif c['enc'] == 'BCD' and m: c['param'] += f" ({5 - m.get('padLow', 0)} chiffres)"
                elif c['enc'] != (groupe[0]['enc']): c['param'] += f" ({c['enc']})"
    def score(c):
        return (len(c['eq']) + (0.4 if c['att6'] else 0) + (0.3 if anciens.get(oct_, '').lower() == c['param'].lower() else 0), -c['ordre'])
    liste.sort(key=score, reverse=True)
    for c in liste:
        c.pop('ordre')
        if not c['att6']: c.pop('att6')
        if c['meta'] is None: c.pop('meta')
    gen[oct_] = liste

js = ['// Généré par outils/arinc429_generer.py à partir du manuel ARINC 429 Part 1-17 (attachements 1-1, 1-2 et 2).',
      '// Ne pas modifier à la main : les formats particuliers (attachement 6) sont dans arinc429.js (FORMATS_SPECIAUX).',
      '// Une étiquette → ses configurations, la première par défaut : { param, unit, enc, eq, meta?, hors?, note?, att6? }',
      'window.ARINC_EQPT = ' + json.dumps(eqpt, ensure_ascii=False, separators=(',', ':')) + ';',
      'window.ARINC_GEN = {']
for oct_, liste in gen.items():
    js.append(f"  '{oct_}': [")
    for c in liste: js.append('    ' + json.dumps(c, ensure_ascii=False, separators=(', ', ': ')) + ',')
    js.append('  ],')
js.append('};')
open(sortie, 'w').write('\n'.join(js) + '\n')
n = sum(len(v) for v in gen.values())
print(f'{len(gen)} étiquettes, {n} configurations ; hors manuel : {sum(1 for v in gen.values() for c in v if "hors" in c)} ; notes : {sum(1 for v in gen.values() for c in v if "note" in c)}')
