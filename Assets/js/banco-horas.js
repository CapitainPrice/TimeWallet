(() => {
  const App = window.TimeWallet;
  if (!App) return;

  const REG_POR_PAGINA = 8;
  let registroAnchor = App.getCurrentPaymentAnchor();
  let regDadosPeriodo = [];
  let regPaginaAtual = 1;
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

  function getResumoPeriodo() {
    return regDadosPeriodo.reduce((acc, item) => {
      acc.total += 1;
      if (item.reg.extraMin > 0) acc.positivos += 1;
      if (item.reg.extraMin < 0) acc.negativos += 1;
      acc.saldo += item.reg.extraMin;
      return acc;
    }, { total: 0, positivos: 0, negativos: 0, saldo: 0 });
  }

  function atualizarResumoTela() {
    const resumo = getResumoPeriodo();
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
    if (periodoAtual) periodoAtual.textContent = `Período ${App.getPeriodLabel(registroAnchor)}`;
    if (countEl) countEl.textContent = String(resumo.total);
    if (positivosEl) positivosEl.textContent = String(resumo.positivos);
    if (negativosEl) negativosEl.textContent = String(resumo.negativos);
  }

  async function renderRegistro() {
    const periodoLabel = App.byId("regPeriodoLabel");
    if (!periodoLabel) return;

    const { start, end } = App.getPeriodBounds(registroAnchor);
    periodoLabel.textContent = App.getPeriodLabel(registroAnchor);

    const registros = await App.Store.getAll();
    regDadosPeriodo = [];

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
      const diaLabel = `${App.DIAS_SEMANA[date.getDay()]} ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
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
    registroAnchor = App.shiftPaymentAnchor(registroAnchor, -1);
    await renderRegistro();
  });

  App.on("regNextPeriod", "click", async () => {
    registroAnchor = App.shiftPaymentAnchor(registroAnchor, 1);
    await renderRegistro();
  });

  App.on("exportarBtn", "click", gerarImagem);

  App.initShell({
    onReady: async () => {
      await renderRegistro();
    },
    onAuthChange: async () => {
      await renderRegistro();
    },
  });
})();
