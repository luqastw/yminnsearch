import argparse
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from arquivo import importar
from lojas import Oferta, extrair, identificar_loja
from rede import baixar_direto, baixar_navegador
from vitrine import coletar_vitrine

RAIZ = Path(__file__).resolve().parent.parent
PRODUTOS = RAIZ / "produtos.json"
HISTORICO = RAIZ / "dados" / "historico.json"
HISTORICO_VITRINES = RAIZ / "dados" / "vitrines.json"
ESTADO_ARQUIVO = RAIZ / "dados" / "arquivo.json"
SAIDA_SITE = RAIZ / "docs" / "dados.js"
FUSO = timezone(timedelta(hours=-3))
DIAS_HISTORICO = 365
DIAS_HISTORICO_VITRINE = 92


def coletar_url(url: str) -> tuple[str, Oferta | None]:
    loja, modo = identificar_loja(url)
    if modo == "direto":
        pagina = baixar_direto(url)
        oferta = extrair(loja, pagina) if pagina else None
        if oferta and oferta.pix:
            return loja, oferta
    pagina = baixar_navegador(url)
    return loja, extrair(loja, pagina) if pagina else None


def carregar_json(caminho: Path, padrao):
    if not caminho.exists():
        return padrao
    return json.loads(caminho.read_text(encoding="utf-8"))


def salvar_json(caminho: Path, dado) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    temporario = caminho.with_suffix(".tmp")
    temporario.write_text(json.dumps(dado, ensure_ascii=False, indent=1), encoding="utf-8")
    temporario.replace(caminho)


def podar(pontos: list[dict], agora: datetime, dias: int) -> list[dict]:
    limite = (agora - timedelta(days=dias)).isoformat(timespec="minutes")
    return [p for p in pontos if p["t"] >= limite]


def registrar_diario(historico: dict, url: str, pix: float, agora: datetime) -> None:
    pontos = historico.setdefault(url, [])
    dia = agora.date().isoformat()
    if pontos and pontos[-1]["t"].startswith(dia) and not pontos[-1].get("arquivo"):
        pontos[-1]["pix"] = min(pontos[-1]["pix"], pix)
        return
    pontos.append({"t": agora.isoformat(timespec="minutes"), "pix": pix})


def carregar_vitrines() -> dict:
    return carregar_json(HISTORICO_VITRINES, {"itens": {}, "historico": {}})


def coletar_vitrines(produtos: dict, estado: dict, agora: datetime) -> None:
    for config in produtos.get("vitrines", []):
        itens = coletar_vitrine(config)
        if not itens:
            print(f"[FALHA] vitrine {config['titulo']}: nada coletado; mantendo a anterior", file=sys.stderr)
            continue
        estado["itens"][config["id"]] = {"atualizado": agora.isoformat(timespec="minutes"), "lista": itens}
        for item in itens:
            registrar_diario(estado["historico"], item["url"], item["pix"], agora)
        print(f"[OK] vitrine {config['titulo']}: {len(itens)} itens")
    estado["historico"] = {
        url: podado
        for url, pontos in estado["historico"].items()
        if (podado := podar(pontos, agora, DIAS_HISTORICO_VITRINE))
    }


def montar_vitrines(produtos: dict, estado: dict) -> list[dict]:
    vitrines = []
    for config in produtos.get("vitrines", []):
        coletado = estado["itens"].get(config["id"], {})
        lista = []
        for item in coletado.get("lista", []):
            pontos = estado["historico"].get(item["url"], [])
            lista.append({**item, "historico": [[p["t"], p["pix"]] for p in pontos]})
        vitrines.append({
            "id": config["id"],
            "titulo": config["titulo"],
            "descricao": config.get("descricao", ""),
            "automatica": config.get("automatica"),
            "atualizado": coletado.get("atualizado"),
            "itens": lista,
        })
    return vitrines


def montar_site(produtos: dict, historico: dict, vitrines: list[dict], agora: datetime) -> None:
    pecas = []
    for peca in produtos["pecas"]:
        ofertas = []
        for url in peca["links"]:
            registro = historico.get(url, {})
            ofertas.append({
                "url": url,
                "loja": identificar_loja(url)[0],
                "titulo": registro.get("titulo"),
                "falhas": registro.get("falhas", 0),
                "historico": registro.get("pontos", []),
            })
        pecas.append({
            "id": peca["id"],
            "grupo": peca.get("grupo", peca["id"]),
            "nome": peca["nome"],
            "categoria": peca.get("categoria", ""),
            "nota": peca.get("nota", ""),
            "aviso": peca.get("aviso", ""),
            "fora_do_total": bool(peca.get("fora_do_total")),
            "busca": peca.get("busca", peca["nome"]),
            "alvo": peca.get("alvo"),
            "ofertas": ofertas,
        })
    dados = {
        "atualizado": agora.isoformat(timespec="minutes"),
        "compradas": produtos.get("compradas", []),
        "pecas": pecas,
        "vitrines": vitrines,
    }
    SAIDA_SITE.write_text(
        "window.DADOS = " + json.dumps(dados, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )


def coletar_pecas(produtos: dict, historico: dict, agora: datetime) -> tuple[int, int]:
    sucessos = 0
    falhas = 0
    for peca in produtos["pecas"]:
        for url in peca["links"]:
            loja, oferta = coletar_url(url)
            registro = historico.setdefault(url, {"pontos": []})
            if not oferta or not oferta.pix:
                registro["falhas"] = registro.get("falhas", 0) + 1
                falhas += 1
                print(f"[FALHA] {peca['nome']} @ {loja}", file=sys.stderr)
                continue
            registro["falhas"] = 0
            registro["titulo"] = oferta.titulo or registro.get("titulo")
            registro["pontos"].append({
                "t": agora.isoformat(timespec="minutes"),
                "pix": round(oferta.pix, 2),
                "cartao": round(oferta.cartao, 2) if oferta.cartao else None,
                "disp": oferta.disponivel,
            })
            registro["pontos"] = podar(registro["pontos"], agora, DIAS_HISTORICO)
            sucessos += 1
            print(f"[OK] {peca['nome']} @ {loja}: Pix R$ {oferta.pix:.2f}")
            time.sleep(2)
    return sucessos, falhas


def importar_arquivo(produtos: dict, historico: dict, vitrines: dict, orcamento: int, agora: datetime) -> None:
    estado = carregar_json(ESTADO_ARQUIVO, {})
    links = [url for peca in produtos["pecas"] for url in peca["links"]]
    usados = importar(links, historico, estado, orcamento, agora)
    restante = orcamento - usados
    if restante > 0:
        urls_vitrine = [
            item["url"]
            for config in produtos.get("vitrines", [])
            for item in vitrines["itens"].get(config["id"], {}).get("lista", [])[:8]
        ]
        adaptador = {url: {"pontos": vitrines["historico"].setdefault(url, [])} for url in urls_vitrine}
        importar(urls_vitrine, adaptador, estado, restante, agora)
        for url, registro in adaptador.items():
            vitrines["historico"][url] = registro["pontos"]
    salvar_json(ESTADO_ARQUIVO, estado)


def executar(argumentos: argparse.Namespace) -> int:
    produtos = carregar_json(PRODUTOS, {"pecas": []})
    historico = carregar_json(HISTORICO, {})
    vitrines = carregar_vitrines()
    agora = datetime.now(FUSO).replace(second=0, microsecond=0)

    if argumentos.apenas_site:
        montar_site(produtos, historico, montar_vitrines(produtos, vitrines), agora)
        return 0

    sucessos, falhas = (0, 0) if argumentos.so_arquivo else coletar_pecas(produtos, historico, agora)
    salvar_json(HISTORICO, historico)

    if not argumentos.sem_vitrines and not argumentos.so_arquivo:
        coletar_vitrines(produtos, vitrines, agora)
        salvar_json(HISTORICO_VITRINES, vitrines)

    if argumentos.arquivo > 0:
        importar_arquivo(produtos, historico, vitrines, argumentos.arquivo, agora)
        salvar_json(HISTORICO, historico)
        salvar_json(HISTORICO_VITRINES, vitrines)

    montar_site(produtos, historico, montar_vitrines(produtos, vitrines), agora)
    return 1 if falhas and not sucessos and not argumentos.so_arquivo else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Coleta preços das peças e atualiza o site.")
    parser.add_argument("--apenas-site", action="store_true", help="só regera docs/dados.js a partir do histórico")
    parser.add_argument("--sem-vitrines", action="store_true", help="não atualiza as vitrines nesta execução")
    parser.add_argument("--so-arquivo", action="store_true", help="só importa histórico do Wayback Machine")
    parser.add_argument("--arquivo", type=int, default=30, metavar="N", help="máximo de capturas do Wayback lidas nesta execução (0 desliga)")
    sys.exit(executar(parser.parse_args()))


if __name__ == "__main__":
    main()
