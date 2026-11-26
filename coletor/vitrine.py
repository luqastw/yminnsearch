import html as htmllib
import re
import urllib.parse

from lojas import numero_br
from rede import baixar_json, baixar_navegador

API_KABUM = "https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products"
GUARDAR = 24


def _kabum(fonte: dict) -> list[dict]:
    itens = []
    for pagina in range(1, fonte.get("paginas", 2) + 1):
        parametros = urllib.parse.urlencode({
            "query": fonte["busca"],
            "page_number": pagina,
            "page_size": 100,
            "sort": "most_searched",
        })
        resposta = baixar_json(f"{API_KABUM}?{parametros}") or {}
        produtos = resposta.get("data") or []
        if not produtos:
            break
        for produto in produtos:
            item = _kabum_item(produto, fonte.get("menus") or [])
            if item:
                itens.append(item)
    return itens


def _kabum_item(produto: dict, menus: list[str]) -> dict | None:
    atributos = produto.get("attributes", {})
    if not atributos.get("available") or atributos.get("is_marketplace"):
        return None
    if menus and not any(atributos.get("menu", "").startswith(menu) for menu in menus):
        return None
    regular = atributos.get("price_with_discount") or 0
    if not regular:
        return None
    oferta = atributos.get("offer") or {}
    pix = oferta.get("price_with_discount") or regular
    referencia = max(regular, atributos.get("old_price") or 0)
    fotos = atributos.get("images") or []
    return {
        "url": f"https://www.kabum.com.br/produto/{produto['id']}/{atributos.get('product_link', '')}",
        "loja": "KaBuM!",
        "titulo": atributos.get("title", ""),
        "pix": round(pix, 2),
        "referencia": round(referencia, 2),
        "oferta": oferta.get("name"),
        "avaliacoes": atributos.get("number_of_ratings") or 0,
        "nota": atributos.get("average_of_ratings") or 0,
        "imagem": fotos[0] if fotos else None,
    }


def _pichau(fonte: dict) -> list[dict]:
    pagina = baixar_navegador(fonte["url"])
    if not pagina:
        return []
    pagina = re.sub(r"<style.*?</style>", "", pagina, flags=re.S)
    itens = []
    for bloco in re.split(r'(?=<a[^>]+href="/[a-z0-9-]+")', pagina)[1:]:
        trecho = bloco[:8000]
        if "price_vista" not in trecho:
            continue
        caminho = re.match(r'<a[^>]+href="(/[a-z0-9-]+)"', trecho).group(1)
        titulo = re.search(r"<h2[^>]*>([^<]+)", trecho)
        pix = _preco_classe(trecho, "price_vista")
        if not titulo or not pix or "esgotado" in trecho.lower():
            continue
        de = _preco_classe(trecho, "strikeThrough")
        imagem = re.search(r'<img[^>]+src="(https://media\.pichau[^"]+)"', trecho)
        itens.append({
            "url": "https://www.pichau.com.br" + caminho,
            "loja": "Pichau",
            "titulo": htmllib.unescape(titulo.group(1)).strip(),
            "pix": pix,
            "referencia": max(pix, de or 0),
            "oferta": None,
            "avaliacoes": 0,
            "nota": 0,
            "imagem": imagem.group(1) if imagem else None,
        })
    return itens


def _preco_classe(trecho: str, classe: str) -> float | None:
    achado = re.search(r'class="[^"]*' + classe + r'[^"]*"[^>]*>(?:\s*<[^>]+>)*\s*([^<]*R\$[^<]*)', trecho)
    return numero_br(achado.group(1)) if achado else None


FONTES = {"kabum": _kabum, "pichau": _pichau}


def _aceito(item: dict, config: dict) -> bool:
    titulo = item["titulo"].lower()
    if any(termo.lower() in titulo for termo in config.get("excluir", [])):
        return False
    exigir = config.get("exigir") or []
    if exigir and not any(termo.lower() in titulo for termo in exigir):
        return False
    for alternativas in config.get("exigir_todos", []):
        if not any(termo.lower() in titulo for termo in alternativas):
            return False
    if config.get("preco_min") and item["pix"] < config["preco_min"]:
        return False
    if config.get("preco_max") and item["pix"] > config["preco_max"]:
        return False
    return True


def coletar_vitrine(config: dict) -> list[dict]:
    resultado = []
    for fonte in config["fontes"]:
        coletor = FONTES.get(fonte["loja"])
        if not coletor:
            continue
        vistos = set()
        aceitos = []
        for item in coletor(fonte):
            if item["url"] in vistos or not _aceito(item, config):
                continue
            vistos.add(item["url"])
            item["posicao"] = len(aceitos) + 1
            item["desconto"] = round(1 - item["pix"] / item["referencia"], 4) if item["referencia"] > item["pix"] else 0
            aceitos.append(item)
        resultado.extend(aceitos[: config.get("guardar", GUARDAR)])
    return resultado
