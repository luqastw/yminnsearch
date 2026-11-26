import gzip
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from lojas import extrair, identificar_loja

CDX = "https://web.archive.org/cdx/search/cdx"
AGENTE = "monitor-precos-pessoal/1.0"
PAUSA = 4
DIAS = 92


def _abrir(url: str, tentativas: int = 3) -> bytes | None:
    for tentativa in range(tentativas):
        try:
            pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(pedido, timeout=90) as resposta:
                return resposta.read()
        except urllib.error.HTTPError as erro:
            if erro.code in (403, 404):
                return None
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        time.sleep(30 * (tentativa + 1))
    return None


def _padrao_busca(url: str) -> str:
    partes = urlparse(url)
    caminho = partes.path
    if "/produto/" in caminho:
        identificador = caminho.split("/produto/")[1].split("/")[0]
        return f"{partes.netloc}/produto/{identificador}*"
    if "/dp/" in caminho:
        asin = caminho.split("/dp/")[1].split("/")[0]
        return f"{partes.netloc}/dp/{asin}*"
    return partes.netloc + caminho


def capturas(url: str, desde: datetime) -> list[tuple[str, str]]:
    consulta = urllib.parse.urlencode({
        "url": _padrao_busca(url),
        "from": desde.strftime("%Y%m%d"),
        "output": "json",
        "filter": "statuscode:200",
        "collapse": "timestamp:8",
    })
    corpo = _abrir(f"{CDX}?{consulta}")
    if not corpo:
        return []
    try:
        linhas = json.loads(corpo)
    except json.JSONDecodeError:
        return []
    return sorted({(linha[1], linha[2]) for linha in linhas[1:]})


def _amostrar(lista: list, maximo: int) -> list:
    if len(lista) <= maximo:
        return lista
    passo = (len(lista) - 1) / (maximo - 1)
    return [lista[round(i * passo)] for i in range(maximo)]


def _ler_captura(carimbo: str, original: str) -> str | None:
    corpo = _abrir(f"https://web.archive.org/web/{carimbo}id_/{original}")
    if not corpo:
        return None
    if corpo[:2] == b"\x1f\x8b":
        try:
            corpo = gzip.decompress(corpo)
        except OSError:
            return None
    return corpo.decode("utf-8", "replace")


def _instante(carimbo: str) -> str:
    momento = datetime.strptime(carimbo[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    return momento.astimezone(timezone(timedelta(hours=-3))).isoformat(timespec="minutes")


def importar(urls: list[str], historico: dict, estado: dict, orcamento: int, agora: datetime) -> int:
    desde = agora - timedelta(days=DIAS)
    usados = 0
    for url in urls:
        if usados >= orcamento:
            break
        registro_estado = estado.setdefault(url, {"vistas": [], "consultado": None})
        if registro_estado["consultado"] == agora.date().isoformat():
            continue
        lista = capturas(url, desde)
        registro_estado["consultado"] = agora.date().isoformat()
        pendentes = [c for c in lista if c[0][:8] not in registro_estado["vistas"]]
        pendentes = _amostrar(pendentes, max(1, min(len(pendentes), orcamento - usados)))
        loja = identificar_loja(url)[0]
        pontos = historico.setdefault(url, {"pontos": []})["pontos"]
        for carimbo, original in pendentes:
            if usados >= orcamento:
                break
            usados += 1
            time.sleep(PAUSA)
            pagina = _ler_captura(carimbo, original)
            registro_estado["vistas"].append(carimbo[:8])
            if not pagina:
                continue
            oferta = extrair(loja, pagina)
            if not oferta.pix:
                continue
            pontos.append({
                "t": _instante(carimbo),
                "pix": round(oferta.pix, 2),
                "cartao": round(oferta.cartao, 2) if oferta.cartao else None,
                "disp": oferta.disponivel,
                "arquivo": True,
            })
            print(f"[OK] arquivo {loja} {carimbo[:8]}: R$ {oferta.pix:.2f}")
        pontos.sort(key=lambda p: p["t"])
    if usados:
        print(f"[OK] arquivo: {usados} capturas lidas", file=sys.stderr)
    return usados
