# Monitor de Peças

Coleta o preço Pix/à vista de peças em lojas brasileiras, guarda 90 dias de histórico e gera uma página estática em `docs/`.

## Uso

| Ação | Comando |
|---|---|
| Coletar agora | `./rodar.sh` |
| Importar mais histórico do Wayback | `python3 coletor/coletar.py --so-arquivo --arquivo 150` |
| Regerar só a página | `python3 coletor/coletar.py --apenas-site` |
| Agendar a cada hora | `deploy/instalar-timer.sh` |
| Ver a página | abrir `docs/index.html` |

## Lojas

| Loja | Peças com link | Vitrines | Observação |
|---|---|---|---|
| KaBuM! | sim | sim (API de busca) | acesso direto |
| Pichau | sim | sim (página de categoria) | via Chromium headless |
| Terabyte | sim | não | via Chromium headless |
| Amazon | sim | não | acesso direto |
| Mercado Livre | não | não | exige login para robôs |
| Magalu | não | não | bloqueia acesso automatizado |

## Desconto real

- **Preço normal**: mediana dos mínimos diários dos últimos 90 dias, sem a última semana (para não contar a própria promoção).
- **Desconto real**: `1 - preço atual / preço normal`.
- **Histórico antigo**: vem de cópias das páginas das lojas no Wayback Machine (Internet Archive), lidas aos poucos a cada coleta (`--arquivo N`, padrão 30) e marcadas com círculo vazio no gráfico.
- **Metade do dobro**: loja anuncia 15% ou mais de desconto, mas o desconto real é menor que 2%.
- Cada card tem links para conferir o histórico no Buscapé, no Zoom e, quando há link da Amazon, no Keepa.

## Configuração (`produtos.json`)

- `pecas`: `id`, `categoria`, `nome`, `alvo`, `links`; opcionais `grupo` (alternativas: o total soma só a mais barata), `nota`, `aviso`, `fora_do_total`.
- `vitrines`: `fontes` (`kabum` com `busca` e `menus`, ou `pichau` com `url`), filtros `preco_min`, `preco_max`, `exigir`, `exigir_todos`, `excluir`. Com `automatica`, a melhor opção da vitrine entra na lista e no total.

## Publicar no celular

1. Criar um repositório no GitHub e `git remote add origin ...`.
2. Settings → Pages → Branch `main`, pasta `/docs`.
3. A partir daí, `rodar.sh` faz commit e push do histórico a cada coleta.
