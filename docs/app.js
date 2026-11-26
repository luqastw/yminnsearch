(() => {
  const DADOS = window.DADOS || { pecas: [], compradas: [], vitrines: [] };
  const DIA = 86400000;
  const JANELA_DIAS = 90;
  const DIAS_RECENTES = 7;
  const NS = "http://www.w3.org/2000/svg";
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const formato = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
  const dataHora = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const mesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  const agora = DADOS.atualizado ? new Date(DADOS.atualizado).getTime() : Date.now();

  const brl = (valor) => (valor == null ? "—" : formato.format(valor));
  const pct = (valor) => `${Math.round(Math.abs(valor) * 100)}%`;
  const esc = (texto) => String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tempo = (ponto) => new Date(ponto.t).getTime();
  const chaveDia = (ms) => new Date(ms).toLocaleDateString("sv-SE");
  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
  const semPonto = (texto) => texto.replace(".", "");

  const ICONE_CHECK = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="#f7f6f2"/><path d="M4.8 8.2l2.1 2.1 4.3-4.4" fill="none" stroke="#121211" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICONE_SETA = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICONE_IR = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2h6v6M10 2L2.5 9.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICONE_AVISO = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l6.5 12H1.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.2v3.3M8 11.6v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

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
    if (dias < 3 || real == null) return { tipo: "neutro", texto: "Sem histórico ainda" };
    if (menorAnterior != null && atual <= menorAnterior) return { tipo: "otimo", texto: "Menor preço em 90 dias" };
    if (real >= 0.05) return { tipo: "bom", texto: `${pct(real)} abaixo do normal` };
    if (real <= -0.03) return { tipo: "ruim", texto: "Mais caro que o normal" };
    return { tipo: "neutro", texto: "Preço de sempre" };
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
    return {
      melhor,
      atual,
      menor90: Math.min(atual, ...diarios.map(([, v]) => v)),
      desconto,
      veredito: veredito(desconto, atual),
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
    if (comReal.length) return { item: comReal[0].item, motivo: `entre as mais procuradas, com ${pct(comReal[0].real)} de desconto real` };
    const bemAvaliadas = topo.filter((i) => i.avaliacoes >= 20 && i.nota >= 4.5).sort((a, b) => a.pix - b.pix);
    if (bemAvaliadas.length) return { item: bemAvaliadas[0], motivo: `a mais barata entre as mais procuradas com nota ${Number(bemAvaliadas[0].nota).toFixed(1).replace(".", ",")}` };
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
          nota: `Escolhida sozinha: ${motivo}.`,
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

  function tempoRelativo(ms) {
    const minutos = Math.round((Date.now() - ms) / 60000);
    if (minutos < 1) return "atualizado agora";
    if (minutos < 60) return `atualizado há ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `atualizado há ${horas} h`;
    return `atualizado em ${dataCurta.format(new Date(ms))}`;
  }

  function renderResumo(todas) {
    const analises = melhoresPorGrupo(todas);
    const comPreco = analises.filter((a) => a.analise);
    const total = comPreco.reduce((s, a) => s + a.analise.atual, 0);
    const comBase = comPreco.filter((a) => a.analise.desconto.base);
    const diferenca = comBase.reduce((s, a) => s + a.analise.atual - a.analise.desconto.base, 0);
    const comparaveis = todas.filter((a) => a.analise && a.analise.desconto.base);
    const reais = todas.filter((a) => a.analise && ["otimo", "bom"].includes(a.analise.veredito.tipo)).length;

    const valorDiferenca = !comBase.length
      ? "—"
      : `<span class="${diferenca > 0 ? "ruim" : "bom"}" style="color:${diferenca > 0 ? "var(--vermelho)" : "var(--branco)"}">${diferenca > 0 ? "+" : "−"}${brl(Math.abs(diferenca))}</span>`;
    const notaDiferenca = !comBase.length
      ? "aparece depois de 3 dias de coleta"
      : diferenca > 0
        ? `acima do normal, somando ${comBase.length} peças com histórico`
        : `de economia, somando ${comBase.length} peças com histórico`;

    document.getElementById("resumo").innerHTML = `
      <div class="kpi entra">
        <div class="kpi-rotulo">Total do PC agora</div>
        <div class="kpi-valor" data-contar="${total}">${brl(comPreco.length ? total : null)}</div>
        <div class="kpi-nota">${comPreco.length} peças, com a placa de vídeo mais barata</div>
      </div>
      <div class="kpi entra" style="--atraso:80ms">
        <div class="kpi-rotulo">Comparado ao preço normal</div>
        <div class="kpi-valor">${valorDiferenca}</div>
        <div class="kpi-nota">${notaDiferenca}</div>
      </div>
      <div class="kpi entra" style="--atraso:160ms">
        <div class="kpi-rotulo">Descontos de verdade</div>
        <div class="kpi-valor">${reais} <span style="color:var(--texto-3);font-size:.6em;letter-spacing:-.01em">de ${comparaveis.length}</span></div>
        <div class="kpi-nota">peças abaixo do preço normal hoje</div>
      </div>`;
  }

  function renderCompradas() {
    const compradas = DADOS.compradas || [];
    if (!compradas.length) return;
    document.getElementById("compradas").innerHTML = `<span>Já comprados</span>${compradas.map((c) => `<span class="chip">${ICONE_CHECK}${esc(c.nome)}</span>`).join("")}`;
  }

  function lojasHtml(peca, melhor) {
    const ordenadas = peca.ofertas.slice().sort((a, b) => {
      const pa = ultimo(a), pb = ultimo(b);
      const ea = pa && pa.disp !== false ? 0 : 1, eb = pb && pb.disp !== false ? 0 : 1;
      return ea - eb || (pa?.pix ?? Infinity) - (pb?.pix ?? Infinity);
    });
    const linhas = ordenadas.map((oferta) => {
      const ponto = ultimo(oferta);
      const semEstoque = ponto && ponto.disp === false;
      const detalhe = semEstoque
        ? `<span class="sem-estoque-tag">sem estoque</span>`
        : oferta.falhas
          ? `<span class="sem-estoque-tag">não consegui ler o preço</span>`
          : esc(oferta.titulo || "");
      const cartao = ponto?.cartao && ponto.cartao !== ponto.pix ? `${brl(ponto.cartao)} no cartão` : "no pix";
      return `<a class="loja ${oferta === melhor ? "melhor" : ""} ${semEstoque ? "sem-estoque" : ""}" href="${esc(oferta.url)}" target="_blank" rel="noopener noreferrer" title="${esc(oferta.titulo || oferta.url)}">
        <div style="min-width:0">
          <div class="loja-nome"><span class="ponto-loja"></span>${esc(oferta.loja)}</div>
          <div class="loja-detalhe">${detalhe}</div>
        </div>
        <div class="loja-preco">${brl(ponto?.pix)}<small>${ponto ? cartao : "sem coleta"}</small></div>
        <span class="ir">${ICONE_IR}</span>
      </a>`;
    }).join("");

    const termo = encodeURIComponent(peca.busca || peca.nome);
    const externos = [
      `<a href="https://www.buscape.com.br/search?q=${termo}" target="_blank" rel="noopener noreferrer">Buscapé</a>`,
      `<a href="https://www.zoom.com.br/search?q=${termo}" target="_blank" rel="noopener noreferrer">Zoom</a>`,
    ];
    for (const oferta of peca.ofertas) {
      const asin = (oferta.url.match(/amazon\.com\.br\/(?:.*\/)?dp\/([A-Z0-9]{10})/) || [])[1];
      if (asin) externos.push(`<a href="https://keepa.com/#!product/12-${asin}" target="_blank" rel="noopener noreferrer">Keepa</a>`);
    }
    const disponiveis = peca.ofertas.filter((o) => ultimo(o) && ultimo(o).disp !== false).length;
    const resumo = peca.ofertas.length === 1
      ? `Ver na ${esc(peca.ofertas[0].loja)}`
      : `${peca.ofertas.length} lojas${disponiveis < peca.ofertas.length ? ` · ${disponiveis} com estoque` : ""}`;
    return `<details class="lojas">
      <summary><span>${resumo}</span><span class="seta">${ICONE_SETA}</span></summary>
      <div>${linhas}<div class="historicos"><span>Histórico em</span>${externos.join("")}</div></div>
    </details>`;
  }

  const graficos = [];

  function cardHtml(peca, analise, ordem) {
    const etiqueta = analise ? `<span class="etiqueta ${analise.veredito.tipo}">${analise.veredito.texto}</span>` : "";
    const cabeca = `<div>
        <div class="card-cabeca">
          <div class="categoria">${esc(peca.categoria)}${peca.automatica ? `<span class="etiqueta auto">automática</span>` : ""}</div>
          ${etiqueta}
        </div>
        <h3 class="nome">${esc(peca.nome)}</h3>
        ${peca.nota ? `<p class="nota">${esc(peca.nota)}</p>` : ""}
      </div>
      ${peca.aviso ? `<div class="aviso">${ICONE_AVISO}<span>${esc(peca.aviso)}</span></div>` : ""}`;
    const atraso = `--atraso:${(ordem % 3) * 80}ms`;

    if (!peca.ofertas.length || !analise) {
      return `<article class="card entra" style="${atraso}">${cabeca}<p class="vazio">Aguardando a primeira coleta.</p></article>`;
    }

    const { melhor, atual, menor90, desconto, veredito } = analise;
    const boa = ["otimo", "bom"].includes(veredito.tipo) || (peca.alvo && atual <= peca.alvo);
    const variacao = desconto.real == null
      ? ""
      : desconto.real >= 0.005
        ? `<div class="variacao"><b class="bom">↓ ${pct(desconto.real)}</b> do normal</div>`
        : desconto.real <= -0.005
          ? `<div class="variacao"><b class="ruim">↑ ${pct(desconto.real)}</b> do normal</div>`
          : `<div class="variacao">igual ao normal</div>`;
    const terceiro = peca.alvo
      ? `<div class="numero"><span>Alvo</span><b class="${atual <= peca.alvo ? "bom" : ""}">${brl(peca.alvo)}</b></div>`
      : `<div class="numero"><span>Lojas</span><b>${peca.ofertas.length}</b></div>`;
    const indice = graficos.push({ peca, analise }) - 1;

    return `<article class="card entra ${boa ? "oferta-boa" : ""} ${peca.fora_do_total ? "fora" : ""}" style="${atraso}">
      ${cabeca}
      <div class="preco-bloco">
        <div>
          <div class="preco" data-contar="${atual}">${brl(atual)}</div>
          <div class="preco-sub">na <strong>${esc(melhor.loja)}</strong>, hoje</div>
        </div>
        ${variacao}
      </div>
      <figure class="grafico" data-grafico="${indice}" style="margin:0">
        <div class="plot" tabindex="0" role="slider" aria-label="Histórico de 90 dias. Use as setas para percorrer."></div>
        <div class="eixo"></div>
      </figure>
      <div class="numeros">
        <div class="numero"><span>Normal</span><b>${brl(desconto.base)}</b></div>
        <div class="numero"><span>Mínimo 90d</span><b>${brl(menor90)}</b></div>
        ${terceiro}
      </div>
      ${lojasHtml(peca, melhor)}
    </article>`;
  }

  function contar(el) {
    const alvo = Number(el.dataset.contar);
    if (!alvo || reduzido || el.dataset.contado) return;
    el.dataset.contado = "1";
    const inicio = performance.now();
    const de = alvo * 0.86;
    const duracao = 1100;
    const passo = (instante) => {
      const t = limitar((instante - inicio) / duracao, 0, 1);
      const suave = 1 - Math.pow(1 - t, 4);
      el.textContent = brl(de + (alvo - de) * suave);
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  function prepararGrafico(figura) {
    const { peca, analise } = graficos[Number(figura.dataset.grafico)];
    const plot = figura.querySelector(".plot");
    const card = figura.closest(".card");
    const precoEl = card.querySelector(".preco");
    const subEl = card.querySelector(".preco-sub");
    const subOriginal = subEl.innerHTML;

    const candidatas = peca.ofertas
      .map((oferta) => ({
        oferta,
        principal: oferta === analise.melhor,
        pontos: (oferta.historico || []).filter((p) => agora - tempo(p) <= JANELA_DIAS * DIA && p.disp !== false),
      }))
      .filter((s) => s.pontos.length);
    const daPrincipal = (candidatas.find((s) => s.principal) || candidatas[0] || { pontos: [] }).pontos.map((p) => p.pix);
    const piso = Math.min(...daPrincipal) * 0.8;
    const teto = Math.max(...daPrincipal) * 1.2;
    const series = candidatas
      .filter((s) => s.principal || (s.pontos.length >= 2 && s.pontos.every((p) => p.pix >= piso && p.pix <= teto)))
      .sort((a, b) => Number(a.principal) - Number(b.principal));
    const todos = series.flatMap((s) => s.pontos);
    if (new Set(todos.map((p) => chaveDia(tempo(p)))).size < 2) {
      figura.innerHTML = `<div class="grafico-vazio">O gráfico aparece a partir de amanhã</div>`;
      return null;
    }

    const principal = series.find((s) => s.principal) || series[series.length - 1];
    const pontos = principal.pontos;
    const t1 = agora;
    const t0 = Math.min(...todos.map(tempo), t1 - 14 * DIA);
    const valores = todos.map((p) => p.pix);
    let minimo = Math.min(...valores);
    let maximo = Math.max(...valores);
    const base = analise.desconto.base;
    if (base && base >= minimo * 0.95 && base <= maximo * 1.05) {
      minimo = Math.min(minimo, base);
      maximo = Math.max(maximo, base);
    }
    const folga = Math.max((maximo - minimo) * 0.18, maximo * 0.015);
    const y0 = minimo - folga;
    const y1 = maximo + folga;
    const estado = { indice: null, desenhado: false };

    const desenhar = (animar) => {
      const L = plot.clientWidth;
      const A = plot.clientHeight;
      if (!L || !A) return;
      const x = (t) => 4 + ((t - t0) / (t1 - t0)) * (L - 22);
      const y = (v) => A - 4 - ((v - y0) / (y1 - y0)) * (A - 8);
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${L} ${A}`);
      svg.setAttribute("aria-hidden", "true");
      if (base && base >= y0 && base <= y1) {
        const linha = document.createElementNS(NS, "line");
        linha.setAttribute("class", "ref");
        linha.setAttribute("x1", 0);
        linha.setAttribute("x2", L);
        linha.setAttribute("y1", y(base));
        linha.setAttribute("y2", y(base));
        svg.append(linha);
      }
      for (const serie of series) {
        const coords = serie.pontos.map((p) => [x(tempo(p)), y(p.pix)]);
        if (serie.principal) coords.push([x(t1), coords[coords.length - 1][1]]);
        const d = coords.map(([px, py], i) => {
          if (!i) return `M${px.toFixed(1)},${py.toFixed(1)}`;
          return `H${px.toFixed(1)}V${py.toFixed(1)}`;
        }).join("");
        if (serie.principal) {
          const area = document.createElementNS(NS, "path");
          area.setAttribute("class", "area");
          area.setAttribute("d", `${d}L${coords[coords.length - 1][0].toFixed(1)},${A}L${coords[0][0].toFixed(1)},${A}Z`);
          svg.append(area);
        }
        const caminho = document.createElementNS(NS, "path");
        caminho.setAttribute("class", `serie ${serie.principal ? "principal" : "outra"}`);
        caminho.setAttribute("d", d);
        svg.append(caminho);
        if (serie.principal && animar && !reduzido && caminho.getTotalLength) {
          const comprimento = caminho.getTotalLength();
          caminho.style.strokeDasharray = comprimento;
          caminho.animate([{ strokeDashoffset: comprimento }, { strokeDashoffset: 0 }], { duration: 1400, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
        }
      }
      plot.replaceChildren(svg);
      const fim = pontos[pontos.length - 1];
      const pulso = document.createElement("span");
      pulso.className = "pulso";
      pulso.style.left = `${x(tempo(fim))}px`;
      pulso.style.top = `${y(fim.pix)}px`;
      const regua = document.createElement("span");
      regua.className = "regua";
      const ponto = document.createElement("span");
      ponto.className = "ponto";
      plot.append(pulso, regua, ponto);
      Object.assign(estado, { x, y, regua, ponto });
      if (estado.indice != null) mostrar(estado.indice);
    };

    const repousar = () => {
      estado.indice = null;
      plot.classList.remove("ativo");
      precoEl.textContent = brl(analise.atual);
      subEl.innerHTML = subOriginal;
    };

    const mostrar = (indice) => {
      if (!estado.x) return;
      estado.indice = indice;
      const p = pontos[indice];
      const instante = tempo(p);
      plot.classList.add("ativo");
      estado.regua.style.left = `${estado.x(instante)}px`;
      estado.ponto.style.left = `${estado.x(instante)}px`;
      estado.ponto.style.top = `${estado.y(p.pix)}px`;
      precoEl.textContent = brl(p.pix);
      const quando = p.arquivo ? dataCurta.format(new Date(instante)) : dataHora.format(new Date(instante));
      const outras = series
        .filter((s) => !s.principal)
        .map((s) => {
          const q = s.pontos.filter((r) => tempo(r) <= instante).pop();
          return q ? `${esc(s.oferta.loja)} ${brl(q.pix)}` : null;
        })
        .filter(Boolean);
      subEl.innerHTML = `<strong>${esc(principal.oferta.loja)}</strong>, ${semPonto(quando)}${outras.length ? ` · ${outras.join(" · ")}` : ""}`;
      plot.setAttribute("aria-valuetext", `${quando}: ${brl(p.pix)}`);
    };

    plot.addEventListener("pointermove", (evento) => {
      const caixa = plot.getBoundingClientRect();
      const instante = t0 + limitar((evento.clientX - caixa.left) / caixa.width, 0, 1) * (t1 - t0);
      let perto = 0;
      for (let i = 1; i < pontos.length; i++) {
        if (Math.abs(tempo(pontos[i]) - instante) < Math.abs(tempo(pontos[perto]) - instante)) perto = i;
      }
      if (perto !== estado.indice) mostrar(perto);
    });
    plot.addEventListener("pointerleave", repousar);
    plot.addEventListener("blur", repousar);
    plot.addEventListener("keydown", (evento) => {
      const passos = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity, Escape: 0 };
      if (!(evento.key in passos)) return;
      evento.preventDefault();
      if (evento.key === "Escape") return repousar();
      mostrar(limitar((estado.indice ?? pontos.length - 1) + passos[evento.key], 0, pontos.length - 1));
    });

    const marcas = [semPonto(dataCurta.format(new Date(t0)))];
    const cursor = new Date(t0);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + 1);
    while (cursor.getTime() < t1 - 10 * DIA) {
      marcas.push(semPonto(mesCurto.format(cursor)));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    marcas.push("hoje");
    figura.querySelector(".eixo").innerHTML = marcas.map((m) => `<span>${esc(m)}</span>`).join("");

    return () => {
      if (estado.desenhado) return;
      estado.desenhado = true;
      desenhar(true);
      setTimeout(() => plot.classList.add("desenhado"), reduzido ? 0 : 50);
      let primeira = true;
      new ResizeObserver(() => {
        if (primeira) {
          primeira = false;
          return;
        }
        desenhar(false);
      }).observe(plot);
    };
  }

  function observarEntradas(raiz) {
    const desenhos = new Map();
    raiz.querySelectorAll(".grafico[data-grafico]").forEach((figura) => {
      const desenhar = prepararGrafico(figura);
      if (desenhar) desenhos.set(figura.closest(".card"), desenhar);
    });
    const revelar = (el) => {
      el.classList.add("visivel");
      el.querySelectorAll("[data-contar]").forEach(contar);
      if (el.matches("[data-contar]")) contar(el);
      const desenhar = desenhos.get(el);
      if (desenhar) setTimeout(desenhar, reduzido ? 0 : 250);
    };
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".entra").forEach(revelar);
      return;
    }
    const observador = new IntersectionObserver((entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        observador.unobserve(entrada.target);
        revelar(entrada.target);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".entra").forEach((el) => observador.observe(el));
  }

  const ORDENS = [
    { chave: "procurados", rotulo: "Populares", ordenar: (a, b) => a.posicao - b.posicao || b.avaliacoes - a.avaliacoes },
    { chave: "real", rotulo: "Desconto real", ordenar: (a, b) => (realVitrine(b) ?? -1) - (realVitrine(a) ?? -1) || a.posicao - b.posicao },
    { chave: "preco", rotulo: "Mais barato", ordenar: (a, b) => a.pix - b.pix },
  ];
  const VISIVEIS = 6;
  const estadoVitrine = {};

  function sparkline(item) {
    const pontos = pontosVitrine(item).filter((p) => agora - tempo(p) <= JANELA_DIAS * DIA);
    if (pontos.length < 2) return "";
    const L = 64, A = 18;
    const t0 = Math.min(tempo(pontos[0]), agora - 7 * DIA);
    const valores = pontos.map((p) => p.pix);
    const min = Math.min(...valores), max = Math.max(...valores);
    const faixa = max - min || 1;
    const d = pontos.map((p, i) => `${i ? "L" : "M"}${(((tempo(p) - t0) / (agora - t0)) * L).toFixed(1)},${(A - 2 - ((p.pix - min) / faixa) * (A - 4)).toFixed(1)}`).join("");
    const subiu = valores[valores.length - 1] > valores[0];
    return `<svg class="spark" viewBox="0 0 ${L} ${A}" role="img" aria-label="90 dias: de ${brl(valores[0])} para ${brl(valores[valores.length - 1])}"><path d="${d}" stroke="${subiu ? "var(--vermelho)" : "rgba(247,246,242,.7)"}"/></svg>`;
  }

  function sinalVitrine(item) {
    const real = realVitrine(item);
    if (real != null && real >= 0.05) return `<span class="vitem-sinal bom">${pct(real)} abaixo do normal</span>`;
    if (real != null && real < 0.02 && item.desconto >= 0.15) return `<span class="vitem-sinal ruim">desconto inflado</span>`;
    if (item.desconto >= 0.05) return `<span class="vitem-sinal">loja diz −${pct(item.desconto)}</span>`;
    return "";
  }

  function itemVitrineHtml(item, escolhido, ordem) {
    const nota = item.avaliacoes ? `<span class="sep"></span><span>★ ${Number(item.nota).toFixed(1).replace(".", ",")} · ${item.avaliacoes}</span>` : "";
    const imagem = item.imagem ? `<img src="${esc(item.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "";
    return `<li class="vitem ${escolhido ? "escolhido" : ""}" style="--atraso:${Math.min(ordem, 10) * 40}ms">
      <a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
        <div class="vitem-img">${imagem}</div>
        <div style="min-width:0">
          <div class="vitem-titulo">${esc(item.titulo)}</div>
          <div class="vitem-meta"><span>${esc(item.loja)}</span>${nota}${escolhido ? `<span class="sep"></span><span style="color:var(--texto)">está na lista</span>` : ""}</div>
        </div>
        <div class="vitem-lado">
          <span class="vitem-preco">${brl(item.pix)}</span>
          ${sinalVitrine(item)}
          ${sparkline(item)}
        </div>
      </a>
    </li>`;
  }

  function liquidoHtml(vitrineId, opcoes, ativo) {
    const indice = Math.max(0, opcoes.findIndex((o) => o.valor === ativo));
    const n = opcoes.length;
    return `<div class="liquido" role="group" aria-label="Ordenar" data-indice="${indice}" data-total="${n}">
      <span class="liquido-pilula" style="left:calc(${(indice / n) * 100}% + 3px);right:calc(${((n - indice - 1) / n) * 100}% + 3px)"></span>
      ${opcoes.map((o, i) => `<button type="button" data-vitrine="${vitrineId}" data-ordem="${esc(o.valor)}" data-i="${i}" aria-pressed="${o.valor === ativo}">${esc(o.rotulo)}</button>`).join("")}
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
    if (!vitrine.itens.length) return `<p class="vazio">Ainda sem ofertas coletadas.</p>`;
    const estado = estadoVitrine[vitrine.id];
    const escolhido = vitrine.automatica ? escolherAutomatica(vitrine)?.item.url : null;
    const ordem = ORDENS.find((o) => o.chave === estado.ordem);
    const filtrados = vitrine.itens.filter((i) => estado.loja === "todas" || i.loja === estado.loja).slice().sort(ordem.ordenar);
    const visiveis = estado.tudo ? filtrados : filtrados.slice(0, VISIVEIS);
    const mais = filtrados.length > VISIVEIS
      ? `<button type="button" class="ver-mais" data-vitrine="${vitrine.id}" data-tudo="1">${estado.tudo ? "Mostrar menos" : `Mostrar todas as ${filtrados.length}`}</button>`
      : "";
    return `<ul class="vlista">${visiveis.map((i, n) => itemVitrineHtml(i, i.url === escolhido, n)).join("")}</ul>${mais}`;
  }

  function vitrineHtml(vitrine, ordem) {
    const estado = estadoVitrine[vitrine.id] || (estadoVitrine[vitrine.id] = { ordem: "procurados", loja: "todas", tudo: false });
    const lojas = [...new Set(vitrine.itens.map((i) => i.loja))];
    const filtro = lojas.length > 1
      ? `<div class="lojas-filtro" role="group" aria-label="Filtrar por loja">${["todas", ...lojas].map((l) => `<button type="button" data-vitrine="${vitrine.id}" data-loja="${esc(l)}" aria-pressed="${estado.loja === l}">${l === "todas" ? "Todas" : esc(l)}</button>`).join("")}</div>`
      : "";
    return `<article class="vitrine entra" id="vitrine-${vitrine.id}" style="--atraso:${(ordem % 2) * 60}ms">
      <header class="vitrine-cabeca">
        <div>
          <h3>${esc(vitrine.titulo)}${vitrine.automatica ? `<span class="etiqueta auto">escolhe sozinha</span>` : ""}</h3>
          <p>${esc(vitrine.descricao)}</p>
        </div>
        <div class="controles">${liquidoHtml(vitrine.id, ORDENS.map((o) => ({ valor: o.chave, rotulo: o.rotulo })), estado.ordem)}${filtro}</div>
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
    alvo.innerHTML = `<div class="secao-cabeca">
        <div>
          <h2 id="titulo-vitrines">Ofertas do momento</h2>
          <p>As mais procuradas de cada categoria, com o desconto conferido contra o histórico.</p>
        </div>
      </div>
      ${vitrines.map(vitrineHtml).join("")}`;

    alvo.addEventListener("click", (evento) => {
      const botao = evento.target.closest("button[data-vitrine]");
      if (!botao) return;
      const id = botao.dataset.vitrine;
      const estado = estadoVitrine[id];
      if (botao.dataset.ordem) {
        estado.ordem = botao.dataset.ordem;
        moverLiquido(botao.closest(".liquido"), Number(botao.dataset.i));
      }
      if (botao.dataset.loja) {
        estado.loja = botao.dataset.loja;
        botao.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === botao)));
      }
      if (botao.dataset.tudo) estado.tudo = !estado.tudo;
      const vitrine = DADOS.vitrines.find((v) => v.id === id);
      const corpo = document.querySelector(`#vitrine-${id} .vcorpo`);
      const altura = corpo.offsetHeight;
      corpo.innerHTML = corpoVitrineHtml(vitrine);
      if (!reduzido && corpo.animate) {
        corpo.animate([{ height: `${altura}px` }, { height: `${corpo.offsetHeight}px` }], { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
    });
  }

  function iniciar() {
    const status = document.getElementById("atualizado");
    if (DADOS.atualizado) {
      status.textContent = tempoRelativo(agora);
      status.title = `Última coleta: ${dataHora.format(new Date(agora))}`;
    }
    const pecas = [...DADOS.pecas, ...pecasAutomaticas()];
    const analises = pecas.map((peca) => ({ peca, analise: analisar(peca) }));
    renderResumo(analises);
    renderCompradas();
    const comparaveis = analises.filter((a) => a.analise).length;
    document.getElementById("contador-pecas").textContent = `${pecas.length} peças acompanhadas em ${new Set(pecas.flatMap((p) => p.ofertas.map((o) => o.loja))).size} lojas · ${comparaveis} com preço hoje`;
    document.getElementById("pecas").innerHTML = analises.map(({ peca, analise }, i) => cardHtml(peca, analise, i)).join("");
    renderVitrines();
    observarEntradas(document);
  }

  iniciar();
})();
