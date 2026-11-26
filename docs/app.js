(() => {
  const DADOS = window.DADOS || { pecas: [], compradas: [], vitrines: [] };
  const CORES = ["#ffffff", "#ef2b2d", "#9ca3af", "#ff8f8f", "#5b5b66", "#d4d4d8"];
  const DIA = 86400000;
  const JANELA_DIAS = 90;
  const DIAS_RECENTES = 7;
  const formato = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  const dataLonga = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const agora = DADOS.atualizado ? new Date(DADOS.atualizado).getTime() : Date.now();

  const brl = (valor) => (valor == null ? "—" : formato.format(valor));
  const pct = (valor) => `${Math.round(Math.abs(valor) * 100)}%`;
  const esc = (texto) => String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tempo = (ponto) => new Date(ponto.t).getTime();
  const chaveDia = (ms) => new Date(ms).toLocaleDateString("sv-SE");

  function mediana(valores) {
    if (!valores.length) return null;
    const ordenados = valores.slice().sort((a, b) => a - b);
    const meio = Math.floor(ordenados.length / 2);
    return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
  }

  function minimosDiarios(series) {
    const porDia = new Map();
    for (const pontos of series) {
      for (const ponto of pontos) {
        if (agora - tempo(ponto) > JANELA_DIAS * DIA || ponto.disp === false) continue;
        const chave = chaveDia(tempo(ponto));
        const atual = porDia.get(chave);
        if (atual == null || ponto.pix < atual) porDia.set(chave, ponto.pix);
      }
    }
    return [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  function descontoReal(atual, diarios) {
    const hoje = chaveDia(agora);
    const corte = chaveDia(agora - DIAS_RECENTES * DIA);
    const anteriores = diarios.filter(([dia]) => dia < hoje).map(([, v]) => v);
    const antesDaPromo = diarios.filter(([dia]) => dia < corte).map(([, v]) => v);
    const base = antesDaPromo.length >= 3 ? mediana(antesDaPromo) : mediana(anteriores);
    const menorAnterior = anteriores.length ? Math.min(...anteriores) : null;
    if (!base || diarios.length < 3) return { base: null, real: null, menorAnterior, dias: diarios.length };
    return { base, real: 1 - atual / base, menorAnterior, dias: diarios.length };
  }

  function veredito({ real, menorAnterior, dias }, atual) {
    if (dias < 3 || real == null) return { classe: "selo-neutro", texto: "Coletando histórico" };
    if (menorAnterior != null && atual <= menorAnterior) return { classe: "selo-recorde", texto: "Menor preço em 90 dias" };
    if (real >= 0.05) return { classe: "selo-abaixo", texto: `Desconto real de ${pct(real)}` };
    if (real <= -0.03) return { classe: "selo-acima", texto: "Mais caro que o normal" };
    return { classe: "selo-neutro", texto: "Preço normal" };
  }

  function ultimo(oferta) {
    const historico = oferta.historico || [];
    for (let i = historico.length - 1; i >= 0; i--) {
      if (!historico[i].arquivo) return historico[i];
    }
    return null;
  }

  function vigente(oferta) {
    const ponto = ultimo(oferta);
    return ponto ? agora - tempo(ponto) < 1.5 * DIA : false;
  }

  function melhorOferta(peca) {
    const comPreco = peca.ofertas.filter((o) => ultimo(o));
    if (!comPreco.length) return null;
    const ordenar = (lista) => lista.slice().sort((a, b) => ultimo(a).pix - ultimo(b).pix)[0];
    const ideais = comPreco.filter((o) => vigente(o) && ultimo(o).disp !== false);
    if (ideais.length) return ordenar(ideais);
    const recentes = comPreco.filter(vigente);
    return ordenar(recentes.length ? recentes : comPreco);
  }

  function analisar(peca) {
    const melhor = melhorOferta(peca);
    if (!melhor) return null;
    const atual = ultimo(melhor).pix;
    const diarios = minimosDiarios(peca.ofertas.map((o) => o.historico || []));
    const desconto = descontoReal(atual, diarios);
    const menor90 = Math.min(atual, ...diarios.map(([, v]) => v));
    return { melhor, atual, menor90, desconto, selo: veredito(desconto, atual) };
  }

  function escolherAutomatica(vitrine) {
    const itens = vitrine.itens.slice().sort((a, b) => a.posicao - b.posicao || b.avaliacoes - a.avaliacoes);
    const topo = itens.filter((i) => i.posicao <= 10);
    const comReal = topo
      .map((item) => ({ item, real: descontoReal(item.pix, minimosDiarios([pontosVitrine(item)])).real }))
      .filter((x) => x.real != null && x.real >= 0.05)
      .sort((a, b) => a.item.pix - b.item.pix);
    if (comReal.length) return { item: comReal[0].item, motivo: `mais procurada com desconto real de ${pct(comReal[0].real)}` };
    const bemAvaliadas = topo.filter((i) => i.avaliacoes >= 20 && i.nota >= 4.5).sort((a, b) => a.pix - b.pix);
    if (bemAvaliadas.length) return { item: bemAvaliadas[0], motivo: `a mais barata entre as mais procuradas com nota ≥ 4,5 (${bemAvaliadas[0].avaliacoes} avaliações)` };
    const baratas = itens.filter((i) => i.posicao <= 5).sort((a, b) => a.pix - b.pix);
    return baratas.length ? { item: baratas[0], motivo: "a mais barata entre as 5 mais procuradas" } : null;
  }

  function pontosVitrine(item) {
    return (item.historico || []).map(([t, pix]) => ({ t, pix, disp: true }));
  }

  function pecasAutomaticas() {
    return (DADOS.vitrines || [])
      .filter((v) => v.automatica && v.itens.length)
      .map((v) => {
        const escolha = escolherAutomatica(v);
        if (!escolha) return null;
        const { item, motivo } = escolha;
        return {
          id: `auto-${v.id}`,
          grupo: `auto-${v.id}`,
          categoria: v.automatica.categoria,
          nome: item.titulo,
          nota: `Escolha automática: ${motivo}. Muda sozinha a cada coleta.`,
          busca: item.titulo,
          alvo: null,
          automatica: true,
          ofertas: [{ url: item.url, loja: item.loja, titulo: item.titulo, falhas: 0, historico: pontosVitrine(item) }],
        };
      })
      .filter(Boolean);
  }

  function melhoresPorGrupo(analises) {
    const grupos = new Map();
    for (const item of analises) {
      if (item.peca.fora_do_total) continue;
      const chave = item.peca.grupo || item.peca.id;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(item);
    }
    return [...grupos.values()].map((itens) => {
      const comPreco = itens.filter((a) => a.analise).sort((a, b) => a.analise.atual - b.analise.atual);
      return comPreco[0] || itens[0];
    });
  }

  function renderResumo(todas) {
    const analises = melhoresPorGrupo(todas);
    const comPreco = analises.filter((a) => a.analise);
    const total = comPreco.reduce((s, a) => s + a.analise.atual, 0);
    const base = comPreco.filter((a) => a.analise.desconto.base);
    const totalNormal = base.reduce((s, a) => s + a.analise.desconto.base, 0);
    const totalAtualComBase = base.reduce((s, a) => s + a.analise.atual, 0);
    const economia = totalNormal - totalAtualComBase;
    const reais = todas.filter((a) => a.analise && ["selo-recorde", "selo-abaixo"].includes(a.analise.selo.classe)).length;

    const notaEconomia = !base.length
      ? `<div class="kpi-nota">Precisa de 3+ dias de histórico</div>`
      : economia >= 0
        ? `<div class="kpi-nota">${brl(economia)} abaixo do preço normal (${base.length} peças)</div>`
        : `<div class="kpi-nota ruim">${brl(-economia)} acima do preço normal (${base.length} peças)</div>`;

    document.getElementById("resumo").innerHTML = `
      <div class="kpi destaque">
        <div class="kpi-rotulo">Melhor total agora</div>
        <div class="kpi-valor">${brl(comPreco.length ? total : null)}</div>
        <div class="kpi-nota">${comPreco.length} itens · placa de vídeo mais barata · sem DDR4</div>
      </div>
      <div class="kpi">
        <div class="kpi-rotulo">Total no preço normal</div>
        <div class="kpi-valor">${brl(base.length ? totalNormal : null)}</div>
        ${notaEconomia}
      </div>
      <div class="kpi">
        <div class="kpi-rotulo">Descontos reais agora</div>
        <div class="kpi-valor">${reais}</div>
        <div class="kpi-nota">comparando com a mediana de 90 dias</div>
      </div>`;
  }

  function renderCompradas() {
    document.getElementById("compradas").innerHTML = (DADOS.compradas || [])
      .map((c) => `<span class="chip">${esc(c.nome)} comprado</span>`)
      .join("");
  }

  function escalaY(valores, alvo) {
    let min = Math.min(...valores);
    let max = Math.max(...valores);
    if (alvo && alvo > min * 0.7 && alvo < max * 1.3) {
      min = Math.min(min, alvo);
      max = Math.max(max, alvo);
    }
    const folga = Math.max((max - min) * 0.12, max * 0.01);
    return [min - folga, max + folga];
  }

  const graficos = [];

  function grafico(peca, base) {
    const series = peca.ofertas
      .map((oferta, i) => ({ oferta, cor: CORES[i % CORES.length], pontos: (oferta.historico || []).filter((p) => agora - tempo(p) <= JANELA_DIAS * DIA) }))
      .filter((s) => s.pontos.length);
    const todos = series.flatMap((s) => s.pontos);
    if (todos.length < 2) {
      return `<div class="grafico-vazio">O gráfico de 90 dias aparece a partir da 2ª coleta</div>`;
    }

    const L = 600, A = 160, ME = 52, MD = 8, MT = 8, MB = 20;
    const t1 = agora;
    const t0 = Math.min(Math.min(...todos.map(tempo)), t1 - 7 * DIA);
    const [y0, y1] = escalaY(todos.map((p) => p.pix), peca.alvo);
    const x = (t) => ME + ((t - t0) / (t1 - t0)) * (L - ME - MD);
    const y = (v) => MT + (1 - (v - y0) / (y1 - y0)) * (A - MT - MB);

    const linhas = [0, 0.5, 1].map((f) => {
      const valor = y0 + (y1 - y0) * f;
      return `<line class="grade-linha" x1="${ME}" x2="${L - MD}" y1="${y(valor)}" y2="${y(valor)}"/>
        <text class="eixo" x="${ME - 6}" y="${y(valor) + 3}" text-anchor="end">${Math.round(valor).toLocaleString("pt-BR")}</text>`;
    }).join("");
    const datas = [t0, (t0 + t1) / 2, t1].map((t, i) =>
      `<text class="eixo" x="${x(t)}" y="${A - 4}" text-anchor="${["start", "middle", "end"][i]}">${dataCurta.format(new Date(t))}</text>`).join("");
    const referencia = (valor, classe) => valor && valor >= y0 && valor <= y1
      ? `<line class="${classe}" x1="${ME}" x2="${L - MD}" y1="${y(valor)}" y2="${y(valor)}"/>`
      : "";
    const caminhos = series.map((s) => {
      const d = s.pontos.map((p, i) => `${i ? "L" : "M"}${x(tempo(p)).toFixed(1)},${y(p.pix).toFixed(1)}`).join("");
      const marcas = s.pontos.length <= 40
        ? s.pontos.map((p) => `<circle cx="${x(tempo(p)).toFixed(1)}" cy="${y(p.pix).toFixed(1)}" r="${p.arquivo ? 2.5 : 2}" fill="${p.arquivo ? "var(--superficie)" : s.cor}" stroke="${s.cor}" stroke-width="1.5"/>`).join("")
        : "";
      return `<path class="serie" d="${d}" stroke="${s.cor}"/>${marcas}`;
    }).join("");
    const temArquivo = todos.some((p) => p.arquivo);
    const legenda = series.map((s) => `<span><i style="background:${s.cor}"></i>${esc(s.oferta.loja)}</span>`).join("")
      + (base ? `<span><i class="tracejado"></i>Preço normal</span>` : "")
      + (peca.alvo ? `<span><i style="background:var(--vermelho);opacity:.7"></i>Alvo</span>` : "")
      + (temArquivo ? `<span><i class="oco"></i>Wayback Machine</span>` : "");

    const indice = graficos.push({ peca, t0, t1, L, ME, MD }) - 1;
    return `<div class="grafico" data-grafico="${indice}">
      <svg viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img" aria-label="Histórico de 90 dias do preço Pix de ${esc(peca.nome)}">
        ${linhas}${referencia(base, "base-linha")}${referencia(peca.alvo, "alvo-linha")}${caminhos}${datas}
        <line class="guia" x1="0" x2="0" y1="${MT}" y2="${A - MB}" visibility="hidden"/>
      </svg>
      <div class="legenda">${legenda}</div>
    </div>`;
  }

  function ofertasHtml(peca, melhor) {
    const ordenadas = peca.ofertas.slice().sort((a, b) => (ultimo(a)?.pix ?? Infinity) - (ultimo(b)?.pix ?? Infinity));
    return ordenadas.map((oferta) => {
      const ponto = ultimo(oferta);
      const classes = ["oferta"];
      if (oferta === melhor) classes.push("melhor");
      if (ponto && ponto.disp === false) classes.push("indisponivel");
      const falha = oferta.falhas ? `<div class="aviso-falha">última coleta falhou (${oferta.falhas}x)</div>` : "";
      const cartao = ponto?.cartao && ponto.cartao !== ponto.pix ? `cartão ${brl(ponto.cartao)}` : "Pix / à vista";
      return `<li class="${classes.join(" ")}">
        <div style="min-width:0">
          <div class="oferta-loja">${esc(oferta.loja)}</div>
          <div class="oferta-titulo" title="${esc(oferta.titulo)}">${esc(oferta.titulo || oferta.url)}</div>
          ${falha}
        </div>
        <div class="oferta-precos"><b>${brl(ponto?.pix)}</b><small>${ponto ? cartao : "sem coleta"}</small></div>
        <a class="ir" href="${esc(oferta.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir na ${esc(oferta.loja)}">↗</a>
      </li>`;
    }).join("");
  }

  function ferramentasHtml(peca) {
    const termo = encodeURIComponent(peca.busca || peca.nome);
    const links = [
      `<a href="https://www.buscape.com.br/search?q=${termo}" target="_blank" rel="noopener noreferrer">Buscapé</a>`,
      `<a href="https://www.zoom.com.br/search?q=${termo}" target="_blank" rel="noopener noreferrer">Zoom</a>`,
    ];
    for (const oferta of peca.ofertas) {
      const asin = (oferta.url.match(/amazon\.com\.br\/(?:.*\/)?dp\/([A-Z0-9]{10})/) || [])[1];
      if (asin) links.push(`<a href="https://keepa.com/#!product/12-${asin}" target="_blank" rel="noopener noreferrer">Keepa (Amazon)</a>`);
    }
    return `<div class="ferramentas">Conferir histórico em: ${links.join("")}</div>`;
  }

  function cardHtml(peca, analise) {
    const cabecalho = (selo) => `<div class="card-topo">
        <div>
          <div class="categoria">${esc(peca.categoria)}${peca.automatica ? ` <span class="auto">automática</span>` : ""}</div>
          <h2 class="nome">${esc(peca.nome)}</h2>
          ${peca.nota ? `<div class="nota">${esc(peca.nota)}</div>` : ""}
        </div>
        ${selo}
      </div>
      ${peca.aviso ? `<div class="aviso">${esc(peca.aviso)}</div>` : ""}`;

    if (!peca.ofertas.length) {
      return `<article class="card">${cabecalho("")}<p class="vazio">Nenhum link ainda. Adicione URLs em <code>produtos.json</code>.</p></article>`;
    }
    if (!analise) {
      return `<article class="card">${cabecalho(`<span class="selo selo-neutro">Aguardando coleta</span>`)}<ul class="ofertas">${ofertasHtml(peca, null)}</ul></article>`;
    }

    const { melhor, atual, menor90, desconto, selo } = analise;
    const quente = selo.classe === "selo-recorde" || selo.classe === "selo-abaixo" || (peca.alvo && atual <= peca.alvo);
    const real = desconto.real == null
      ? `<b>—</b>`
      : desconto.real >= 0
        ? `<b class="bom">-${pct(desconto.real)}</b>`
        : `<b class="ruim">+${pct(desconto.real)}</b>`;
    const alvoHtml = !peca.alvo ? "" : (() => {
      const batido = atual <= peca.alvo;
      const progresso = Math.max(0, Math.min(1, peca.alvo / atual)) * 100;
      const texto = batido ? `No alvo! ${brl(peca.alvo - atual)} abaixo de ${brl(peca.alvo)}` : `Faltam ${brl(atual - peca.alvo)} para o alvo de ${brl(peca.alvo)}`;
      return `<div><div class="alvo-barra ${batido ? "batido" : ""}"><i style="width:${progresso}%"></i></div><div class="alvo-texto">${texto}</div></div>`;
    })();

    return `<article class="card ${quente ? "quente" : ""} ${peca.fora_do_total ? "fora" : ""}">
      ${cabecalho(`<span class="selo ${selo.classe}">${selo.texto}</span>`)}
      <div>
        <div class="preco-linha"><span class="preco">${brl(atual)}</span></div>
        <div class="preco-loja">no Pix na <strong>${esc(melhor.loja)}</strong></div>
      </div>
      <div class="metricas">
        <div class="metrica"><span>Preço normal</span><b>${brl(desconto.base)}</b></div>
        <div class="metrica"><span>Menor 90d</span><b>${brl(menor90)}</b></div>
        <div class="metrica"><span>Desconto real</span>${real}</div>
      </div>
      ${alvoHtml}
      ${grafico(peca, desconto.base)}
      <ul class="ofertas">${ofertasHtml(peca, melhor)}</ul>
      ${ferramentasHtml(peca)}
    </article>`;
  }

  function ativarDicas() {
    const dica = document.getElementById("dica");
    document.querySelectorAll(".grafico[data-grafico]").forEach((caixa) => {
      const { peca, t0, t1, L, ME, MD } = graficos[Number(caixa.dataset.grafico)];
      const svg = caixa.querySelector("svg");
      const guia = caixa.querySelector(".guia");
      const esconder = () => {
        dica.hidden = true;
        guia.setAttribute("visibility", "hidden");
      };
      svg.addEventListener("pointermove", (evento) => {
        const caixaSvg = svg.getBoundingClientRect();
        const xSvg = ((evento.clientX - caixaSvg.left) / caixaSvg.width) * L;
        const fracao = Math.max(0, Math.min(1, (xSvg - ME) / (L - ME - MD)));
        const instante = t0 + fracao * (t1 - t0);
        const linhas = peca.ofertas.map((oferta, i) => {
          const anteriores = (oferta.historico || []).filter((p) => tempo(p) <= instante);
          const ponto = anteriores[anteriores.length - 1];
          const cor = CORES[i % CORES.length] === "#ffffff" ? "#0a0a0b" : CORES[i % CORES.length];
          return ponto ? `<div><span style="color:${cor}">●</span> ${esc(oferta.loja)}: <b>${brl(ponto.pix)}</b>${ponto.arquivo ? " <small>(arquivo)</small>" : ""}</div>` : "";
        }).join("");
        if (!linhas) return esconder();
        const posicao = ME + fracao * (L - ME - MD);
        guia.setAttribute("x1", posicao);
        guia.setAttribute("x2", posicao);
        guia.setAttribute("visibility", "visible");
        dica.innerHTML = `<div style="opacity:.6;margin-bottom:2px">${dataLonga.format(new Date(instante))}</div>${linhas}`;
        dica.hidden = false;
        const largura = dica.offsetWidth;
        const esquerda = evento.clientX + 14 + largura > window.innerWidth ? evento.clientX - largura - 14 : evento.clientX + 14;
        dica.style.left = `${Math.max(8, esquerda)}px`;
        dica.style.top = `${evento.clientY - dica.offsetHeight - 12}px`;
      });
      svg.addEventListener("pointerleave", esconder);
    });
  }

  function realVitrine(item) {
    return descontoReal(item.pix, minimosDiarios([pontosVitrine(item)])).real;
  }

  const ORDENS = {
    procurados: { rotulo: "Mais procurados", ordenar: (a, b) => a.posicao - b.posicao || b.avaliacoes - a.avaliacoes },
    real: { rotulo: "Desconto real", ordenar: (a, b) => (realVitrine(b) ?? -1) - (realVitrine(a) ?? -1) || a.posicao - b.posicao },
    preco: { rotulo: "Menor preço", ordenar: (a, b) => a.pix - b.pix },
  };
  const VISIVEIS = 8;
  const estadoVitrine = {};

  function sparkline(item) {
    const pontos = pontosVitrine(item).filter((p) => agora - tempo(p) <= JANELA_DIAS * DIA);
    if (pontos.length < 2) return "";
    const L = 90, A = 26;
    const t0 = Math.min(tempo(pontos[0]), agora - 7 * DIA);
    const valores = pontos.map((p) => p.pix);
    const min = Math.min(...valores), max = Math.max(...valores);
    const faixa = max - min || 1;
    const d = pontos.map((p, i) => `${i ? "L" : "M"}${(((tempo(p) - t0) / (agora - t0)) * L).toFixed(1)},${(A - 3 - ((p.pix - min) / faixa) * (A - 6)).toFixed(1)}`).join("");
    const subiu = valores[valores.length - 1] > valores[0];
    return `<svg class="spark" viewBox="0 0 ${L} ${A}" aria-label="Preço nos últimos 90 dias: de ${brl(valores[0])} a ${brl(valores[valores.length - 1])}"><path d="${d}" stroke="${subiu ? "var(--vermelho)" : "var(--branco)"}"/></svg>`;
  }

  function itemVitrineHtml(item, escolhido) {
    const real = realVitrine(item);
    const anunciado = item.desconto >= 0.05 ? `<span class="desconto">anunciado -${pct(item.desconto)}</span>` : "";
    let selos = anunciado;
    if (real != null && real >= 0.05) selos = `<span class="desconto forte">real -${pct(real)}</span>${anunciado}`;
    if (real != null && real < 0.02 && item.desconto >= 0.15) selos = `<span class="selo selo-acima">Metade do dobro</span>${anunciado}`;
    const avaliacoes = item.avaliacoes ? `<span>★ ${Number(item.nota).toFixed(1)} (${item.avaliacoes})</span>` : "";
    const oferta = item.oferta ? `<span class="tag-oferta">${esc(item.oferta)}</span>` : "";
    const imagem = item.imagem
      ? `<img src="${esc(item.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="sem-imagem"></span>`;
    return `<li class="vitem ${escolhido ? "escolhido" : ""}">
      <a class="vitem-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
        <div class="vitem-img">${imagem}</div>
        <div class="vitem-info">
          <div class="vitem-titulo">${escolhido ? `<span class="auto">na lista</span> ` : ""}${esc(item.titulo)}</div>
          <div class="vitem-meta"><strong>${esc(item.loja)}</strong><span>#${item.posicao} ${item.loja === "KaBuM!" ? "mais procurado" : "em destaque"}</span>${avaliacoes}${oferta}</div>
        </div>
        <div class="vitem-preco">
          <b>${brl(item.pix)}</b>
          ${sparkline(item)}
          <div class="vitem-selos">${selos}</div>
        </div>
      </a>
    </li>`;
  }

  function renderVitrine(vitrine) {
    const estado = estadoVitrine[vitrine.id] || (estadoVitrine[vitrine.id] = { ordem: "procurados", loja: "todas", tudo: false });
    const escolhido = vitrine.automatica ? escolherAutomatica(vitrine)?.item.url : null;
    const lojas = [...new Set(vitrine.itens.map((i) => i.loja))];
    const filtrados = vitrine.itens
      .filter((i) => estado.loja === "todas" || i.loja === estado.loja)
      .slice()
      .sort(ORDENS[estado.ordem].ordenar);
    const visiveis = estado.tudo ? filtrados : filtrados.slice(0, VISIVEIS);
    const botao = (grupo, valor, rotulo, ativo) =>
      `<button type="button" class="filtro ${ativo ? "ativo" : ""}" data-vitrine="${vitrine.id}" data-${grupo}="${esc(valor)}" aria-pressed="${ativo}">${esc(rotulo)}</button>`;
    const ordens = Object.entries(ORDENS).map(([chave, ordem]) => botao("ordem", chave, ordem.rotulo, estado.ordem === chave)).join("");
    const filtroLojas = lojas.length > 1
      ? [botao("loja", "todas", "Todas", estado.loja === "todas"), ...lojas.map((l) => botao("loja", l, l, estado.loja === l))].join("")
      : "";
    const mais = filtrados.length > VISIVEIS
      ? `<button type="button" class="ver-mais" data-vitrine="${vitrine.id}" data-tudo="1">${estado.tudo ? "Mostrar menos" : `Ver todos (${filtrados.length})`}</button>`
      : "";
    const corpo = vitrine.itens.length
      ? `<ul class="vlista">${visiveis.map((i) => itemVitrineHtml(i, i.url === escolhido)).join("")}</ul>${mais}`
      : `<p class="vazio">Ainda sem dados. Rode a coleta.</p>`;

    return `<article class="vitrine" id="vitrine-${vitrine.id}">
      <header class="vitrine-topo">
        <div><h3>${esc(vitrine.titulo)}</h3><p>${esc(vitrine.descricao)}</p></div>
        <div class="filtros"><div class="grupo-filtro">${ordens}</div>${filtroLojas ? `<div class="grupo-filtro">${filtroLojas}</div>` : ""}</div>
      </header>
      ${corpo}
    </article>`;
  }

  function renderVitrines() {
    const vitrines = DADOS.vitrines || [];
    const alvo = document.getElementById("vitrines");
    if (!vitrines.length) {
      alvo.hidden = true;
      return;
    }
    alvo.innerHTML = `<h2 class="secao-titulo">Vitrines <span>ofertas do momento</span></h2>
      <p class="secao-nota"><b>Anunciado</b> é o desconto que a loja mostra sobre o preço "de", que costuma ser inflado. <b>Real</b> compara com a mediana do preço nos últimos 90 dias (coletas + Wayback Machine). <b>Metade do dobro</b> marca promoção anunciada acima de 15% sem queda real.</p>
      ${vitrines.map(renderVitrine).join("")}`;
  }

  function ativarVitrines() {
    document.getElementById("vitrines").addEventListener("click", (evento) => {
      const botao = evento.target.closest("button[data-vitrine]");
      if (!botao) return;
      const id = botao.dataset.vitrine;
      const estado = estadoVitrine[id];
      if (botao.dataset.ordem) estado.ordem = botao.dataset.ordem;
      if (botao.dataset.loja) estado.loja = botao.dataset.loja;
      if (botao.dataset.tudo) estado.tudo = !estado.tudo;
      const vitrine = DADOS.vitrines.find((v) => v.id === id);
      document.getElementById(`vitrine-${id}`).outerHTML = renderVitrine(vitrine);
    });
  }

  function iniciar() {
    if (DADOS.atualizado) {
      document.getElementById("atualizado").textContent = `Última coleta: ${dataLonga.format(new Date(DADOS.atualizado))}`;
    }
    const pecas = [...DADOS.pecas, ...pecasAutomaticas()];
    const analises = pecas.map((peca) => ({ peca, analise: analisar(peca) }));
    renderResumo(analises);
    renderCompradas();
    document.getElementById("pecas").innerHTML = analises.map(({ peca, analise }) => cardHtml(peca, analise)).join("");
    ativarDicas();
    renderVitrines();
    ativarVitrines();
  }

  iniciar();
})();
