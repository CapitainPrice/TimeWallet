(() => {
  const App = window.TimeWallet;
  if (!App) return;

  const REG_POR_PAGINA = 6;
  let registroAnchor = App.getCurrentPaymentAnchor();
  let regDadosPeriodo = [];
  let regDadosCiclo = [];
  let regPaginaAtual = 1;
  let comprovantePeriodos = [];
  let ultimaBaixaKey = null;
  let baixasCache = {};
  let baixaIndiceAtual = 0;

  function getExtraClasse(extraMin) {
    return extraMin < 0 ? "negativo" : extraMin > 0 ? "positivo" : "neutro";
  }

  function getExtraTexto(extraMin) {
    return App.formatarExtra(extraMin);
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

  function getResumoCiclo() {
    return getResumoLista(regDadosCiclo);
  }

  function getUltimaBaixaDoAno(baixas, ano) {
    const chaves = Object.keys(baixas || {}).filter((key) => key.startsWith(`${ano}-`));
    if (!chaves.length) return null;
    chaves.sort();
    return chaves[chaves.length - 1];
  }

  function formatMonthYear(date) {
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function preencherPeriodosComprovante(registros) {
    const select = App.byId("comprovantePeriodoSelect");
    if (!select) return;

    const valorAtual = select.value;
    const periodoAtual = App.getCurrentPaymentAnchor(new Date());
    const periodoAtualKey = App.toKey(periodoAtual);
    comprovantePeriodos = App.getPeriodosComRegistro(new Date().getFullYear(), registros);

    select.innerHTML = comprovantePeriodos.map((periodo) => `<option value="${periodo.value}">${periodo.label}</option>`).join("");
    select.disabled = false;
    select.value = comprovantePeriodos.some((periodo) => periodo.value === valorAtual)
      ? valorAtual
      : periodoAtualKey;

    if (!comprovantePeriodos.some((periodo) => periodo.value === App.toKey(registroAnchor))) {
      registroAnchor = periodoAtual;
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
    const primeiro = comprovantePeriodos[0];
    if (!primeiro) return;
    const ano = primeiro.anchor.getFullYear();
    const qtd = comprovantePeriodos.length;
    el.textContent = qtd === 1
      ? `Período de ${ano} com registro até agora.`
      : `Selecione um dos ${qtd} períodos de ${ano} com registro até agora.`;
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

  async function gerarImagemBaixa(baixa) {
    const [ano, mes, dia] = String(baixa.data || "").split("-");
    const dataFmt = ano ? `${dia}/${mes}/${ano}` : "—";
    const nomeUsuario = App.obterNomeUsuario() || "—";
    const linha = {
      data: dataFmt,
      localizacao: App.getLocalizacaoTexto(null),
      saldo: App.formatarExtra(baixa.saldoBaixado || 0),
      usuario: nomeUsuario,
    };
    const cols = [
      { key: "data", label: "Data", width: 0.22, align: "left" },
      { key: "localizacao", label: "Localização", width: 0.33, align: "left" },
      { key: "saldo", label: "Saldo resgatado", width: 0.2, align: "right" },
      { key: "usuario", label: "Nome do usuário", width: 0.25, align: "right" },
    ];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const totalW = 900;
    const padding = 36;
    const heroH = 110;
    const headerH = 46;
    const rowH = 70;
    const footerH = 60;

    const logoH = await App.drawLogoImage(ctx, totalW, padding, "../assets/timewallet_logo_header_black.svg", 420);
    const titleTop = padding + logoH + 14;
    const tableTop = titleTop + heroH + 54;
    const totalH = tableTop + headerH + rowH + footerH + padding;

    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#F7F5EE";
    ctx.fillRect(0, 0, totalW, totalH);

    if (logoH) await App.drawLogoImage(ctx, totalW, padding, "../assets/timewallet_logo_header_black.svg", 420);

    ctx.fillStyle = "#20291A";
    ctx.font = '700 26px Georgia, "Times New Roman", serif';
    ctx.textAlign = "center";
    ctx.fillText("Comprovante de Baixa", totalW / 2, titleTop + 6);

    ctx.fillStyle = "#7A8570";
    ctx.font = "600 13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`Registrado em ${dataFmt} às ${baixa.horario || "--:--"}`, totalW / 2, titleTop + 28);

    const heroY = titleTop + 44;
    App.drawRoundedRect(ctx, padding, heroY, totalW - padding * 2, heroH, 28, "#AEB49E", null);

    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.font = "700 13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Saldo resgatado", padding + 28, heroY + 34);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 38px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(App.formatarExtra(baixa.saldoBaixado || 0), padding + 28, heroY + 76);

    ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(nomeUsuario, totalW - padding - 28, heroY + 55);

    App.drawRoundedRect(ctx, padding, tableTop, totalW - padding * 2, headerH + rowH, 28, "#FFFFFF", "#AEB7A0");

    let x = padding;
    cols.forEach((col, index) => {
      const colW = (totalW - padding * 2) * col.width;
      App.drawCellText(ctx, col.label, x, tableTop, colW, headerH, col.align, "#000000", "700 16px -apple-system, BlinkMacSystemFont, sans-serif", 1);
      if (index < cols.length - 1) {
        ctx.strokeStyle = "#B2BAA7";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + colW, tableTop + 8);
        ctx.lineTo(x + colW, tableTop + headerH + rowH - 8);
        ctx.stroke();
      }
      x += colW;
    });

    ctx.strokeStyle = "#98A18E";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(padding + 1, tableTop + headerH);
    ctx.lineTo(totalW - padding - 1, tableTop + headerH);
    ctx.stroke();

    let colX = padding;
    cols.forEach((col) => {
      const colW = (totalW - padding * 2) * col.width;
      App.drawCellText(ctx, linha[col.key], colX, tableTop + headerH, colW, rowH, col.align, "#20291A", "700 16px -apple-system, BlinkMacSystemFont, sans-serif", 2);
      colX += colW;
    });

    ctx.fillStyle = "#000000";
    ctx.font = "700 13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Gerado em ${new Date().toLocaleString("pt-BR")}`, totalW / 2, tableTop + headerH + rowH + 32);

    const nomeArquivo = `baixa_${dataFmt.replace(/\//g, "-")}.png`;
    const dataUrl = canvas.toDataURL("image/png");
    await new Promise((resolve) => canvas.toBlob((blob) => {
      App.baixarImagemRelatorio(blob, nomeArquivo);
      resolve();
    }, "image/png"));
    return { dataUrl, nomeArquivo };
  }

  async function salvarBaixa(foto, saldoBaixado) {
    const agora = new Date();
    const hojeKey = App.toKey(agora);
    const horario = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
    const nome = App.formatComprovanteNome ? App.formatComprovanteNome(hojeKey, "baixa.jpg") : `baixa_${hojeKey}.jpg`;
    const baixaData = {
      data: hojeKey,
      horario,
      saldoBaixado,
      comprovante: foto,
      comprovanteNome: nome,
    };
    const recibo = await gerarImagemBaixa(baixaData);
    baixaData.recibo = recibo.dataUrl;
    baixaData.reciboNome = recibo.nomeArquivo;
    await App.Store.addBaixa(hojeKey, baixaData);
    App.mostrarToast("Baixa de saldo registrada!");
    baixaIndiceAtual = 0;
    await renderRegistro();
  }

  function confirmarESalvarBaixa(foto, saldoBaixado) {
    const confirmado = confirm(`Tem certeza que quer dar baixa no saldo de ${App.formatarExtra(saldoBaixado)}? Essa ação zera o saldo acumulado a partir de hoje.`);
    if (!confirmado) return;
    salvarBaixa(foto, saldoBaixado);
  }

  async function confirmarBaixaSaldo() {
    const resumoAtual = getResumoCiclo();
    if (resumoAtual.total === 0) {
      App.mostrarToast("Não há saldo acumulado pra dar baixa.");
      return;
    }

    const resultado = await App.abrirCameraModal();
    if (resultado === "unsupported") {
      App.byId("baixaCamera")?.click();
      return;
    }
    if (!resultado) return;
    confirmarESalvarBaixa(resultado, resumoAtual.saldo);
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
      hero.style.background = resumo.saldo < 0 ? "#B3261E" : resumo.saldo === 0 ? "#AEB49E" : "#4A701C";
    }
    if (saldoEl) {
      saldoEl.textContent = App.formatarExtra(resumo.saldo);
      saldoEl.style.color = "#fff";
    }
    if (periodoAtual) {
      const primeiro = comprovantePeriodos[0];
      periodoAtual.textContent = primeiro ? `Ano de ${primeiro.anchor.getFullYear()}` : "—";
    }
    if (countEl) countEl.textContent = String(resumo.total);
    if (positivosEl) positivosEl.textContent = String(resumo.positivos);
    if (negativosEl) negativosEl.textContent = String(resumo.negativos);

    const baixaTexto = App.byId("baixaSaldoTexto");
    const baixaBtn = App.byId("baixaSaldoBtn");
    if (baixaTexto) baixaTexto.textContent = `Saldo atual: ${App.formatarExtra(resumo.saldo)}`;
    if (baixaBtn) baixaBtn.disabled = resumo.total === 0;
  }

  function getBaixasOrdenadas(baixas) {
    return Object.values(baixas || {}).sort((a, b) => `${b.data}${b.horario || ""}`.localeCompare(`${a.data}${a.horario || ""}`));
  }

  function moverBaixa(direcao) {
    const itens = getBaixasOrdenadas(baixasCache);
    const proximoIndice = baixaIndiceAtual + direcao;
    if (proximoIndice < 0 || proximoIndice >= itens.length) return;
    baixaIndiceAtual = proximoIndice;
    renderHistoricoBaixas(baixasCache);
  }

  function renderHistoricoBaixas(baixas) {
    baixasCache = baixas || {};
    const lista = App.byId("baixasHistorico");
    const nav = App.byId("baixasNav");
    const indicador = App.byId("baixaIndicador");
    const prevBtn = App.byId("baixaPrevBtn");
    const nextBtn = App.byId("baixaNextBtn");
    if (!lista) return;

    const itens = getBaixasOrdenadas(baixasCache);
    if (!itens.length) {
      if (nav) nav.hidden = true;
      lista.innerHTML = '<div class="detail-card detail-card-rich"><div class="empty-msg">Nenhuma baixa registrada ainda.</div></div>';
      return;
    }

    if (baixaIndiceAtual >= itens.length) baixaIndiceAtual = itens.length - 1;
    if (baixaIndiceAtual < 0) baixaIndiceAtual = 0;

    if (nav) nav.hidden = false;
    if (indicador) indicador.textContent = `${baixaIndiceAtual + 1} de ${itens.length}`;
    if (prevBtn) prevBtn.disabled = baixaIndiceAtual <= 0;
    if (nextBtn) nextBtn.disabled = baixaIndiceAtual >= itens.length - 1;

    const item = itens[baixaIndiceAtual];
    const [ano, mes, dia] = String(item.data || "").split("-");
    const dataFmt = ano ? `${dia}/${mes}/${ano}` : "—";
    const fotoNome = item.comprovanteNome || "foto.jpg";
    const reciboBloco = item.recibo
      ? `
          <img class="da-thumb" id="baixaReciboThumb" src="${item.recibo}" alt="Comprovante gerado">
          <div class="da-info">
            <div class="da-nome">${item.reciboNome || "comprovante.png"}</div>
            <div class="da-actions">
              <button class="da-btn" id="baixaVerRecibo" type="button"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle></svg><span>Visualizar</span></button>
              <a class="da-btn" href="${item.recibo}" download="${item.reciboNome || "comprovante.png"}"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path></svg><span>Baixar</span></a>
            </div>
          </div>`
      : '<div class="empty-msg">Comprovante não disponível.</div>';

    lista.innerHTML = `
      <div class="detail-card detail-card-rich">
        <div class="detail-info">
          <div class="di-row">
            <div class="di-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></div>
            <div class="di-text"><span class="di-k">Dia</span><span class="di-v">${dataFmt}</span></div>
          </div>
          <div class="di-row">
            <div class="di-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg></div>
            <div class="di-text"><span class="di-k">Horário</span><span class="di-v">${item.horario || "—"}</span></div>
          </div>
          <div class="di-row">
            <div class="di-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"></path><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3c1.66 0 3.22.45 4.56 1.24"></path><path d="M16 3h5v5"></path></svg></div>
            <div class="di-text"><span class="di-k">Saldo</span><span class="di-v">${App.formatarExtra(item.saldoBaixado || 0)}</span></div>
          </div>
        </div>

        <div class="detail-anexo">
          <div class="da-head">Foto da baixa</div>
          <div class="da-body">
            <img class="da-thumb" id="baixaFotoThumb" src="${item.comprovante || ""}" alt="Foto da baixa">
            <div class="da-info">
              <div class="da-nome">${fotoNome}</div>
              <div class="da-actions">
                <button class="da-btn" id="baixaVerFoto" type="button"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle></svg><span>Visualizar</span></button>
                <a class="da-btn" href="${item.comprovante || ""}" download="${fotoNome}"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path></svg><span>Baixar</span></a>
              </div>
            </div>
          </div>

          <div class="da-head" style="margin-top:14px;padding-top:14px;border-top:1px solid #ECEFE6;">Comprovante gerado</div>
          <div class="da-body">${reciboBloco}</div>
        </div>
      </div>`;

    App.on("baixaFotoThumb", "click", () => App.abrirImagem(item.comprovante));
    App.on("baixaVerFoto", "click", () => App.abrirImagem(item.comprovante));
    if (item.recibo) {
      App.on("baixaReciboThumb", "click", () => App.abrirImagem(item.recibo));
      App.on("baixaVerRecibo", "click", () => App.abrirImagem(item.recibo));
    }
  }

  async function renderRegistro() {
    if (!App.byId("regPeriodoLabel")) return;

    const registros = await App.Store.getAll();
    const baixas = await App.Store.getAllBaixas();
    preencherPeriodosComprovante(registros);
    atualizarCabecalhoPeriodo();
    const { start, end } = App.getPeriodBounds(registroAnchor);
    const anoCiclo = comprovantePeriodos[0]?.anchor.getFullYear() ?? new Date().getFullYear();
    ultimaBaixaKey = getUltimaBaixaDoAno(baixas, anoCiclo);
    renderHistoricoBaixas(baixas);
    regDadosPeriodo = [];
    regDadosCiclo = [];

    comprovantePeriodos.forEach((periodo) => {
      for (let d = new Date(periodo.start); d <= periodo.end; d.setDate(d.getDate() + 1)) {
        const date = new Date(d);
        const key = App.toKey(date);
        const reg = registros[key];
        if (!reg) continue;
        if (ultimaBaixaKey && key <= ultimaBaixaKey) continue;
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

  App.on("regPrevPeriod", "click", async () => {
    if (!moverPeriodoRegistro(-1)) return;
    await renderRegistro();
  });

  App.on("regNextPeriod", "click", async () => {
    if (!moverPeriodoRegistro(1)) return;
    await renderRegistro();
  });

  function selecionarVisualizacao(valor) {
    const viewRegistros = App.byId("viewRegistros");
    const viewBaixas = App.byId("viewBaixas");
    const opcaoRegistros = App.byId("visOpcaoRegistros");
    const opcaoBaixas = App.byId("visOpcaoBaixas");
    if (!viewRegistros || !viewBaixas) return;
    const ehBaixas = valor === "baixas";
    viewRegistros.hidden = ehBaixas;
    viewBaixas.hidden = !ehBaixas;
    if (opcaoRegistros) opcaoRegistros.classList.toggle("is-active", !ehBaixas);
    if (opcaoBaixas) opcaoBaixas.classList.toggle("is-active", ehBaixas);
  }

  App.on("visOpcaoRegistros", "click", () => selecionarVisualizacao("registros"));
  App.on("visOpcaoBaixas", "click", () => selecionarVisualizacao("baixas"));
  selecionarVisualizacao("registros");

  initSelectPeriodoComprovante();
  App.on("baixarComprovantesBtn", "click", baixarComprovantesPeriodo);
  App.on("baixaSaldoBtn", "click", confirmarBaixaSaldo);
  App.on("baixaPrevBtn", "click", () => moverBaixa(-1));
  App.on("baixaNextBtn", "click", () => moverBaixa(1));
  App.on("baixaCamera", "change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const resumoAtual = getResumoCiclo();
    const reader = new FileReader();
    reader.onload = () => {
      confirmarESalvarBaixa(reader.result, resumoAtual.saldo);
    };
    reader.readAsDataURL(file);
  });

  App.initShell({
    onReady: async () => {
      await renderRegistro();
    },
    onAuthChange: async () => {
      await renderRegistro();
    },
  });
})();
