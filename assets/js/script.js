(() => {
  const App = window.TimeWallet;
  if (!App) return;

  const FRASES_SAUDACAO = {
    manha: [
      (n) => `Bom dia${n}! Pronto para registrar seu dia?`,
      (n) => `Bom dia${n}! Vamos conferir suas horas de hoje.`,
      (n) => `Bom dia${n}! Bora começar com o ponto em dia.`,
      (n) => `Bom dia${n}! Já pode bater o registro quando sair.`,
    ],
    tarde: [
      (n) => `Boa tarde${n}! Seguindo firme no expediente.`,
      (n) => `Boa tarde${n}! Não esqueça de registrar sua saída.`,
      (n) => `Boa tarde${n}! Vamos fechar o dia certinho.`,
      (n) => `Boa tarde${n}! Falta pouco para o registro de hoje.`,
    ],
    noite: [
      (n) => `Boa noite${n}! Hora de registrar sua saída.`,
      (n) => `Boa noite${n}! Vamos fechar o expediente de hoje.`,
      (n) => `Boa noite${n}! Vamos conferir seu tempo extra.`,
      (n) => `Boa noite${n}! Já pode tirar a foto do comprovante.`,
    ],
  };

  let comprovanteBase64 = null;
  let comprovanteFotoOriginal = null;
  let comprovanteNome = null;
  let comprovanteLocalizacao = null;
  let registroHojeTravado = false;
  let timerViradaDia = null;

  function getAgora() {
    return new Date();
  }

  function getHojeKey() {
    return App.toKey(getAgora());
  }

  function getDataFmtHoje() {
    const agora = getAgora();
    return `${App.DIAS_SEMANA[agora.getDay()]}, ${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`;
  }

  function periodoDoDia(hora) {
    if (hora < 12) return "manha";
    if (hora < 18) return "tarde";
    return "noite";
  }

  function renderCabecalhoHome() {
    const titulo = App.byId("saudacaoPrincipal");
    if (!titulo) return;
    const agora = getAgora();
    const nomeRaw = App.obterNomeUsuario();
    const nomeTexto = nomeRaw ? `, ${nomeRaw}` : "";
    const lista = FRASES_SAUDACAO[periodoDoDia(agora.getHours())];
    const diaDoAno = Math.floor((agora - new Date(agora.getFullYear(), 0, 0)) / 86400000);
    titulo.textContent = lista[diaDoAno % lista.length](nomeTexto);
  }

  function atualizarTravaRegistroHoje(travado) {
    registroHojeTravado = Boolean(travado);
    const btn = App.byId("btnCamera");
    if (!btn) return;
    btn.disabled = registroHojeTravado;
    btn.style.opacity = registroHojeTravado ? ".55" : "";
    btn.style.cursor = registroHojeTravado ? "not-allowed" : "";
  }

  function limparRegistroHojeUI() {
    const saida = App.byId("saida");
    const fileImg = App.byId("fileImg");
    const filePh = App.byId("filePh");
    const doneStatus = App.byId("doneStatus");
    const tempoExtraLabel = App.byId("tempoExtraLabel");
    const tempoExtra = App.byId("tempoExtra");
    const horarioCapturado = App.byId("horarioCapturado");
    const resultBox = App.byId("resultBox");

    if (saida) saida.value = "";
    if (fileImg) {
      fileImg.removeAttribute("src");
      fileImg.style.display = "none";
    }
    if (filePh) filePh.style.display = "flex";
    if (doneStatus) doneStatus.style.display = "none";
    if (tempoExtraLabel) tempoExtraLabel.textContent = "Tempo extra";
    if (tempoExtra) tempoExtra.textContent = "—";
    if (horarioCapturado) horarioCapturado.textContent = "Aguardando registro de hoje";
    if (resultBox) {
      resultBox.classList.add("hero-muted");
      resultBox.style.background = "";
      resultBox.style.color = "";
    }
    atualizarMetaComprovante(getHojeKey(), null);

    comprovanteBase64 = null;
    comprovanteFotoOriginal = null;
    comprovanteNome = null;
    comprovanteLocalizacao = null;
    atualizarTravaRegistroHoje(false);
  }

  function exibirComprovante(base64) {
    const filePh = App.byId("filePh");
    const doneStatus = App.byId("doneStatus");
    if (!base64 || !filePh || !doneStatus) return;
    filePh.style.display = "none";
    doneStatus.style.display = "flex";
  }

  let geoRetryOnFocus = null;

  function exibirStatusGeo(texto, { retry = false } = {}) {
    const box = App.byId("comprovanteMeta");
    const valorEl = App.byId("comprovantePeriodo");
    const retryBtn = App.byId("geoRetryBtn");
    if (!box || !valorEl) return;
    box.hidden = false;
    valorEl.textContent = texto;
    if (retryBtn) retryBtn.hidden = !retry;

    if (geoRetryOnFocus) {
      document.removeEventListener("visibilitychange", geoRetryOnFocus);
      geoRetryOnFocus = null;
    }

    if (retry) {
      geoRetryOnFocus = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", geoRetryOnFocus);
        geoRetryOnFocus = null;
        capturarLocalizacao();
      };
      document.addEventListener("visibilitychange", geoRetryOnFocus);
    }
  }

  function preencherHorarioAtual() {
    const saida = App.byId("saida");
    if (!saida) return;
    const agora = getAgora();
    saida.value = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  }

  function atualizarMetaComprovante(dateKey, nomeOriginal) {
    const box = App.byId("comprovanteMeta");
    const periodoEl = App.byId("comprovantePeriodo");
    const retryBtn = App.byId("geoRetryBtn");
    if (!box || !periodoEl) return;
    if (retryBtn) retryBtn.hidden = true;
    if (!nomeOriginal) {
      box.hidden = true;
      periodoEl.textContent = "—";
      return;
    }
    periodoEl.textContent = comprovanteLocalizacao ? App.getLocationDisplay(comprovanteLocalizacao) : "Obtendo localização...";
    box.hidden = false;
  }

  function mostrarResultado(min, horario) {
    const box = App.byId("resultBox");
    const tempoExtraLabel = App.byId("tempoExtraLabel");
    const tempoExtra = App.byId("tempoExtra");
    const horarioCapturado = App.byId("horarioCapturado");
    if (!box || !tempoExtraLabel || !tempoExtra || !horarioCapturado) return;

    if (min === 0) {
      box.classList.add("hero-muted");
      box.style.background = "#AEB49E";
      box.style.color = "#fff";
      tempoExtraLabel.textContent = "Neutro";
    } else {
      box.classList.remove("hero-muted");
      box.style.background = "#AEB49E";
      box.style.color = "#fff";
      tempoExtraLabel.textContent = min < 0 ? "Desconto" : "Tempo extra";
    }

    tempoExtra.textContent = App.formatarExtra(min);
    horarioCapturado.textContent = `Saída registrada às ${horario}`;
  }

  async function carregarRegistroHoje() {
    if (!App.byId("saida")) return;
    const hojeKey = getHojeKey();
    limparRegistroHojeUI();
    const reg = await App.Store.get(hojeKey);
    if (!reg) return;

    App.byId("saida").value = reg.saida;
    comprovanteBase64 = reg.comprovante || null;
    comprovanteNome = reg.comprovanteNome || null;
    comprovanteLocalizacao = reg.localizacao || null;

    if (comprovanteBase64) exibirComprovante(comprovanteBase64);
    atualizarMetaComprovante(hojeKey, comprovanteNome);
    mostrarResultado(reg.extraMin, reg.saida);
    atualizarTravaRegistroHoje(true);
    if (!comprovanteLocalizacao) capturarLocalizacao();
  }

  async function salvarRegistroHoje() {
    const saida = App.byId("saida");
    const hojeKey = getHojeKey();
    if (!saida || !saida.value || !comprovanteBase64) return false;

    const existente = await App.Store.get(hojeKey);
    if (existente) {
      atualizarTravaRegistroHoje(true);
      App.mostrarToast("Você já registrou sua saída hoje.");
      return false;
    }

    const extraMin = App.calcularExtra(saida.value);
    const comprovanteInfo = App.getComprovanteInfo ? App.getComprovanteInfo(hojeKey, comprovanteNome) : {
      nome: comprovanteNome,
      resumo: comprovanteNome,
      periodo: "—",
    };
    comprovanteNome = comprovanteInfo.nome;

    const recibo = await App.gerarComprovanteRegistro({
      foto: comprovanteFotoOriginal || comprovanteBase64,
      data: getDataFmtHoje(),
      horario: saida.value,
      localizacao: comprovanteLocalizacao ? App.getLocationDisplay(comprovanteLocalizacao) : null,
      usuario: App.obterNomeUsuario(),
      saldo: App.formatarSaldoTexto(extraMin),
    });

    await App.Store.set(hojeKey, {
      saida: saida.value,
      extraMin,
      comprovante: recibo,
      comprovanteNome,
      comprovantePeriodo: comprovanteInfo.periodo,
      localizacao: comprovanteLocalizacao,
    });
    mostrarResultado(extraMin, saida.value);
    atualizarMetaComprovante(hojeKey, comprovanteNome);
    atualizarTravaRegistroHoje(true);
    return true;
  }

  async function salvarLocalizacaoRegistroHoje() {
    if (!comprovanteLocalizacao) return;
    const hojeKey = getHojeKey();
    const registro = await App.Store.get(hojeKey);
    if (!registro) return;

    if (!comprovanteFotoOriginal) {
      await App.Store.set(hojeKey, { ...registro, localizacao: comprovanteLocalizacao });
      return;
    }

    const recibo = await App.gerarComprovanteRegistro({
      foto: comprovanteFotoOriginal,
      data: getDataFmtHoje(),
      horario: registro.saida,
      localizacao: App.getLocationDisplay(comprovanteLocalizacao),
      usuario: App.obterNomeUsuario(),
      saldo: App.formatarSaldoTexto(registro.extraMin),
    });
    await App.Store.set(hojeKey, { ...registro, comprovante: recibo, localizacao: comprovanteLocalizacao });
  }

  function processarArquivo(file) {
    if (registroHojeTravado) {
      App.mostrarToast("Você já registrou sua saída hoje.");
      return;
    }
    comprovanteNome = App.formatComprovanteNome ? App.formatComprovanteNome(getHojeKey(), file.name) : file.name;
    const reader = new FileReader();
    reader.onload = async () => {
      comprovanteBase64 = reader.result;
      comprovanteFotoOriginal = comprovanteBase64;
      exibirComprovante(comprovanteBase64);
      preencherHorarioAtual();
      const salvou = await salvarRegistroHoje();
      if (!salvou) return;
      App.mostrarToast("Registro salvo automaticamente!");
      capturarLocalizacao();
    };
    reader.readAsDataURL(file);
  }

  function capturarLocalizacao() {
    if (!navigator.geolocation) {
      exibirStatusGeo("Localização não suportada neste dispositivo");
      return;
    }
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      exibirStatusGeo("Localização indisponível fora de conexão segura (HTTPS)");
      return;
    }

    const obterPosicao = (opcoes) =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, opcoes);
      });

    const tentarObter = async () => {
      exibirStatusGeo("Obtendo localização...");
      let pos;
      try {
        pos = await obterPosicao({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      } catch (error) {
        if (error?.code === error.PERMISSION_DENIED) {
          comprovanteLocalizacao = null;
          exibirStatusGeo("Permita a localização nas permissões do navegador e tente novamente", { retry: true });
          return;
        }
        if (error?.code === error.TIMEOUT) {
          try {
            exibirStatusGeo("Ainda obtendo localização (tentando via rede)...");
            pos = await obterPosicao({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
          } catch (segundoErro) {
            comprovanteLocalizacao = null;
            exibirStatusGeo("A localização demorou demais para responder", { retry: true });
            return;
          }
        } else {
          comprovanteLocalizacao = null;
          exibirStatusGeo("Ative a localização do dispositivo e tente novamente", { retry: true });
          return;
        }
      }

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      comprovanteLocalizacao = { lat, lng };
      exibirStatusGeo("Obtendo endereço...");
      const address = await App.reverseGeocode(lat, lng);
      comprovanteLocalizacao.address = address;
      exibirStatusGeo(address);
      await salvarLocalizacaoRegistroHoje();
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (status.state === "denied") {
            exibirStatusGeo("Localização bloqueada para este site. Habilite nas permissões do navegador e tente novamente", { retry: true });
            return;
          }
          tentarObter();
        })
        .catch(tentarObter);
      return;
    }

    tentarObter();
  }

  async function abrirCamera() {
    await App.Store.waitAuthReady();
    if (!App.Store.getCurrentUser()) {
      App.mostrarToast("Faça login com Google para registrar.");
      return;
    }
    if (registroHojeTravado) {
      App.mostrarToast("Você já registrou sua saída hoje.");
      return;
    }
    const resultado = await App.abrirCameraModal();
    if (resultado === "unsupported") {
      App.byId("comprovanteCamera")?.click();
      return;
    }
    if (!resultado) return;

    comprovanteNome = App.formatComprovanteNome ? App.formatComprovanteNome(getHojeKey(), "foto.jpg") : `foto_${Date.now()}.jpg`;
    comprovanteBase64 = resultado;
    comprovanteFotoOriginal = comprovanteBase64;
    exibirComprovante(comprovanteBase64);
    preencherHorarioAtual();
    const salvou = await salvarRegistroHoje();
    if (!salvou) return;
    App.mostrarToast("Registro salvo automaticamente!");
    capturarLocalizacao();
  }

  function agendarViradaDoDia() {
    if (timerViradaDia) window.clearTimeout(timerViradaDia);
    const agora = getAgora();
    const proximaVirada = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 0, 0, 0, 50);
    timerViradaDia = window.setTimeout(async () => {
      renderCabecalhoHome();
      await carregarRegistroHoje();
      agendarViradaDoDia();
    }, Math.max(1000, proximaVirada.getTime() - agora.getTime()));
  }

  App.on("btnRegistro", "click", App.goToRegistro);
  App.on("btnCamera", "click", abrirCamera);
  App.on("geoRetryBtn", "click", () => capturarLocalizacao());
  App.on("comprovanteCamera", "change", (e) => {
    const file = e.target.files[0];
    if (file) processarArquivo(file);
    e.target.value = "";
  });

  App.initShell({
    onReady: async () => {
      renderCabecalhoHome();
      await carregarRegistroHoje();
      agendarViradaDoDia();
    },
    onAuthChange: async () => {
      renderCabecalhoHome();
      await carregarRegistroHoje();
    },
  });
})();
