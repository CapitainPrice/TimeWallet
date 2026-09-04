(() => {
  const App = window.TimeWallet;
  if (!App) return;

  let periodAnchor = App.getCurrentPaymentAnchor();
  let periodosCalendario = [];

  function splitComprovanteResumo(resumo) {
    const match = String(resumo || "").match(/^comprovante_([^_]+)_(.+)$/);
    if (!match) return null;
    return [`comprovante_`, `${match[1]}_`, match[2].replace(/_/g, " ")];
  }

  function mostrarViewCalendario() {
    const calendarView = App.byId("calendarView");
    const detailView = App.byId("detailView");
    if (calendarView) calendarView.style.display = "block";
    if (detailView) detailView.style.display = "none";
    App.setPrimaryNavigationOverride(null);
  }

  function mostrarViewDetalhe() {
    const calendarView = App.byId("calendarView");
    const detailView = App.byId("detailView");
    if (calendarView) calendarView.style.display = "none";
    if (detailView) detailView.style.display = "block";
    App.setPrimaryNavigationOverride({
      label: "Voltar ao calendário",
      ariaLabel: "Voltar ao calendário",
      onClick: mostrarViewCalendario,
    });
  }

  function renderCabecalhoCalendario(data = App.hoje) {
    const el = App.byId("calHeadingData");
    if (el) el.textContent = App.formatarDataPrincipal(data);
  }

  function renderCabecalhoDetalhe(data) {
    const el = App.byId("detailHeadingData");
    if (el) el.textContent = App.formatarDataPrincipal(data);
  }

  function getPrimeiroPeriodoPermitido() {
    return App.startOfMonth(App.getComprovanteCicloAtual().start);
  }

  function preencherPeriodosCalendario(registros) {
    periodosCalendario = App.getPeriodosComRegistro(new Date().getFullYear(), registros);
    if (!periodosCalendario.some((periodo) => periodo.value === App.toKey(periodAnchor))) {
      periodAnchor = App.getCurrentPaymentAnchor();
    }
  }

  function fillPeriodSelect(selectId, selectedValue) {
    const select = App.byId(selectId);
    if (!select) return;
    select.innerHTML = App.getPeriodDayOptions().map((day) => `<option value="${day}">${day}</option>`).join("");
    select.value = String(selectedValue);
  }

  function atualizarModoConfiguracaoPeriodo() {
    const modo = App.byId("periodConfigMode")?.value || "period";
    document.querySelectorAll(".period-date-field").forEach((field) => { field.hidden = modo !== "period"; });
    document.querySelectorAll(".period-time-field").forEach((field) => { field.hidden = modo !== "point"; });
    const label = App.byId("periodSaveLabel");
    if (label) label.textContent = modo === "point" ? "Salvar horário" : "Salvar período";
  }

  function abrirConfiguracaoPeriodo() {
    const modal = App.byId("periodModal");
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    const atual = App.getPeriodConfig();
    fillPeriodSelect("periodStartSelect", atual.startDay);
    fillPeriodSelect("periodEndSelect", atual.endDay);
    const horario = App.getPointTimeConfig();
    fillTimeSelect("periodPointHourSelect", horario.hour, 23);
    fillTimeSelect("periodPointMinuteSelect", horario.minute, 59);
    const modo = App.byId("periodConfigMode");
    if (modo) modo.value = "period";
    atualizarModoConfiguracaoPeriodo();
  }

  function fecharConfiguracaoPeriodo() {
    const modal = App.byId("periodModal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  async function salvarConfiguracaoPeriodo() {
    const modo = App.byId("periodConfigMode")?.value || "period";
    if (modo === "point") {
      const hour = Number(App.byId("periodPointHourSelect")?.value);
      const minute = Number(App.byId("periodPointMinuteSelect")?.value);
      const config = App.setPointTimeConfig(hour, minute);
      fecharConfiguracaoPeriodo();
      await renderCalendario();
      App.mostrarToast(`Horário do ponto atualizado: ${String(config.hour).padStart(2, "0")}:${String(config.minute).padStart(2, "0")}`);
      return;
    }
    const startDay = Number(App.byId("periodStartSelect")?.value);
    const endDay = Number(App.byId("periodEndSelect")?.value);
    if (!startDay || !endDay) return;
    const config = App.setPeriodConfig(startDay, endDay);
    fecharConfiguracaoPeriodo();
    periodAnchor = App.getCurrentPaymentAnchor();
    mostrarViewCalendario();
    await renderCalendario();
    App.mostrarToast(`Período atualizado: ${String(config.startDay).padStart(2, "0")}/${String(config.endDay).padStart(2, "0")}`);
  }

  async function renderCalendario() {
    const monthLabel = App.byId("monthLabel");
    const grid = App.byId("calGrid");
    const prevBtn = App.byId("prevMonth");
    const nextBtn = App.byId("nextMonth");
    if (!monthLabel || !grid) return;

    const registros = await App.Store.getAll();
    preencherPeriodosCalendario(registros);

    const { start, end } = App.getPeriodBounds(periodAnchor);
    monthLabel.textContent = App.getPeriodLabel(periodAnchor);
    const indiceAtual = periodosCalendario.findIndex((periodo) => periodo.value === App.toKey(periodAnchor));
    if (prevBtn) prevBtn.disabled = indiceAtual <= 0;
    if (nextBtn) nextBtn.disabled = indiceAtual < 0 || indiceAtual >= periodosCalendario.length - 1;
    grid.innerHTML = "";

    App.DIAS_SEMANA_ABR.forEach((dia) => {
      const el = document.createElement("div");
      el.className = "wd";
      el.textContent = dia;
      grid.appendChild(el);
    });

    const firstDow = start.getDay();
    for (let i = 0; i < firstDow; i += 1) {
      const el = document.createElement("div");
      el.className = "cal-cell empty";
      grid.appendChild(el);
    }

    let totalMin = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = new Date(d);
      const key = App.toKey(date);
      const util = App.isDiaUtil(date);
      const reg = registros[key];
      const primeiroPeriodoPermitido = getPrimeiroPeriodoPermitido();
      const boundsPrimeiroPeriodo = App.getPeriodBounds(primeiroPeriodoPermitido);
      const podeRegistrar = date >= boundsPrimeiroPeriodo.start;
      const podeAbrirDetalhe = (util && podeRegistrar) || Boolean(reg);
      const btn = document.createElement("button");
      btn.className = "cal-cell";
      btn.type = "button";
      if (!util) btn.className += " off";
      if (key === App.hojeKey) btn.className += " today";
      if (reg) {
        btn.className += " filled";
        btn.className += reg.extraMin < 0 ? " filled-negative" : reg.extraMin === 0 ? " filled-neutral" : " filled-positive";
      }
      if (util && podeRegistrar && !reg && key < App.hojeKey) btn.className += " pending";
      btn.textContent = date.getDate();
      if (podeAbrirDetalhe) btn.addEventListener("click", () => mostrarDetalhe(key, date));
      grid.appendChild(btn);
      if (reg) totalMin += reg.extraMin;
    }

    const totalExtra = App.byId("totalExtra");
    const totalLabel = App.byId("totalLabel");
    if (totalExtra) {
      totalExtra.textContent = App.formatarExtra(totalMin);
      totalExtra.style.color = "#fff";
    }
    if (totalLabel) totalLabel.textContent = `Saldo do período (${App.MESES[end.getMonth()]})`;
  }


  function baixarImagem(blob, start, end) {
    if (!blob) return;
    const nomeArquivo = `banco-horas_${App.fmtCurta(start).replace("/", "-")}_a_${App.fmtCurta(end).replace("/", "-")}-${end.getFullYear()}.png`;
    App.baixarImagemRelatorio(blob, nomeArquivo);
  }

  async function gerarImagem() {
    const { start, end } = App.getPeriodBounds(periodAnchor);
    const registros = await App.Store.getAll();
    const dadosPeriodo = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = new Date(d);
      const key = App.toKey(date);
      const reg = registros[key];
      if (!reg) continue;
      dadosPeriodo.push({ key, date, reg });
    }

    if (dadosPeriodo.length === 0) {
      App.mostrarToast("Não há registros neste período para gerar a imagem.", "warning");
      return;
    }

    const resumo = dadosPeriodo.reduce((acc, item) => {
      acc.total += 1;
      if (item.reg.extraMin > 0) acc.positivos += 1;
      if (item.reg.extraMin < 0) acc.negativos += 1;
      acc.saldo += item.reg.extraMin;
      return acc;
    }, { total: 0, positivos: 0, negativos: 0, saldo: 0 });

    const dados = dadosPeriodo.map(({ key, date, reg }) => {
      const comprovanteResumo = App.getComprovanteInfo(key, reg?.comprovanteNome).resumo;
      return {
        dia: `${App.DIAS_SEMANA[date.getDay()]}, ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`,
        ponto: App.getPointTimeLabel(),
        saida: reg.saida,
        localizacao: App.getLocalizacaoTexto(reg.localizacao),
        comprovante: comprovanteResumo,
        comprovanteLinhas: splitComprovanteResumo(comprovanteResumo),
        saldo: reg.extraMin > 0 ? `+${App.formatarExtra(reg.extraMin)}` : App.formatarExtra(reg.extraMin),
        estado: reg.extraMin < 0 ? "negativo" : reg.extraMin > 0 ? "positivo" : "neutro",
      };
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const totalW = 1120;
    const padding = 36;
    const metricGap = 16;
    const metricH = 82;
    const heroH = 110;
    const headerH = 98;
    const rowH = 126;
    const footerH = 68;
    const cols = [
      { key: "dia", label: "Dia", width: 0.23, align: "left" },
      { key: "ponto", label: "Ponto", width: 0.09, align: "center" },
      { key: "saida", label: "Saída", width: 0.11, align: "center" },
      { key: "localizacao", label: "Localização", width: 0.28, align: "left" },
      { key: "comprovante", label: "Comprovante", width: 0.17, align: "left" },
      { key: "saldo", label: "Saldo", width: 0.12, align: "right" },
    ];

    const logoH = await App.drawLogoImage(ctx, totalW, padding, "../assets/timewallet_logo_header_black.svg", 620);
    const titleTop = padding + logoH + 14;
    const tableTop = titleTop + heroH + metricH + 120;
    const totalH = tableTop + headerH + dados.length * rowH + footerH + padding;

    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#F7F5EE";
    ctx.fillRect(0, 0, totalW, totalH);

    if (logoH) await App.drawLogoImage(ctx, totalW, padding, "../assets/timewallet_logo_header_black.svg", 620);

    ctx.fillStyle = "#20291A";
    ctx.font = '700 28px Georgia, "Times New Roman", serif';
    ctx.textAlign = "center";
    ctx.fillText("Banco de Horas", totalW / 2, titleTop + 6);

    ctx.fillStyle = "#7A8570";
    ctx.font = "600 14px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`Período ${App.getPeriodLabel(periodAnchor)}`, totalW / 2, titleTop + 30);

    const heroY = titleTop + 48;
    App.drawRoundedRect(ctx, padding, heroY, totalW - padding * 2, heroH, 28, "#AEB49E", null);

    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.font = "700 13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Saldo do período", padding + 28, heroY + 34);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 38px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(App.formatarExtra(resumo.saldo), padding + 28, heroY + 76);

    ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(App.obterNomeUsuario() || "—", totalW - padding - 28, heroY + 55);

    const metricY = heroY + heroH + 18;
    const metricW = (totalW - padding * 2 - metricGap * 2) / 3;
    App.drawMetricCard(ctx, padding, metricY, metricW, metricH, "Registros", resumo.total, "#20291A");
    App.drawMetricCard(ctx, padding + metricW + metricGap, metricY, metricW, metricH, "Extras", resumo.positivos, "#4A701C");
    App.drawMetricCard(ctx, padding + (metricW + metricGap) * 2, metricY, metricW, metricH, "Descontos", resumo.negativos, "#B3261E");

    App.drawRoundedRect(ctx, padding, tableTop, totalW - padding * 2, headerH + dados.length * rowH, 28, "#FFFFFF", "#AEB7A0");

    let x = padding;
    cols.forEach((col, index) => {
      const colW = (totalW - padding * 2) * col.width;
      App.drawCellText(ctx, col.label, x, tableTop, colW, headerH, col.align, "#000000", "700 20px -apple-system, BlinkMacSystemFont, sans-serif", 1);
      if (index < cols.length - 1) {
        ctx.strokeStyle = "#B2BAA7";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + colW, tableTop + 8);
        ctx.lineTo(x + colW, tableTop + headerH + dados.length * rowH - 8);
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

    let y = tableTop + headerH;
    dados.forEach((row, index) => {
      if (index > 0) {
        ctx.strokeStyle = "#BCC4B2";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padding + 1, y);
        ctx.lineTo(totalW - padding - 1, y);
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
        const font = "700 18px -apple-system, BlinkMacSystemFont, sans-serif";
        if (col.key === "comprovante" && row.comprovanteLinhas) {
          App.drawCellLines(ctx, row.comprovanteLinhas, colX, y, colW, rowH, col.align, color, font);
        } else {
          App.drawCellText(ctx, row[col.key], colX, y, colW, rowH, col.align, color, font, col.key === "localizacao" ? 4 : col.key === "comprovante" || col.key === "dia" ? 3 : 2);
        }
        colX += colW;
      });
      y += rowH;
    });

    ctx.fillStyle = "#000000";
    ctx.font = "700 14px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Gerado em ${new Date().toLocaleString("pt-BR")}`, totalW / 2, y + 36);

    canvas.toBlob((blob) => baixarImagem(blob, start, end), "image/png");
  }

  function fillTimeSelect(selectId, selectedValue, maxValue) {
    const select = App.byId(selectId);
    if (!select) return;
    select.innerHTML = Array.from({ length: maxValue + 1 }, (_, value) => {
      const label = String(value).padStart(2, "0");
      return `<option value="${label}">${label}</option>`;
    }).join("");
    if (selectedValue) select.value = String(selectedValue).padStart(2, "0");
  }

  function abrirConfiguracaoHorario() {
    const modal = App.byId("timeModal");
    if (!modal) return;
    const valorAtual = App.byId("saidaManual")?.value || "17:00";
    const [hora, minuto] = valorAtual.split(":");
    fillTimeSelect("timeHourSelect", Number(hora || 17), 23);
    fillTimeSelect("timeMinuteSelect", Number(minuto || 0), 59);
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function fecharConfiguracaoHorario() {
    const modal = App.byId("timeModal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function atualizarLabelHorario() {
    const campo = App.byId("saidaManual");
    const label = App.byId("saidaManualLabel");
    const trigger = App.byId("timeTriggerBtn");
    if (!campo || !label || !trigger) return;
    const valor = campo.value || "";
    label.textContent = valor || "Selecionar horário";
    trigger.classList.toggle("is-placeholder", !valor);
  }

  function salvarConfiguracaoHorario() {
    const hora = App.byId("timeHourSelect")?.value;
    const minuto = App.byId("timeMinuteSelect")?.value;
    const campo = App.byId("saidaManual");
    if (!hora || !minuto || !campo) return;
    campo.value = `${hora}:${minuto}`;
    atualizarLabelHorario();
    fecharConfiguracaoHorario();
  }

  function renderFormManual(key, date, dataFmt) {
    const area = App.byId("detailArea");
    if (!area) return;
    let manualBase64 = null;
    let manualNome = null;

    area.innerHTML = `
      <div class="detail-card detail-card-rich form-manual">
        <div class="detail-card-top">
          <div class="detail-card-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"></path><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3c1.66 0 3.22.45 4.56 1.24"></path><path d="M16 3h5v5"></path></svg>
          </div>
          <div>
            <div class="detail-card-title">Registro manual</div>
            <div class="detail-card-subtitle">Preencha os dados para salvar este dia.</div>
          </div>
        </div>

        <label for="saidaManual">
          <span class="label-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg></span>
          Horário Saída
        </label>
        <button type="button" class="time-trigger-btn" id="timeTriggerBtn">
          <span id="saidaManualLabel">Selecionar horário</span>
          <span class="time-trigger-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg></span>
        </button>
        <input type="hidden" id="saidaManual">

        <label>
          <span class="label-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg></span>
          Comprovante
        </label>
        <div class="file-drop file-drop-manual" id="fileDropManual">
          <div class="ph" id="filePhManual">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <span>Selecione uma imagem da galeria</span>
          </div>
          <img id="fileImgManual" style="display:none;">
          <div class="file-actions">
            <button type="button" class="fa-btn" id="btnGaleriaManual" style="flex:1;">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>
              Abrir galeria
            </button>
          </div>
          <input type="file" id="comprovanteGaleriaManual" accept="image/*" hidden>
        </div>

        <button class="btn" id="salvarManual"><span class="btn-ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path></svg></span>Salvar registro</button>
      </div>
    `;

    atualizarLabelHorario();
    App.on("timeTriggerBtn", "click", abrirConfiguracaoHorario);
    App.on("btnGaleriaManual", "click", () => App.byId("comprovanteGaleriaManual")?.click());
    App.on("comprovanteGaleriaManual", "change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      manualNome = App.formatComprovanteNome ? App.formatComprovanteNome(key, file.name) : file.name;
      const reader = new FileReader();
      reader.onload = () => {
        manualBase64 = reader.result;
        const img = App.byId("fileImgManual");
        const ph = App.byId("filePhManual");
        if (img) {
          img.src = manualBase64;
          img.style.display = "block";
        }
        if (ph) ph.style.display = "none";
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    });

    App.on("salvarManual", "click", async () => {
      const saida = App.byId("saidaManual")?.value;
      if (!saida) {
        App.mostrarToast("Informe o horário de saída antes de salvar.", "warning");
        return;
      }
      if (!manualBase64) {
        App.mostrarToast("Anexe uma imagem do comprovante antes de salvar.", "warning");
        return;
      }

      const extraMin = App.calcularExtra(saida);
      const comprovanteInfo = App.getComprovanteInfo ? App.getComprovanteInfo(key, manualNome) : {
        nome: manualNome,
        titulo: manualNome,
        periodo: "—",
      };
      const recibo = await App.gerarComprovanteRegistro({
        foto: manualBase64,
        data: dataFmt,
        horario: saida,
        localizacao: null,
        usuario: App.obterNomeUsuario(),
        saldo: App.formatarSaldoTexto(extraMin),
      });
      await App.Store.set(key, {
        saida,
        extraMin,
        comprovante: recibo,
        comprovanteNome: comprovanteInfo.nome,
        comprovantePeriodo: comprovanteInfo.periodo,
        localizacao: null,
      });
      App.mostrarToast("Registro salvo com sucesso!");
      await renderCalendario();
      await mostrarDetalhe(key, date);
    });
  }

  async function mostrarDetalhe(key, date) {
    const area = App.byId("detailArea");
    if (!area) return;

    const heroIcon = App.byId("detailHeroIcon");
    if (heroIcon) heroIcon.classList.remove("is-danger");

    area.innerHTML = '<div class="empty-msg">Carregando...</div>';
    mostrarViewDetalhe();
    renderCabecalhoDetalhe(date);
    const reg = await App.Store.get(key);
    const dataFmt = `${App.DIAS_SEMANA[date.getDay()]}, ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

    if (reg && heroIcon) heroIcon.classList.toggle("is-danger", reg.extraMin < 0);

    if (!reg) {
      const primeiroPeriodoPermitido = getPrimeiroPeriodoPermitido();
      const boundsPrimeiroPeriodo = App.getPeriodBounds(primeiroPeriodoPermitido);
      if (date < boundsPrimeiroPeriodo.start) {
        area.innerHTML = '<div class="detail-card"><div class="empty-msg">Esse dia ainda não está liberado no seu ciclo.</div></div>';
        return;
      }
      if (key > App.hojeKey) {
        area.innerHTML = '<div class="detail-card"><div class="empty-msg">Esse dia ainda não chegou.</div></div>';
        return;
      }
      renderFormManual(key, date, dataFmt);
      return;
    }

    const comprovanteInfo = App.getComprovanteInfo ? App.getComprovanteInfo(key, reg.comprovanteNome) : {
      nome: reg.comprovanteNome || "comprovante.jpg",
      titulo: reg.comprovanteNome || "comprovante.jpg",
      resumo: reg.comprovanteNome || "comprovante",
      periodo: reg.comprovantePeriodo || "—",
    };
    const nome = comprovanteInfo.nome;
    const statusLabel = reg.extraMin < 0 ? "Desconto" : reg.extraMin === 0 ? "Neutro" : "Tempo extra";
    const heroClass = "detail-hero";
    const heroBg = "background:#AEB49E;color:#fff;";
    const localizacaoHtml = reg.localizacao ? App.getLocationMapLink(reg.localizacao) : "Não registrada";

    area.innerHTML = `
      <div class="detail-card detail-card-rich">
        <div class="detail-card-top">
          <div class="detail-card-badge ${reg.extraMin < 0 ? "is-danger" : reg.extraMin > 0 ? "is-success" : ""}">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"></path><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3c1.66 0 3.22.45 4.56 1.24"></path><path d="M16 3h5v5"></path></svg>
          </div>
          <div>
            <div class="detail-card-title">Registro salvo</div>
            <div class="detail-card-subtitle">Consulte os dados do comprovante e da saída.</div>
          </div>
        </div>

        <div class="${heroClass}" style="${heroBg}">
          <div class="dh-label">${statusLabel}</div>
          <div class="dh-value">${App.formatarExtra(reg.extraMin)}</div>
        </div>

        <div class="detail-info">
          <div class="di-row">
            <div class="di-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>
            </div>
            <div class="di-text"><span class="di-k">Horário de ponto</span><span class="di-v">${App.getPointTimeLabel()}</span></div>
          </div>
          <div class="di-row">
            <div class="di-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>
            </div>
            <div class="di-text"><span class="di-k">Horário de saída</span><span class="di-v">${reg.saida}</span></div>
          </div>
          <div class="di-row">
            <div class="di-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            </div>
            <div class="di-text"><span class="di-k">Localização</span><span class="di-v">${localizacaoHtml}</span></div>
          </div>
        </div>

        <div class="detail-anexo">
          <div class="da-head">Comprovante</div>
          <div class="da-body">
            <img class="da-thumb" id="anexoThumb" src="${reg.comprovante || ""}" alt="Comprovante">
            <div class="da-info">
              <div class="da-nome">${comprovanteInfo.titulo}</div>
              <div class="da-periodo">${comprovanteInfo.periodo}</div>
              <div class="da-actions">
                <button class="da-btn" id="anexoVer" type="button"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle></svg><span>Visualizar</span></button>
                <a class="da-btn" id="anexoDownload"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path></svg><span>Baixar</span></a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    if (reg.comprovante) {
      App.on("anexoThumb", "click", () => App.abrirImagem(reg.comprovante));
      App.on("anexoVer", "click", () => App.abrirImagem(reg.comprovante));
      const dl = App.byId("anexoDownload");
      if (dl) {
        dl.href = reg.comprovante;
        dl.setAttribute("download", nome);
      }
    }
  }

  App.on("prevMonth", "click", async () => {
    const indiceAtual = periodosCalendario.findIndex((periodo) => periodo.value === App.toKey(periodAnchor));
    if (indiceAtual <= 0) return;
    periodAnchor = periodosCalendario[indiceAtual - 1].anchor;
    await renderCalendario();
  });
  App.on("nextMonth", "click", async () => {
    const indiceAtual = periodosCalendario.findIndex((periodo) => periodo.value === App.toKey(periodAnchor));
    if (indiceAtual < 0 || indiceAtual >= periodosCalendario.length - 1) return;
    periodAnchor = periodosCalendario[indiceAtual + 1].anchor;
    await renderCalendario();
  });
  App.on("periodSettingsBtn", "click", abrirConfiguracaoPeriodo);
  App.on("periodConfigMode", "change", atualizarModoConfiguracaoPeriodo);
  App.on("periodCloseBtn", "click", fecharConfiguracaoPeriodo);
  App.on("periodCancelBtn", "click", fecharConfiguracaoPeriodo);
  App.on("periodSaveBtn", "click", salvarConfiguracaoPeriodo);
  App.on("periodModal", "click", (e) => {
    if (e.target.id === "periodModal") fecharConfiguracaoPeriodo();
  });
  App.on("timeCloseBtn", "click", fecharConfiguracaoHorario);
  App.on("timeCancelBtn", "click", fecharConfiguracaoHorario);
  App.on("timeSaveBtn", "click", salvarConfiguracaoHorario);
  App.on("timeModal", "click", (e) => {
    if (e.target.id === "timeModal") fecharConfiguracaoHorario();
  });
  App.on("exportarBtn", "click", gerarImagem);

  App.initShell({
    onReady: async () => {
      periodAnchor = App.getCurrentPaymentAnchor();
      mostrarViewCalendario();
      renderCabecalhoCalendario();
      await renderCalendario();
    },
    onAuthChange: async () => {
      try {
        await renderCalendario();
      } catch (error) {
        console.error("Erro ao atualizar o calendário após autenticação:", error);
        App.mostrarToast("Não foi possível sincronizar os registros agora.", "warning");
      }
    },
  });
})();
