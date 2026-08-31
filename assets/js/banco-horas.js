(() => {
  const App = window.TimeWallet;
  if (!App) return;

  const REG_POR_PAGINA = 6;
  const COMPROVANTE_PERIODO_MESES = 6;
  const COMPROVANTE_CICLO_KEY_PREFIX = "bancoHoras_comprovantes_primeiro_login";
  let registroAnchor = App.getCurrentPaymentAnchor();
  let regDadosPeriodo = [];
  let regDadosCiclo = [];
  let regPaginaAtual = 1;
  let comprovantePeriodos = [];
  let logoDataUrl = null;

  async function getLogoDataUrl() {
    if (logoDataUrl) return logoDataUrl;
    const response = await fetch("../assets/timewallet_logo_header.svg");
    const svg = await response.text();
    logoDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return logoDataUrl;
  }

  function getExtraClasse(extraMin) {
    return extraMin < 0 ? "negativo" : extraMin > 0 ? "positivo" : "neutro";
  }

  function getExtraTexto(extraMin) {
    return App.formatarExtra(extraMin);
  }

  function getLocalizacaoTexto(localizacao) {
    if (!localizacao) return "Não registrada";
    if (localizacao.address) return localizacao.address;
    if (localizacao.endereco) return localizacao.endereco;
    return `${localizacao.lat.toFixed(5)}, ${localizacao.lng.toFixed(5)}`;
  }

  function getComprovanteResumo(dateKey, registro) {
    if (App.getComprovanteInfo) {
      return App.getComprovanteInfo(dateKey, registro?.comprovanteNome).resumo;
    }
    return registro?.comprovanteNome || "comprovante";
  }

  function getResumoLista(lista) {
    return lista.reduce((acc, item) => {
      acc.total += 1;
      if (item.reg.extraMin > 0) acc.positivos += 1;
      if (item.reg.extraMin < 0) acc.negativos += 1;
      acc.saldo += item.reg.extraMin;
      return acc;
    }, { total: 0, positivos: 0, negativos: 0, saldo: 0 });
  }

  function getResumoPeriodo() {
    return getResumoLista(regDadosPeriodo);
  }

  function getResumoCiclo() {
    return getResumoLista(regDadosCiclo);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  function formatMonthYear(date) {
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function getSemestralLabel(start, end) {
    return `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}/${start.getFullYear()} – ${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}/${end.getFullYear()}`;
  }

  function getComprovanteCicloKey() {
    const uid = App.Store?.getCurrentUser?.()?.uid || "guest";
    return `${COMPROVANTE_CICLO_KEY_PREFIX}_${uid}`;
  }

  function getComprovanteCicloBase() {
    const key = getComprovanteCicloKey();
    const salvo = localStorage.getItem(key);
    if (salvo) {
      const dataSalva = new Date(`${salvo}T00:00:00`);
      if (!Number.isNaN(dataSalva.getTime())) return dataSalva;
    }
    const hoje = new Date();
    localStorage.setItem(key, App.toKey(hoje));
    return hoje;
  }

  function setComprovanteCicloBase(date) {
    localStorage.setItem(getComprovanteCicloKey(), App.toKey(date));
  }

  function getComprovanteCicloAtual() {
    let inicio = startOfMonth(getComprovanteCicloBase());
    let fim = App.getPeriodBounds(addMonths(inicio, COMPROVANTE_PERIODO_MESES - 1)).end;
    const hoje = new Date();

    while (hoje > fim) {
      inicio = addMonths(inicio, COMPROVANTE_PERIODO_MESES);
      fim = App.getPeriodBounds(addMonths(inicio, COMPROVANTE_PERIODO_MESES - 1)).end;
      setComprovanteCicloBase(inicio);
    }

    return { start: inicio, end: fim };
  }

  function atualizarTextoCardComprovantes() {
    const el = App.byId("comprovantePeriodoTexto");
    if (!el) return;
    const ciclo = getComprovanteCicloAtual();
    el.textContent = `Selecione um dos 6 meses do ciclo atual (${getSemestralLabel(ciclo.start, ciclo.end)}).`;
  }

  function preencherPeriodosComprovante() {
    const select = App.byId("comprovantePeriodoSelect");
    if (!select) return;

    const valorAtual = select.value;
    const ciclo = getComprovanteCicloAtual();
    const periodoAtual = App.getCurrentPaymentAnchor(new Date());
    const periodoAtualKey = App.toKey(periodoAtual);
    comprovantePeriodos = [];

    for (let i = 0; i < COMPROVANTE_PERIODO_MESES; i += 1) {
      const anchor = addMonths(ciclo.start, i);
      const bounds = App.getPeriodBounds(anchor);
      comprovantePeriodos.push({
        value: App.toKey(anchor),
        anchor,
        start: bounds.start,
        end: bounds.end,
        label: getSemestralLabel(bounds.start, bounds.end),
      });
    }

    select.innerHTML = comprovantePeriodos.map((periodo) => `<option value="${periodo.value}">${periodo.label}</option>`).join("");
    select.disabled = false;
    select.value = comprovantePeriodos.some((periodo) => periodo.value === valorAtual)
      ? valorAtual
      : comprovantePeriodos.some((periodo) => periodo.value === periodoAtualKey)
        ? periodoAtualKey
        : comprovantePeriodos[0].value;

    if (!comprovantePeriodos.some((periodo) => periodo.value === App.toKey(registroAnchor))) {
      registroAnchor = comprovantePeriodos[0].anchor;
    }

    atualizarTextoCardComprovantes();
  }

  function atualizarNavegacaoPeriodo() {
    const prevBtn = App.byId("regPrevPeriod");
    const nextBtn = App.byId("regNextPeriod");
    const indiceAtual = comprovantePeriodos.findIndex((periodo) => periodo.value === App.toKey(registroAnchor));
    if (prevBtn) prevBtn.disabled = indiceAtual <= 0;
    if (nextBtn) nextBtn.disabled = indiceAtual < 0 || indiceAtual >= comprovantePeriodos.length - 1;
  }

  function moverPeriodoRegistro(direcao) {
    const indiceAtual = comprovantePeriodos.findIndex((periodo) => periodo.value === App.toKey(registroAnchor));
    const proximoIndice = indiceAtual + direcao;
    if (proximoIndice < 0 || proximoIndice >= comprovantePeriodos.length) return false;
    registroAnchor = comprovantePeriodos[proximoIndice].anchor;
    return true;
  }

  function sincronizarSelectComRegistro() {
    const select = App.byId("comprovantePeriodoSelect");
    if (select) select.value = App.toKey(registroAnchor);
  }

  function sincronizarRegistroComSelect() {
    const select = App.byId("comprovantePeriodoSelect");
    if (!select) return false;
    const periodo = comprovantePeriodos.find((item) => item.value === select.value);
    if (!periodo) return false;
    registroAnchor = periodo.anchor;
    return true;
  }

  function initSelectPeriodoComprovante() {
    App.on("comprovantePeriodoSelect", "change", async () => {
      if (!sincronizarRegistroComSelect()) return;
      await renderRegistro();
    });
  }

  function getPeriodoRegistroAtual() {
    return comprovantePeriodos.find((periodo) => periodo.value === App.toKey(registroAnchor)) || null;
  }

  function getPeriodoZipLabel(periodo) {
    return `${String(periodo.start.getDate()).padStart(2, "0")}-${String(periodo.start.getMonth() + 1).padStart(2, "0")}-${periodo.start.getFullYear()}_a_${String(periodo.end.getDate()).padStart(2, "0")}-${String(periodo.end.getMonth() + 1).padStart(2, "0")}-${periodo.end.getFullYear()}`;
  }

  function atualizarCabecalhoPeriodo() {
    const periodoLabel = App.byId("regPeriodoLabel");
    if (!periodoLabel) return;
    const periodo = getPeriodoRegistroAtual();
    if (!periodo) return;
    periodoLabel.textContent = periodo.label;
    sincronizarSelectComRegistro();
    atualizarNavegacaoPeriodo();
  }

  function atualizarTextoCardComprovantes() {
    const el = App.byId("comprovantePeriodoTexto");
    if (!el) return;
    const ciclo = getComprovanteCicloAtual();
    el.textContent = `Selecione um dos 6 períodos do ciclo atual (${getSemestralLabel(ciclo.start, ciclo.end)}).`;
  }

  function getComprovantesPeriodoSelecionado(registros) {
    const select = App.byId("comprovantePeriodoSelect");
    if (!select || !select.value) return { periodo: null, itens: [] };
    const periodo = comprovantePeriodos.find((item) => item.value === select.value);
    if (!periodo) return { periodo: null, itens: [] };

    const itens = [];
    for (let d = new Date(periodo.start); d <= periodo.end; d.setDate(d.getDate() + 1)) {
      const date = new Date(d);
      const key = App.toKey(date);
      const reg = registros[key];
      if (!reg?.comprovante) continue;
      itens.push({ key, date, reg });
    }
    return { periodo, itens };
  }

  function baixarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function getComprovanteExtensao(reg) {
    const nome = String(reg?.comprovanteNome || "");
    const match = nome.match(/\.([a-zA-Z0-9]+)$/);
    if (match?.[1]) return match[1].toLowerCase();
    const mimeMatch = String(reg?.comprovante || "").match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/i);
    if (mimeMatch?.[1]) return mimeMatch[1].toLowerCase().replace("jpeg", "jpg");
    return "jpg";
  }

  function getComprovanteZipNome(key, date, reg) {
    const info = App.getComprovanteInfo ? App.getComprovanteInfo(key, reg.comprovanteNome) : null;
    const ext = getComprovanteExtensao(reg);
    const dia = `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
    const base = info?.resumo || `comprovante_${dia}`;
    return `${dia}_${base.replace(/[\\/:*?"<>|]/g, "-")}.${ext}`;
  }

  function dataUrlToUint8Array(dataUrl) {
    const [, base64] = String(dataUrl || "").split(",");
    const binary = atob(base64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function baixarComprovantesPeriodo() {
    const registros = await App.Store.getAll();
    const { periodo, itens } = getComprovantesPeriodoSelecionado(registros);
    if (!periodo || itens.length === 0) {
      alert("Sem comprovantes neste período.");
      return;
    }
    if (!window.JSZip) {
      alert("Biblioteca de compactação indisponível.");
      return;
    }

    const zip = new window.JSZip();
    itens.forEach(({ key, date, reg }) => {
      zip.file(getComprovanteZipNome(key, date, reg), dataUrlToUint8Array(reg.comprovante));
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const nomeArquivo = `comprovantes_${formatMonthYear(periodo.start).replace("/", "-")}.zip`;
    baixarBlob(blob, nomeArquivo);
    App.mostrarToast("Comprovantes baixados!");
  }

  function atualizarResumoTela() {
    const resumo = getResumoCiclo();
    const hero = App.byId("registroHero");
    const saldoEl = App.byId("registroSaldo");
    const periodoAtual = App.byId("registroPeriodo");
    const countEl = App.byId("registroCount");
    const positivosEl = App.byId("registroCountPositivos");
    const negativosEl = App.byId("registroCountNegativos");

    if (hero) {
      hero.classList.toggle("hero-muted", resumo.saldo === 0);
      hero.style.background = "#7B846D";
    }
    if (saldoEl) {
      saldoEl.textContent = App.formatarExtra(resumo.saldo);
      saldoEl.style.color = "#fff";
    }
    if (periodoAtual) {
      const ciclo = getComprovanteCicloAtual();
      periodoAtual.textContent = `Ciclo atual (${getSemestralLabel(ciclo.start, ciclo.end)})`;
    }
    if (countEl) countEl.textContent = String(resumo.total);
    if (positivosEl) positivosEl.textContent = String(resumo.positivos);
    if (negativosEl) negativosEl.textContent = String(resumo.negativos);
  }

  async function renderRegistro() {
    if (!App.byId("regPeriodoLabel")) return;

    preencherPeriodosComprovante();
    atualizarCabecalhoPeriodo();
    const { start, end } = App.getPeriodBounds(registroAnchor);
    const registros = await App.Store.getAll();
    regDadosPeriodo = [];
    regDadosCiclo = [];

    comprovantePeriodos.forEach((periodo) => {
      for (let d = new Date(periodo.start); d <= periodo.end; d.setDate(d.getDate() + 1)) {
        const date = new Date(d);
        const key = App.toKey(date);
        const reg = registros[key];
        if (!reg) continue;
        regDadosCiclo.push({ key, date, reg });
      }
    });

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = new Date(d);
      const key = App.toKey(date);
      const reg = registros[key];
      if (!reg) continue;
      regDadosPeriodo.push({ key, date, reg });
    }

    atualizarResumoTela();
    regPaginaAtual = 1;
    renderPaginaRegistro();
  }

  function renderPaginaRegistro() {
    const tabela = App.byId("regTabela");
    const pagBox = App.byId("regPaginacao");
    if (!tabela || !pagBox) return;

    const totalPaginas = Math.max(1, Math.ceil(regDadosPeriodo.length / REG_POR_PAGINA));
    if (regPaginaAtual > totalPaginas) regPaginaAtual = totalPaginas;

    const inicio = (regPaginaAtual - 1) * REG_POR_PAGINA;
    const fatia = regDadosPeriodo.slice(inicio, inicio + REG_POR_PAGINA);

    const linhasHtml = fatia.map(({ date, reg }) => {
      const estado = getExtraClasse(reg.extraMin);
      const diaLabel = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
      const localizacao = reg.localizacao ? App.getLocationMapLink(reg.localizacao) : '<span style="color:var(--muted);font-size:11px;">Não registrada</span>';
      return `
        <div class="reg-row ${estado}">
          <span class="col-dia">${diaLabel}</span>
          <span class="col-ponto">15:00</span>
          <span class="col-saida">${reg.saida}</span>
          <span class="col-local">${localizacao}</span>
          <span class="col-horas">${getExtraTexto(reg.extraMin)}</span>
        </div>`;
    }).join("");

    tabela.innerHTML = linhasHtml || '<div class="empty-msg">Sem registros neste período.</div>';

    if (totalPaginas <= 1) {
      pagBox.innerHTML = "";
      return;
    }

    let botoes = "";
    for (let p = 1; p <= totalPaginas; p += 1) {
      botoes += `<button type="button" class="reg-pagina-btn ${p === regPaginaAtual ? "ativa" : ""}" data-pagina="${p}">${p}</button>`;
    }
    pagBox.innerHTML = botoes;
    pagBox.querySelectorAll(".reg-pagina-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        regPaginaAtual = Number(btn.dataset.pagina);
        renderPaginaRegistro();
      });
    });
  }

  function wrapText(ctx, text, maxWidth, maxLines = 2) {
    const words = String(text || "—").split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";

    words.forEach((word) => {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !current) {
        current = test;
        return;
      }
      lines.push(current);
      current = word;
    });

    if (current) lines.push(current);
    if (lines.length <= maxLines) return lines;

    const limited = lines.slice(0, maxLines);
    const last = limited[maxLines - 1];
    limited[maxLines - 1] = last.length > 2 ? `${last.slice(0, Math.max(0, last.length - 2))}…` : `${last}…`;
    return limited;
  }

  function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    }
  }

  async function drawLogo(ctx, totalW, padding) {
    try {
      const logoSrc = await getLogoDataUrl();
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = logoSrc;
      });
      const maxW = 190;
      const ratio = img.width / img.height;
      const width = maxW;
      const height = width / ratio;
      ctx.drawImage(img, (totalW - width) / 2, padding, width, height);
      return height;
    } catch {
      return 0;
    }
  }

  function drawMetricCard(ctx, x, y, width, height, label, value, accent) {
    drawRoundedRect(ctx, x, y, width, height, 22, "#FFFFFF", "#E6EBDB");
    ctx.fillStyle = "#7A8570";
    ctx.font = "700 12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 18, y + 24);
    ctx.fillStyle = accent;
    ctx.font = "700 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(String(value), x + 18, y + 58);
  }

  function drawCellText(ctx, value, x, y, width, height, align, color, font, maxLines = 2) {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    const pad = 10;
    const maxWidth = Math.max(24, width - pad * 2);
    const lines = wrapText(ctx, value, maxWidth, maxLines);
    const lineHeight = 14;
    const totalHeight = lines.length * lineHeight;
    const baseX = align === "left" ? x + pad : align === "right" ? x + width - pad : x + width / 2;
    let currentY = y + (height - totalHeight) / 2 + 11;
    lines.forEach((line) => {
      ctx.fillText(line, baseX, currentY);
      currentY += lineHeight;
    });
  }

  function baixarImagem(blob, start, end) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const nomeArquivo = `banco-horas_${App.fmtCurta(start).replace("/", "-")}_a_${App.fmtCurta(end).replace("/", "-")}-${end.getFullYear()}.png`;
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.mostrarToast("Imagem salva!");
  }

  async function gerarImagem() {
    if (regDadosPeriodo.length === 0) {
      alert("Sem registros no período para gerar imagem.");
      return;
    }

    const { start, end } = App.getPeriodBounds(registroAnchor);
    const resumo = getResumoPeriodo();
    const dados = regDadosPeriodo.map(({ key, date, reg }) => ({
      dia: `${App.DIAS_SEMANA[date.getDay()]} ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`,
      ponto: "15:00",
      saida: reg.saida,
      localizacao: getLocalizacaoTexto(reg.localizacao),
      comprovante: getComprovanteResumo(key, reg),
      saldo: getExtraTexto(reg.extraMin),
      estado: getExtraClasse(reg.extraMin),
    }));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const totalW = 1120;
    const padding = 36;
    const metricGap = 16;
    const metricH = 82;
    const heroH = 110;
    const headerH = 46;
    const rowH = 58;
    const footerH = 68;
    const cols = [
      { key: "dia", label: "Dia", width: 0.23, align: "left" },
      { key: "ponto", label: "Ponto", width: 0.09, align: "center" },
      { key: "saida", label: "Saída", width: 0.11, align: "center" },
      { key: "localizacao", label: "Localização", width: 0.28, align: "left" },
      { key: "comprovante", label: "Comprovante", width: 0.17, align: "left" },
      { key: "saldo", label: "Saldo", width: 0.12, align: "right" },
    ];

    const logoH = await drawLogo(ctx, totalW, padding);
    const titleTop = padding + logoH + 14;
    const tableTop = titleTop + heroH + metricH + 54;
    const totalH = tableTop + headerH + dados.length * rowH + footerH + padding;

    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#F7F5EE";
    ctx.fillRect(0, 0, totalW, totalH);

    if (logoH) await drawLogo(ctx, totalW, padding);

    ctx.fillStyle = "#20291A";
    ctx.font = '700 28px Georgia, "Times New Roman", serif';
    ctx.textAlign = "center";
    ctx.fillText("Banco de Horas", totalW / 2, titleTop + 6);

    ctx.fillStyle = "#7A8570";
    ctx.font = "600 14px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`Período ${App.getPeriodLabel(registroAnchor)}`, totalW / 2, titleTop + 30);

    const heroY = titleTop + 48;
    const heroBg = "#7B846D";
    drawRoundedRect(ctx, padding, heroY, totalW - padding * 2, heroH, 28, heroBg, null);

    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.font = "700 13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Saldo do período", padding + 28, heroY + 34);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 38px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(App.formatarExtra(resumo.saldo), padding + 28, heroY + 76);

    ctx.font = "600 13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${resumo.total} registro${resumo.total === 1 ? "" : "s"}`, totalW - padding - 28, heroY + 50);

    const metricY = heroY + heroH + 18;
    const metricW = (totalW - padding * 2 - metricGap * 2) / 3;
    drawMetricCard(ctx, padding, metricY, metricW, metricH, "Registros", resumo.total, "#20291A");
    drawMetricCard(ctx, padding + metricW + metricGap, metricY, metricW, metricH, "Extras", resumo.positivos, "#4A701C");
    drawMetricCard(ctx, padding + (metricW + metricGap) * 2, metricY, metricW, metricH, "Descontos", resumo.negativos, "#B3261E");

    drawRoundedRect(ctx, padding, tableTop, totalW - padding * 2, headerH + dados.length * rowH, 28, "#FFFFFF", "#E6EBDB");

    let x = padding;
    cols.forEach((col, index) => {
      const colW = (totalW - padding * 2) * col.width;
      drawCellText(ctx, col.label, x, tableTop, colW, headerH, col.align, "#4A701C", "700 12px -apple-system, BlinkMacSystemFont, sans-serif", 1);
      if (index < cols.length - 1) {
        ctx.strokeStyle = "#EEF2E7";
        ctx.beginPath();
        ctx.moveTo(x + colW, tableTop + 10);
        ctx.lineTo(x + colW, tableTop + headerH + dados.length * rowH - 10);
        ctx.stroke();
      }
      x += colW;
    });

    let y = tableTop + headerH;
    dados.forEach((row, index) => {
      if (index > 0) {
        ctx.strokeStyle = "#EEF2E7";
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(totalW - padding, y);
        ctx.stroke();
      }

      let colX = padding;
      cols.forEach((col) => {
        const colW = (totalW - padding * 2) * col.width;
        const isSaldo = col.key === "saldo";
        const isSaida = col.key === "saida";
        const color = isSaldo
          ? row.estado === "positivo"
            ? "#4A701C"
            : row.estado === "negativo"
              ? "#B3261E"
              : "#6F7862"
          : isSaida && row.estado === "negativo"
            ? "#B3261E"
            : isSaida && row.estado === "positivo"
              ? "#375215"
              : "#20291A";
        const font = isSaldo || isSaida
          ? "700 12px -apple-system, BlinkMacSystemFont, sans-serif"
          : "12px -apple-system, BlinkMacSystemFont, sans-serif";
        drawCellText(ctx, row[col.key], colX, y, colW, rowH, col.align, color, font, col.key === "localizacao" ? 3 : 2);
        colX += colW;
      });
      y += rowH;
    });

    ctx.fillStyle = "#7A8570";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Gerado em ${new Date().toLocaleString("pt-BR")}`, totalW / 2, y + 36);

    canvas.toBlob((blob) => baixarImagem(blob, start, end), "image/png");
  }

  App.on("regPrevPeriod", "click", async () => {
    if (!moverPeriodoRegistro(-1)) return;
    await renderRegistro();
  });

  App.on("regNextPeriod", "click", async () => {
    if (!moverPeriodoRegistro(1)) return;
    await renderRegistro();
  });

  initSelectPeriodoComprovante();
  App.on("baixarComprovantesBtn", "click", baixarComprovantesPeriodo);

  App.initShell({
    onReady: async () => {
      await renderRegistro();
    },
    onAuthChange: async () => {
      await renderRegistro();
    },
  });
})();
