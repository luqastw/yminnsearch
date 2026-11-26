import html as htmllib
import json
import re
from dataclasses import dataclass
from urllib.parse import urlparse


LOJAS = {
    "kabum.com.br": ("KaBuM!", "direto"),
    "pichau.com.br": ("Pichau", "navegador"),
    "terabyteshop.com.br": ("Terabyte", "navegador"),
    "mercadolivre.com.br": ("Mercado Livre", "navegador"),
    "amazon.com.br": ("Amazon", "direto"),
    "magazineluiza.com.br": ("Magalu", "navegador"),
    "gkinfostore.com.br": ("GKInfoStore", "navegador"),
    "patoloco.com.br": ("Patoloco", "navegador"),
    "girafa.com.br": ("Girafa", "navegador"),
}


@dataclass
class Oferta:
    titulo: str | None
    pix: float | None
    cartao: float | None
    disponivel: bool | None


def identificar_loja(url: str) -> tuple[str, str]:
    host = urlparse(url).netloc.lower()
    for dominio, info in LOJAS.items():
        if host == dominio or host.endswith("." + dominio):
            return info
    return host.removeprefix("www."), "navegador"


def numero_br(texto: str | None) -> float | None:
    if texto is None:
        return None
    if isinstance(texto, (int, float)):
        return float(texto) if texto > 0 else None
    limpo = re.sub(r"[^\d,.]", "", htmllib.unescape(str(texto)))
    if not limpo:
        return None
    if "," in limpo and "." in limpo:
        if limpo.rfind(",") > limpo.rfind("."):
            limpo = limpo.replace(".", "").replace(",", ".")
            return _positivo(limpo)
        return _positivo(limpo.replace(",", ""))
    if "," in limpo:
        return _positivo(limpo.replace(",", "."))
    if limpo.count(".") > 1 or re.fullmatch(r"\d{1,3}\.\d{3}", limpo):
        return _positivo(limpo.replace(".", ""))
    return _positivo(limpo)


def _positivo(valor: str) -> float | None:
    try:
        numero = float(valor)
    except ValueError:
        return None
    return numero if numero > 0 else None


def _blocos_ld(pagina: str) -> list[dict]:
    blocos = []
    for bruto in re.findall(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", pagina, re.S | re.I):
        try:
            dado = json.loads(bruto.strip())
        except json.JSONDecodeError:
            continue
        pilha = dado if isinstance(dado, list) else [dado]
        while pilha:
            item = pilha.pop()
            if isinstance(item, list):
                pilha.extend(item)
                continue
            if not isinstance(item, dict):
                continue
            if "@graph" in item:
                pilha.extend(item["@graph"])
            blocos.append(item)
    return blocos


def _produto_ld(pagina: str) -> dict | None:
    for bloco in _blocos_ld(pagina):
        tipo = bloco.get("@type")
        tipos = tipo if isinstance(tipo, list) else [tipo]
        if "Product" in tipos:
            return bloco
    return None


def _oferta_ld(produto: dict) -> tuple[float | None, bool | None]:
    ofertas = produto.get("offers")
    if isinstance(ofertas, list):
        ofertas = ofertas[0] if ofertas else None
    if not isinstance(ofertas, dict):
        return None, None
    preco = numero_br(ofertas.get("price") or ofertas.get("lowPrice"))
    disponibilidade = str(ofertas.get("availability", ""))
    if not disponibilidade:
        return preco, None
    return preco, "InStock" in disponibilidade or "PreOrder" in disponibilidade


def _meta(pagina: str, nome: str) -> str | None:
    padrao = rf'<meta[^>]*(?:property|name|itemprop)="{re.escape(nome)}"[^>]*content="([^"]*)"'
    achado = re.search(padrao, pagina, re.I)
    if achado:
        return achado.group(1)
    padrao = rf'<meta[^>]*content="([^"]*)"[^>]*(?:property|name|itemprop)="{re.escape(nome)}"'
    achado = re.search(padrao, pagina, re.I)
    return achado.group(1) if achado else None


def _titulo(pagina: str, produto: dict | None) -> str | None:
    if produto and produto.get("name"):
        return htmllib.unescape(str(produto["name"])).strip()
    titulo = _meta(pagina, "og:title")
    if titulo:
        return htmllib.unescape(titulo).strip()
    achado = re.search(r"<title>([^<]*)</title>", pagina, re.I)
    return htmllib.unescape(achado.group(1)).strip() if achado else None


def _pix_kabum(pagina: str) -> float | None:
    valores = [numero_br(v) for v in re.findall(r'"priceWithDiscount"\s*:\s*"?([\d.]+)', pagina)]
    valores = [v for v in valores if v]
    return valores[0] if valores else None


def _pix_pichau(pagina: str) -> float | None:
    return numero_br(_meta(pagina, "product:price:amount"))


def _pix_terabyte(pagina: str) -> float | None:
    padroes = (
        r'product-sticky-bar__content.{0,600}?R\$\s*([\d.]+,\d{2})',
        r'id="valVista"[^>]*>\s*R\$\s*([\d.]+,\d{2})',
    )
    for padrao in padroes:
        achado = re.search(padrao, pagina, re.I | re.S)
        valor = numero_br(achado.group(1)) if achado else None
        if valor:
            return valor
    return None


def _preco_amazon(pagina: str) -> float | None:
    padroes = (
        r'data-pricetopay-label[^>]*>\s*R\$\s*([\d.]+,\d{2})',
        r'priceToPay[^>]*>\s*R\$\s*([\d.]+,\d{2})',
        r'corePriceDisplay_desktop_feature_div.{0,4000}?class="a-offscreen">\s*R\$\s*([\d.]+,\d{2})',
    )
    for padrao in padroes:
        achado = re.search(padrao, pagina, re.S)
        if achado:
            return numero_br(achado.group(1))
    return None


def _disponivel_amazon(pagina: str) -> bool | None:
    achado = re.search(r'id="availability".{0,400}?<span[^>]*>\s*([^<]+)', pagina, re.S)
    if not achado:
        return None
    texto = achado.group(1).strip().lower()
    if "em estoque" in texto or "restam" in texto or "disponível" in texto and "não" not in texto:
        return True
    return False


PIX_POR_LOJA = {
    "KaBuM!": _pix_kabum,
    "Pichau": _pix_pichau,
    "Terabyte": _pix_terabyte,
}


def extrair(loja: str, pagina: str) -> Oferta:
    produto = _produto_ld(pagina)
    preco, disponivel = _oferta_ld(produto) if produto else (None, None)
    if preco is None:
        preco = numero_br(_meta(pagina, "product:price:amount") or _meta(pagina, "og:price:amount") or _meta(pagina, "price"))
    if loja == "Amazon":
        preco = _preco_amazon(pagina) or preco
        disponivel = _disponivel_amazon(pagina) if disponivel is None else disponivel
    pix = PIX_POR_LOJA[loja](pagina) if loja in PIX_POR_LOJA else None
    precos = [p for p in (preco, pix) if p]
    if not precos:
        return Oferta(_titulo(pagina, produto), None, None, disponivel)
    return Oferta(_titulo(pagina, produto), min(precos), max(precos), disponivel)
