"""Outils communs aux scripts « gouvernement.py » de chaque pays (fenêtre « Gouvernement actuel » des pages d'intentions de vote).

Chaque pays écrit votes-<pays>/gouvernement.json :
  { "source": adresse, "source_nom": nom de la source, "date": AAAA-MM-JJ,
    "niveaux": [ { "titre": texte ou null, "grand": vrai pour les cartes larges (chef du gouvernement), "membres": [
        { "nom", "roles": [fonctions], "photo": adresse ou null, "url": page du membre ou null,
          "p": clé de parti de la page (couleur) ou null, "parti": libellé du parti ou null } ] } ] }
Le premier niveau est le chef du gouvernement (grand). Bibliothèque standard seulement. Si une source est illisible ou
douteuse (trop peu de membres), le script se termine en erreur et le fichier reste tel quel.
"""
import datetime, html, json, os, re, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept-Language": "fr,en;q=0.8"}


def lire(url, essais=3):
    for k in range(essais):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if k == essais - 1: raise
            time.sleep(3 * (k + 1))


def wiki(page, langue="fr"):
    """texte wiki brut d'une page Wikipédia"""
    return lire(f"https://{langue}.wikipedia.org/w/index.php?title={urllib.parse.quote(page)}&action=raw")


def texte(h):
    """HTML ou wikitexte → texte simple"""
    h = re.sub(r"<[^>]+>", " ", h)
    h = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", h)
    return re.sub(r"\s+", " ", html.unescape(h).replace("\xa0", " ")).strip()


def commons(fichier, largeur=200):
    """adresse d'une image de Wikimedia Commons à partir de son nom de fichier"""
    return "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(fichier.strip().replace(" ", "_")) + f"?width={largeur}"


def membre(nom, roles, photo=None, url=None, p=None, parti=None):
    return {"nom": nom, "roles": [r for r in roles if r], "photo": photo, "url": url, "p": p, "parti": parti}


def ecrire(dossier, source, source_nom, niveaux, minimum):
    """écrit ../gouvernement.json (dossier = dossier du script) après vérification"""
    n = sum(len(x["membres"]) for x in niveaux)
    if n < minimum or not niveaux or not niveaux[0]["membres"]:
        raise SystemExit(f"{source_nom} : {n} membres lus ({minimum} attendus au moins) : gouvernement.json inchangé.")
    sortie = {"source": source, "source_nom": source_nom, "date": datetime.date.today().isoformat(),
              "niveaux": [x for x in niveaux if x["membres"]]}
    json.dump(sortie, open(os.path.join(dossier, "..", "gouvernement.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    chef = sortie["niveaux"][0]["membres"][0]
    print(f"{n} membres · chef : {chef['nom']} ({'; '.join(chef['roles'][:1])})" + (" · sans photo : " + ", ".join(m["nom"] for x in sortie["niveaux"] for m in x["membres"] if not m["photo"]) if any(not m["photo"] for x in sortie["niveaux"] for m in x["membres"]) else ""))
