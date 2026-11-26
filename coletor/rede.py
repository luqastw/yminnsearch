import gzip
import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request

AGENTE = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"


def baixar_direto(url: str, aceitar: str = "text/html,application/xhtml+xml") -> str | None:
    pedido = urllib.request.Request(url, headers={
        "User-Agent": AGENTE,
        "Accept": aceitar,
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Accept-Encoding": "gzip",
    })
    try:
        with urllib.request.urlopen(pedido, timeout=30) as resposta:
            corpo = resposta.read()
            if resposta.headers.get("Content-Encoding") == "gzip":
                corpo = gzip.decompress(corpo)
            return corpo.decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError):
        return None


def baixar_json(url: str) -> dict | None:
    corpo = baixar_direto(url, "application/json")
    if not corpo:
        return None
    try:
        return json.loads(corpo)
    except json.JSONDecodeError:
        return None


def localizar_chromium() -> str | None:
    preferido = os.environ.get("CHROMIUM")
    if preferido:
        return preferido
    for nome in ("chromium", "chromium-browser", "google-chrome-stable", "google-chrome"):
        caminho = shutil.which(nome)
        if caminho:
            return caminho
    return None


def desafio_antibot(pagina: str) -> bool:
    cabeca = pagina[:6000].lower()
    return any(marca in cabeca for marca in ("<title>um momento", "<title>just a moment", "<title>attention required"))


def baixar_navegador(url: str, espera_ms: int = 30000) -> str | None:
    chromium = localizar_chromium()
    if not chromium:
        return None
    comando = [
        chromium, "--headless=new", "--disable-gpu", "--no-sandbox", "--mute-audio",
        f"--user-agent={AGENTE}", "--lang=pt-BR",
        f"--virtual-time-budget={espera_ms}", "--dump-dom", url,
    ]
    for tentativa in range(3):
        try:
            resultado = subprocess.run(comando, capture_output=True, timeout=espera_ms / 1000 + 60)
        except subprocess.TimeoutExpired:
            continue
        pagina = resultado.stdout.decode("utf-8", "replace")
        if pagina and not desafio_antibot(pagina):
            return pagina
        time.sleep(8 * (tentativa + 1))
    return None
