(() => {
  const DADOS = window.DADOS || { pecas: [], compradas: [], vitrines: [] };
  const DIA = 86400000;
  const JANELA_DIAS = 90;
  const DIAS_RECENTES = 7;
  const TOPO = 14;
  const BASE = 6;
  const NS = "http://www.w3.org/2000/svg";
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const formato = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const dataLonga = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const mesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  const agora = DADOS.atualizado ? new Date(DADOS.atualizado).getTime() : Date.now();

  const brl = (valor) => (valor == null ? "—" : formato.format(valor));
  const pct = (valor) => `${Math.round(Math.abs(valor) * 100)}%`;
  const esc = (texto) => String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tempo = (ponto) => new Date(ponto.t).getTime();
  const chaveDia = (ms) => new Date(ms).toLocaleDateString("sv-SE");
  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

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
    const valores = diarios.map(([, v]) => v);
    const desconto = descontoReal(atual, diarios);
    return {
      melhor,
      atual,
      menor90: Math.min(atual, ...valores),
      maior90: Math.max(atual, ...valores),
      desconto,
      selo: veredito(desconto, atual),
    };
  }

  function pontosVitrine(item) {
    return (item.historico || []).map(([t, pix]) => ({ t, pix, disp: true }));
  }

  function realVitrine(item) {
    return descontoReal(item.pix, minimosDiarios([pontosVitrine(item)])).real;
  }

  function escolherAutomatica(vitrine) {
    const itens = vitrine.itens.slice().sort((a, b) => a.posicao - b.posicao || b.avaliacoes - a.avaliacoes);
    const topo = itens.filter((i) => i.posicao <= 10);
    const comReal = topo
      .map((item) => ({ item, real: realVitrine(item) }))
      .filter((x) => x.real != null && x.real >= 0.05)
      .sort((a, b) => a.item.pix - b.item.pix);
    if (comReal.length) return { item: comReal[0].item, motivo: `mais procurada com desconto real de ${pct(comReal[0].real)}` };
    const bemAvaliadas = topo.filter((i) => i.avaliacoes >= 20 && i.nota >= 4.5).sort((a, b) => a.pix - b.pix);
    if (bemAvaliadas.length) return { item: bemAvaliadas[0], motivo: `a mais barata entre as mais procuradas com nota ≥ 4,5 (${bemAvaliadas[0].avaliacoes} avaliações)` };
    const baratas = itens.filter((i) => i.posicao <= 5).sort((a, b) => a.pix - b.pix);
    return baratas.length ? { item: baratas[0], motivo: "a mais barata entre as 5 mais procuradas" } : null;
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
    const economia = totalNormal - base.reduce((s, a) => s + a.analise.atual, 0);
    const reais = todas.filter((a) => a.analise && ["selo-recorde", "selo-abaixo"].includes(a.analise.selo.classe)).length;
    const notaNormal = !base.length
      ? "precisa de 3+ dias de histórico"
      : economia >= 0
        ? `<span class="desce">↓ ${brl(economia)}</span> vs preço normal em ${base.length} peças`
        : `<span class="sobe">↑ ${brl(-economia)}</span> vs preço normal em ${base.length} peças`;

    document.getElementById("resumo").innerHTML = `
      <div class="kpi">
        <div class="rotulo">Melhor total agora</div>
        <div class="kpi-valor">${brl(comPreco.length ? total : null)}</div>
        <div class="kpi-nota">${comPreco.length} itens · GPU mais barata · sem DDR4</div>
      </div>
      <div class="kpi">
        <div class="rotulo">Total no preço normal</div>
        <div class="kpi-valor">${brl(base.length ? totalNormal : null)}</div>
        <div class="kpi-nota">${notaNormal}</div>
      </div>
      <div class="kpi">
        <div class="rotulo">Descontos reais</div>
        <div class="kpi-valor">${String(reais).padStart(2, "0")}<span style="color:var(--ovio-faint)"> / ${String(todas.filter((a) => a.analise).length).padStart(2, "0")}</span></div>
        <div class="kpi-nota">abaixo da mediana de 90 dias</div>
      </div>`;
  }

  function renderCompradas() {
    document.getElementById("compradas").innerHTML = (DADOS.compradas || [])
      .map((c) => `<span class="chip">${esc(c.nome)}</span>`)
      .join("");
  }

  function ofertasHtml(peca, melhor) {
    const ordenadas = peca.ofertas.slice().sort((a, b) => (ultimo(a)?.pix ?? Infinity) - (ultimo(b)?.pix ?? Infinity));
    return ordenadas.map((oferta) => {
      const ponto = ultimo(oferta);
      const classes = ["oferta"];
      if (oferta === melhor) classes.push("melhor");
      if (ponto && ponto.disp === false) classes.push("indisponivel");
      const falha = oferta.falhas ? `<div class="aviso-falha">última coleta falhou (${oferta.falhas}x)</div>` : "";
      const cartao = ponto?.cartao && ponto.cartao !== ponto.pix ? `cartão ${brl(ponto.cartao)}` : "pix";
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
      if (asin) links.push(`<a href="https://keepa.com/#!product/12-${asin}" target="_blank" rel="noopener noreferrer">Keepa</a>`);
    }
    return `<div class="ferramentas"><span class="rotulo">Conferir histórico</span>${links.join("")}</div>`;
  }

  function faixaHtml({ atual, menor90, maior90, desconto }) {
    if (maior90 - menor90 < 0.01) return "";
    const fracao = (v) => limitar((v - menor90) / (maior90 - menor90), 0, 1);
    const normal = desconto.base;
    const caro = normal && atual > normal;
    return `<div>
      <div class="faixa-barra ${caro ? "caro" : ""}" role="img" aria-label="Preço atual ${brl(atual)} na faixa de 90 dias entre ${brl(menor90)} e ${brl(maior90)}">
        <div class="preenchido" data-fracao="${Math.max(fracao(atual), 0.015)}"></div>
        ${normal ? `<div class="marcador" style="translate:${fracao(normal) * 100}cqw 0"></div>` : ""}
      </div>
      <div class="faixa-legenda mono"><span>${brl(menor90)}</span><span>${normal ? `normal ${brl(normal)}` : ""}</span><span>${brl(maior90)}</span></div>
    </div>`;
  }

  function metaHtml(peca, atual) {
    if (!peca.alvo) return "";
    const batida = atual <= peca.alvo;
    const progresso = limitar(peca.alvo / atual, 0, 1);
    const texto = batida ? `no alvo de ${brl(peca.alvo)}` : `faltam ${brl(atual - peca.alvo)} para ${brl(peca.alvo)}`;
    return `<div class="meta ${batida ? "batida" : ""}">
      <span class="meta-trilho" aria-hidden="true"><i data-escala="${progresso}"></i></span>
      <span class="mono">${Math.round(progresso * 100)}%</span> do alvo · ${texto}
    </div>`;
  }

  const graficos = [];

  function cardHtml(peca, analise) {
    const cabecalho = (selo) => `<div class="card-topo">
        <div style="min-width:0">
          <div class="rotulo">${esc(peca.categoria)}${peca.automatica ? `<span class="auto">automática</span>` : ""}</div>
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
    const delta = desconto.real == null
      ? `<div class="delta">sem base de comparação ainda</div>`
      : desconto.real >= 0
        ? `<div class="delta"><b class="desce">↓ ${pct(desconto.real)}</b> vs preço normal</div>`
        : `<div class="delta"><b class="sobe">↑ ${pct(desconto.real)}</b> vs preço normal</div>`;
    const classeReal = desconto.real == null ? "" : desconto.real >= 0 ? "desce" : "sobe";
    const indice = graficos.push({ peca, analise }) - 1;

    return `<article class="card ${quente ? "quente" : ""} ${peca.fora_do_total ? "fora" : ""}">
      ${cabecalho(`<span class="selo ${selo.classe}">${selo.texto}</span>`)}
      <div class="heroi">
        <div>
          <div class="rotulo">Melhor preço agora · pix</div>
          <div class="heroi-valor" style="margin-top:10px">${brl(atual)}</div>
          <div class="heroi-loja">na <strong>${esc(melhor.loja)}</strong></div>
        </div>
        ${delta}
      </div>
      ${faixaHtml(analise)}
      <dl class="linhas">
        <div class="linha"><dt>Preço normal (mediana 90d)</dt><dd>${brl(desconto.base)}</dd></div>
        <div class="linha"><dt>Menor em 90 dias</dt><dd>${brl(menor90)}</dd></div>
        <div class="linha"><dt>Desconto real</dt><dd class="${classeReal}">${desconto.real == null ? "—" : `${desconto.real >= 0 ? "−" : "+"}${pct(desconto.real)}`}</dd></div>
      </dl>
      ${metaHtml(peca, atual)}
      <figure class="historico" data-grafico="${indice}">
        <div class="historico-topo">
          <span class="rotulo">Histórico 90 dias · pix</span>
          <span class="historico-leitura"><span class="historico-data"></span><span class="historico-numero mono"></span></span>
        </div>
        <div class="plot" tabindex="0" role="slider" aria-label="Histórico de preço de ${esc(peca.nome)}. Use as setas para navegar."></div>
        <div class="historico-loja"></div>
        <div class="meses"></div>
        <div class="legenda"></div>
      </figure>
      <ul class="ofertas">${ofertasHtml(peca, melhor)}</ul>
      ${ferramentasHtml(peca)}
    </article>`;
  }

  function seriesDoGrafico(peca, melhor) {
    return peca.ofertas
      .map((oferta) => ({
        oferta,
        principal: oferta === melhor,
        pontos: (oferta.historico || []).filter((p) => agora - tempo(p) <= JANELA_DIAS * DIA && p.disp !== false),
      }))
      .filter((s) => s.pontos.length)
      .sort((a, b) => Number(a.principal) - Number(b.principal));
  }

  function montarGrafico(figura) {
    const { peca, analise } = graficos[Number(figura.dataset.grafico)];
    const plot = figura.querySelector(".plot");
    const series = seriesDoGrafico(peca, analise.melhor);
    const todos = series.flatMap((s) => s.pontos);
    if (todos.length < 2) {
      plot.outerHTML = `<div class="historico-vazio">O gráfico aparece a partir da 2ª coleta</div>`;
      figura.querySelector(".historico-leitura").textContent = "";
      return;
    }

    const t1 = agora;
    const t0 = Math.min(...todos.map(tempo), t1 - 14 * DIA);
    const valores = todos.map((p) => p.pix);
    const referencias = [analise.desconto.base, peca.alvo].filter((v) => v && v > Math.min(...valores) * 0.8 && v < Math.max(...valores) * 1.2);
    const minimo = Math.min(...valores, ...referencias);
    const maximo = Math.max(...valores, ...referencias);
    const folga = Math.max((maximo - minimo) * 0.08, maximo * 0.01);
    const y0 = minimo - folga;
    const y1 = maximo + folga;
    const principal = series.find((s) => s.principal) || series[series.length - 1];
    const estado = { indice: null };

    const desenhar = (animar) => {
      const L = plot.clientWidth;
      const A = plot.clientHeight;
      if (!L || !A) return;
      const x = (t) => ((t - t0) / (t1 - t0)) * L;
      const y = (v) => A - BASE - ((v - y0) / (y1 - y0)) * (A - TOPO - BASE);
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${L} ${A}`);
      svg.setAttribute("aria-hidden", "true");
      const linhaRef = (valor, classe) => {
        if (!valor || valor < y0 || valor > y1) return;
        const linha = document.createElementNS(NS, "line");
        linha.setAttribute("class", `ref ${classe}`);
        linha.setAttribute("x1", 0);
        linha.setAttribute("x2", L);
        linha.setAttribute("y1", y(valor));
        linha.setAttribute("y2", y(valor));
        svg.append(linha);
      };
      linhaRef(analise.desconto.base, "normal");
      linhaRef(peca.alvo, "alvo");
      for (const serie of series) {
        const caminho = document.createElementNS(NS, "path");
        caminho.setAttribute("class", `serie ${serie.principal ? "principal" : "outra"}`);
        caminho.setAttribute("d", serie.pontos.map((p, i) => `${i ? "L" : "M"}${x(tempo(p)).toFixed(1)},${y(p.pix).toFixed(1)}`).join(""));
        svg.append(caminho);
        if (serie.principal && animar && !reduzido) {
          const comprimento = caminho.getTotalLength ? caminho.getTotalLength() : 0;
          if (comprimento) {
            caminho.style.strokeDasharray = comprimento;
            caminho.style.strokeDashoffset = comprimento;
            caminho.animate([{ strokeDashoffset: comprimento }, { strokeDashoffset: 0 }], { duration: 1000, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" });
          }
        }
      }
      plot.replaceChildren(svg);

      for (const serie of series) {
        for (const p of serie.pontos.filter((p) => p.arquivo)) {
          const marca = document.createElement("span");
          marca.className = "arquivo";
          marca.style.left = `${x(tempo(p))}px`;
          marca.style.top = `${y(p.pix)}px`;
          plot.append(marca);
        }
      }

      const fim = principal.pontos[principal.pontos.length - 1];
      const pulso = document.createElement("span");
      pulso.className = "pulso";
      pulso.style.left = `${x(tempo(fim))}px`;
      pulso.style.top = `${y(fim.pix)}px`;
      plot.append(pulso);

      const menorPonto = todos.reduce((a, b) => (b.pix < a.pix ? b : a));
      const ehAgora = menorPonto.pix >= analise.atual - 0.01 && agora - tempo(menorPonto) < 1.5 * DIA;
      const posicaoX = x(tempo(menorPonto));
      const anotacao = document.createElement("span");
      anotacao.className = `anotacao ${ehAgora ? "vermelha" : ""} ${posicaoX < 70 ? "borda-esq" : posicaoX > L - 70 ? "borda-dir" : ""}`;
      anotacao.textContent = ehAgora ? `menor agora` : `menor · ${brl(menorPonto.pix)}`;
      anotacao.style.left = `${posicaoX}px`;
      anotacao.style.top = `${y(menorPonto.pix) - 4}px`;
      anotacao.style.animationDelay = animar && !reduzido ? `${(posicaoX / L) * 1000}ms` : "0ms";
      if (y(menorPonto.pix) > 40) plot.append(anotacao);

      const regua = document.createElement("span");
      regua.className = "regua";
      regua.hidden = true;
      const ponto = document.createElement("span");
      ponto.className = "ponto";
      ponto.hidden = true;
      plot.append(regua, ponto);
      estado.x = x;
      estado.y = y;
      estado.regua = regua;
      estado.ponto = ponto;
      if (estado.indice != null) mostrar(estado.indice);
    };

    const leitura = figura.querySelector(".historico-numero");
    const data = figura.querySelector(".historico-data");
    const lojas = figura.querySelector(".historico-loja");
    const pontos = principal.pontos;

    const repouso = () => {
      estado.indice = null;
      if (estado.regua) {
        estado.regua.hidden = true;
        estado.ponto.hidden = true;
      }
      leitura.textContent = brl(analise.atual);
      data.textContent = "agora";
      lojas.textContent = "";
      plot.setAttribute("aria-valuetext", `agora: ${brl(analise.atual)}`);
    };

    const mostrar = (indice) => {
      estado.indice = indice;
      const p = pontos[indice];
      const instante = tempo(p);
      estado.regua.hidden = false;
      estado.ponto.hidden = false;
      estado.regua.style.left = `${estado.x(instante)}px`;
      estado.ponto.style.left = `${estado.x(instante)}px`;
      estado.ponto.style.top = `${estado.y(p.pix)}px`;
      leitura.textContent = brl(p.pix);
      data.textContent = `${p.arquivo ? dataCurta.format(new Date(instante)) : dataLonga.format(new Date(instante))}${p.arquivo ? " · arquivo" : ""}`;
      const outras = series
        .filter((s) => !s.principal)
        .map((s) => {
          const anteriores = s.pontos.filter((q) => tempo(q) <= instante);
          const q = anteriores[anteriores.length - 1];
          return q ? `${s.oferta.loja} ${brl(q.pix)}` : null;
        })
        .filter(Boolean);
      lojas.textContent = [`${principal.oferta.loja} ${brl(p.pix)}`, ...outras].join(" · ");
      plot.setAttribute("aria-valuetext", `${dataCurta.format(new Date(instante))}: ${brl(p.pix)}`);
    };

    plot.addEventListener("pointermove", (evento) => {
      const caixa = plot.getBoundingClientRect();
      const instante = t0 + limitar((evento.clientX - caixa.left) / caixa.width, 0, 1) * (t1 - t0);
      let melhor = 0;
      for (let i = 1; i < pontos.length; i++) {
        if (Math.abs(tempo(pontos[i]) - instante) < Math.abs(tempo(pontos[melhor]) - instante)) melhor = i;
      }
      mostrar(melhor);
    });
    plot.addEventListener("pointerleave", repouso);
    plot.addEventListener("blur", repouso);
    plot.addEventListener("keydown", (evento) => {
      const passos = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
      if (!(evento.key in passos)) return;
      evento.preventDefault();
      const atual = estado.indice ?? pontos.length - 1;
      mostrar(limitar(atual + passos[evento.key], 0, pontos.length - 1));
    });

    const meses = [];
    const cursor = new Date(t0);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + 1);
    while (cursor.getTime() <= t1) {
      meses.push(mesCurto.format(cursor).replace(".", ""));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    figura.querySelector(".meses").innerHTML = [dataCurta.format(new Date(t0)), ...meses, "hoje"]
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((m) => `<span>${esc(m)}</span>`)
      .join("");

    const temArquivo = todos.some((p) => p.arquivo);
    figura.querySelector(".legenda").innerHTML = [
      `<span><i class="principal"></i>${esc(principal.oferta.loja)}</span>`,
      series.length > 1 ? `<span><i class="outra"></i>outras lojas</span>` : "",
      analise.desconto.base ? `<span><i class="normal"></i>preço normal</span>` : "",
      peca.alvo ? `<span><i class="alvo"></i>alvo</span>` : "",
      temArquivo ? `<span><i class="oco"></i>Wayback Machine</span>` : "",
    ].join("");

    repouso();
    let animou = false;
    const observador = new ResizeObserver(() => {
      desenhar(!animou);
      animou = true;
    });
    observador.observe(plot);
  }

  function animarEntradas(raiz) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      raiz.querySelectorAll(".preenchido[data-fracao]").forEach((el) => {
        el.style.clipPath = `inset(0 ${(1 - Number(el.dataset.fracao)) * 100}% 0 0 round 3px)`;
      });
      raiz.querySelectorAll(".meta-trilho i[data-escala]").forEach((el) => {
        el.style.transform = `scaleX(${el.dataset.escala})`;
      });
    }));
  }

  const ORDENS = [
    { chave: "procurados", rotulo: "Mais procurados", ordenar: (a, b) => a.posicao - b.posicao || b.avaliacoes - a.avaliacoes },
    { chave: "real", rotulo: "Desconto real", ordenar: (a, b) => (realVitrine(b) ?? -1) - (realVitrine(a) ?? -1) || a.posicao - b.posicao },
    { chave: "preco", rotulo: "Menor preço", ordenar: (a, b) => a.pix - b.pix },
  ];
  const VISIVEIS = 8;
  const estadoVitrine = {};

  function sparkline(item) {
    const pontos = pontosVitrine(item).filter((p) => agora - tempo(p) <= JANELA_DIAS * DIA);
    if (pontos.length < 2) return "";
    const L = 84, A = 22;
    const t0 = Math.min(tempo(pontos[0]), agora - 7 * DIA);
    const valores = pontos.map((p) => p.pix);
    const min = Math.min(...valores), max = Math.max(...valores);
    const faixa = max - min || 1;
    const d = pontos.map((p, i) => `${i ? "L" : "M"}${(((tempo(p) - t0) / (agora - t0)) * L).toFixed(1)},${(A - 2 - ((p.pix - min) / faixa) * (A - 4)).toFixed(1)}`).join("");
    const subiu = valores[valores.length - 1] > valores[0];
    return `<svg class="spark" viewBox="0 0 ${L} ${A}" aria-label="90 dias: de ${brl(valores[0])} a ${brl(valores[valores.length - 1])}"><path d="${d}" stroke="${subiu ? "var(--ovio-red)" : "var(--ovio-ink)"}"/></svg>`;
  }

  function itemVitrineHtml(item, escolhido, ordem) {
    const real = realVitrine(item);
    const anunciado = item.desconto >= 0.05 ? `<span class="desconto">anunciado −${pct(item.desconto)}</span>` : "";
    let selos = anunciado;
    if (real != null && real >= 0.05) selos = `<span class="desconto forte">real −${pct(real)}</span>${anunciado}`;
    if (real != null && real < 0.02 && item.desconto >= 0.15) selos = `<span class="selo selo-acima">metade do dobro</span>${anunciado}`;
    const avaliacoes = item.avaliacoes ? `<span class="mono">★ ${Number(item.nota).toFixed(1)} (${item.avaliacoes})</span>` : "";
    const oferta = item.oferta ? `<span class="tag-oferta">${esc(item.oferta)}</span>` : "";
    const imagem = item.imagem
      ? `<img src="${esc(item.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="sem-imagem"></span>`;
    return `<li class="vitem ${escolhido ? "escolhido" : ""}" style="animation-delay:${Math.min(ordem, 12) * 16}ms">
      <a class="vitem-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
        <div class="vitem-img">${imagem}</div>
        <div class="vitem-info">
          <div class="vitem-titulo">${escolhido ? `<span class="auto">na lista</span> ` : ""}${esc(item.titulo)}</div>
          <div class="vitem-meta"><strong>${esc(item.loja)}</strong><span class="mono">#${String(item.posicao).padStart(2, "0")}</span>${avaliacoes}${oferta}</div>
        </div>
        <div class="vitem-preco">
          <b>${brl(item.pix)}</b>
          ${sparkline(item)}
          <div class="vitem-selos">${selos}</div>
        </div>
      </a>
    </li>`;
  }

  function liquidoHtml(vitrineId, grupo, opcoes, ativo, vermelho) {
    const indice = Math.max(0, opcoes.findIndex((o) => o.valor === ativo));
    const n = opcoes.length;
    return `<div class="liquido ${vermelho ? "vermelho" : ""}" role="group" data-grupo="${grupo}" data-indice="${indice}" data-total="${n}">
      <span class="liquido-pilula" style="left:calc(${(indice / n) * 100}% + 3px);right:calc(${((n - indice - 1) / n) * 100}% + 3px)"></span>
      ${opcoes.map((o, i) => `<button type="button" data-vitrine="${vitrineId}" data-${grupo}="${esc(o.valor)}" data-i="${i}" aria-pressed="${o.valor === ativo}">${esc(o.rotulo)}</button>`).join("")}
    </div>`;
  }

  function moverLiquido(grupoEl, novo) {
    const n = Number(grupoEl.dataset.total);
    const anterior = Number(grupoEl.dataset.indice);
    if (novo === anterior) return;
    const pilula = grupoEl.querySelector(".liquido-pilula");
    pilula.classList.remove("p-direita", "p-esquerda");
    pilula.classList.add(novo > anterior ? "p-direita" : "p-esquerda");
    pilula.style.left = `calc(${(novo / n) * 100}% + 3px)`;
    pilula.style.right = `calc(${((n - novo - 1) / n) * 100}% + 3px)`;
    grupoEl.dataset.indice = novo;
    grupoEl.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === novo)));
  }

  function corpoVitrineHtml(vitrine) {
    const estado = estadoVitrine[vitrine.id];
    const escolhido = vitrine.automatica ? escolherAutomatica(vitrine)?.item.url : null;
    const ordem = ORDENS.find((o) => o.chave === estado.ordem);
    const filtrados = vitrine.itens
      .filter((i) => estado.loja === "todas" || i.loja === estado.loja)
      .slice()
      .sort(ordem.ordenar);
    const visiveis = estado.tudo ? filtrados : filtrados.slice(0, VISIVEIS);
    const mais = filtrados.length > VISIVEIS
      ? `<button type="button" class="ver-mais" data-vitrine="${vitrine.id}" data-tudo="1">${estado.tudo ? "Mostrar menos" : `Ver todos (${filtrados.length})`}</button>`
      : "";
    if (!vitrine.itens.length) return `<p class="vazio">Ainda sem dados. Rode a coleta.</p>`;
    return `<ul class="vlista">${visiveis.map((i, n) => itemVitrineHtml(i, i.url === escolhido, n)).join("")}</ul>${mais}`;
  }

  function renderVitrine(vitrine, numero, total) {
    const estado = estadoVitrine[vitrine.id] || (estadoVitrine[vitrine.id] = { ordem: "procurados", loja: "todas", tudo: false });
    const lojas = [...new Set(vitrine.itens.map((i) => i.loja))];
    const ordens = liquidoHtml(vitrine.id, "ordem", ORDENS.map((o) => ({ valor: o.chave, rotulo: o.rotulo })), estado.ordem, false);
    const filtroLojas = lojas.length > 1
      ? liquidoHtml(vitrine.id, "loja", [{ valor: "todas", rotulo: "Todas" }, ...lojas.map((l) => ({ valor: l, rotulo: l }))], estado.loja, true)
      : "";
    return `<article class="vitrine" id="vitrine-${vitrine.id}">
      <header class="vitrine-topo">
        <div>
          <div class="rotulo mono">${String(numero).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
          <h3>${esc(vitrine.titulo)}</h3>
          <p>${esc(vitrine.descricao)}</p>
        </div>
        <div class="controles">${ordens}${filtroLojas}</div>
      </header>
      <div class="vcorpo">${corpoVitrineHtml(vitrine)}</div>
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
      <p class="secao-nota"><b>Anunciado</b> é o desconto que a loja mostra sobre o preço "de", que costuma ser inflado. <b>Real</b> compara com a mediana dos últimos 90 dias (coletas + Wayback Machine). <b>Metade do dobro</b> marca promoção anunciada acima de 15% sem queda real.</p>
      ${vitrines.map((v, i) => renderVitrine(v, i + 1, vitrines.length)).join("")}`;
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
      const grupo = botao.closest(".liquido");
      if (grupo) moverLiquido(grupo, Number(botao.dataset.i));
      const vitrine = DADOS.vitrines.find((v) => v.id === id);
      document.querySelector(`#vitrine-${id} .vcorpo`).innerHTML = corpoVitrineHtml(vitrine);
    });
  }

  function iniciar() {
    if (DADOS.atualizado) {
      document.getElementById("atualizado").textContent = `última coleta · ${dataLonga.format(new Date(DADOS.atualizado))}`;
    }
    const pecas = [...DADOS.pecas, ...pecasAutomaticas()];
    const analises = pecas.map((peca) => ({ peca, analise: analisar(peca) }));
    renderResumo(analises);
    renderCompradas();
    document.getElementById("contador-pecas").textContent = `${String(pecas.length).padStart(2, "0")} itens`;
    const grade = document.getElementById("pecas");
    grade.innerHTML = analises.map(({ peca, analise }) => cardHtml(peca, analise)).join("");
    grade.querySelectorAll(".historico[data-grafico]").forEach(montarGrafico);
    animarEntradas(grade);
    renderVitrines();
    ativarVitrines();
  }

  iniciar();
})();
