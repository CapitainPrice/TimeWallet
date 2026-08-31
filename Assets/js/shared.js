(() => {
  const VIEW = document.body.dataset.view || "";
  const ROOT = document.body.dataset.root || ".";
  const PONTO_MINUTOS = 15 * 60;
  const TOLERANCIA_MINUTOS = 15 * 60 + 10;
  const STORAGE_KEY = "bancoHoras_registros";
  const NOME_KEY = "bancoHoras_nome";
  const PERIOD_CONFIG_KEY = "bancoHoras_periodo";
  const SPLASH_SESSION_KEY = "timewallet_splash_seen";
  const DEFAULT_PERIOD_CONFIG = Object.freeze({ startDay: 26, endDay: 25 });

  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const DIAS_SEMANA_ABR = ["D", "S", "T", "Q", "Q", "S", "S"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {};

  const hoje = new Date();
  const hojeKey = toKey(hoje);
  const GEOCODING_CACHE = new Map();
  const feriadosCache = {};

  let firebaseApp = null;
  let firebaseAuth = null;
  let firebaseDb = null;
  let primaryNavOverride = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function on(id, eventName, handler) {
    const el = byId(id);
    if (el) el.addEventListener(eventName, handler);
    return el;
  }

  function toKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fmtCurta(d) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function formatarDataPrincipal(data = hoje) {
    return `${DIAS_SEMANA[data.getDay()]}, ${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}/${data.getFullYear()}`;
  }

  function getPeriodConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(PERIOD_CONFIG_KEY) || "null");
      const startDay = Number(saved?.startDay);
      const endDay = Number(saved?.endDay);
      if (Number.isInteger(startDay) && Number.isInteger(endDay) && startDay >= 1 && startDay <= 31 && endDay >= 1 && endDay <= 31) {
        return { startDay, endDay };
      }
    } catch {}
    return { ...DEFAULT_PERIOD_CONFIG };
  }

  function setPeriodConfig(startDay, endDay) {
    const config = {
      startDay: Math.min(31, Math.max(1, Number(startDay) || DEFAULT_PERIOD_CONFIG.startDay)),
      endDay: Math.min(31, Math.max(1, Number(endDay) || DEFAULT_PERIOD_CONFIG.endDay)),
    };
    localStorage.setItem(PERIOD_CONFIG_KEY, JSON.stringify(config));
    return config;
  }

  function getPeriodLabel(anchor) {
    const { start, end } = getPeriodBounds(anchor);
    return `${fmtCurta(start)} – ${fmtCurta(end)}/${end.getFullYear()}`;
  }

  function renderDataPrincipal() {
    const el = byId("dataPrincipal");
    if (!el) return;
    if (primaryNavOverride?.label) {
      el.textContent = primaryNavOverride.label;
      return;
    }
    if (VIEW === "home" && ROOT === ".") {
      el.textContent = formatarDataPrincipal();
      return;
    }
    el.textContent = "Voltar ao início";
  }

  function maybeShowSplash() {
    if (VIEW !== "home" || ROOT !== ".") return;
    if (sessionStorage.getItem(SPLASH_SESSION_KEY) === "1") return;
    const splashUrl = resolveViewPath("splash.html");
    const nextUrl = window.location.pathname + window.location.search + window.location.hash;
    sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    window.location.replace(`${splashUrl}?next=${encodeURIComponent(nextUrl)}`);
  }

  function initSplashScreen() {
    if (VIEW !== "splash") return;
    sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || resolveHomePath();
    window.setTimeout(() => {
      window.location.replace(next);
    }, 2000);
  }

  function mostrarToast(msg) {
    const toast = byId("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function calcularPascoa(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, mes - 1, dia);
  }

  function addDias(date, dias) {
    const d = new Date(date);
    d.setDate(d.getDate() + dias);
    return d;
  }

  function feriadosDoAno(year) {
    if (feriadosCache[year]) return feriadosCache[year];
    const pascoa = calcularPascoa(year);
    const set = new Set([
      `${year}-01-01`,
      `${year}-04-21`,
      `${year}-05-01`,
      `${year}-09-07`,
      `${year}-10-12`,
      `${year}-11-02`,
      `${year}-11-15`,
      `${year}-11-20`,
      `${year}-12-25`,
      toKey(addDias(pascoa, -48)),
      toKey(addDias(pascoa, -47)),
      toKey(addDias(pascoa, -2)),
      toKey(addDias(pascoa, 60)),
    ]);
    feriadosCache[year] = set;
    return set;
  }

  function isDiaUtil(date) {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return false;
    return !feriadosDoAno(date.getFullYear()).has(toKey(date));
  }

  async function reverseGeocode(lat, lng) {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (GEOCODING_CACHE.has(key)) return GEOCODING_CACHE.get(key);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
        { headers: { Accept: "application/json" } }
      );
      if (!response.ok) throw new Error("Geocoding failed");
      const data = await response.json();
      let address = "Endereço não encontrado";
      if (data.display_name) {
        const parts = data.display_name.split(",").map((item) => item.trim());
        address = parts.slice(0, 3).filter((item) => item.length > 1).join(", ");
      }
      GEOCODING_CACHE.set(key, address);
      return address;
    } catch (error) {
      console.warn("Reverse geocoding error:", error);
      return `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
    }
  }

  function calcularExtra(saidaStr) {
    const [h, m] = saidaStr.split(":").map(Number);
    const saidaMin = h * 60 + m;
    if (saidaMin < PONTO_MINUTOS) return saidaMin - PONTO_MINUTOS;
    if (saidaMin <= TOLERANCIA_MINUTOS) return 0;
    return saidaMin - TOLERANCIA_MINUTOS;
  }

  function formatarExtra(min) {
    const sinal = min < 0 ? "-" : "";
    const abs = Math.abs(min);
    if (abs < 60) return `${sinal}${abs}min`;
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${sinal}${h}h${String(m).padStart(2, "0")}min`;
  }

  function clampPeriodDay(year, month, day) {
    return Math.min(day, new Date(year, month + 1, 0).getDate());
  }

  function getPeriodBounds(anchor) {
    const { startDay, endDay } = getPeriodConfig();
    const startYear = anchor.getFullYear();
    const startMonth = anchor.getMonth();
    const endYear = startMonth === 11 ? startYear + 1 : startYear;
    const endMonth = (startMonth + 1) % 12;
    const start = new Date(startYear, startMonth, clampPeriodDay(startYear, startMonth, startDay));
    const end = new Date(endYear, endMonth, clampPeriodDay(endYear, endMonth, endDay));
    return { start, end };
  }

  function getCurrentPaymentAnchor(baseDate = hoje) {
    const { endDay } = getPeriodConfig();
    return baseDate.getDate() <= endDay
      ? new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1)
      : new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  }

  function shiftPaymentAnchor(anchor, monthsDelta) {
    return new Date(anchor.getFullYear(), anchor.getMonth() + monthsDelta, 1);
  }

  function getPeriodDayOptions() {
    return Array.from({ length: 31 }, (_, index) => index + 1);
  }

  function getPeriodoNome(anchor = getCurrentPaymentAnchor()) {
    const { start } = getPeriodBounds(anchor);
    return `periodo ${String(start.getMonth() + 1).padStart(2, "0")}`;
  }

  function getComprovanteNomePadrao(anchor = getCurrentPaymentAnchor(), ext = "jpg") {
    const extensao = String(ext || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    return `comprovante ${getPeriodoNome(anchor)}.${extensao}`;
  }

  function normalizarNomeComprovante(nomeOriginal, anchor = getCurrentPaymentAnchor()) {
    const match = String(nomeOriginal || "").match(/\.([a-zA-Z0-9]+)$/);
    const ext = match?.[1] || "jpg";
    return getComprovanteNomePadrao(anchor, ext);
  }

  function getComprovanteTitulo(nome, anchor = getCurrentPaymentAnchor()) {
    return nome || getComprovanteNomePadrao(anchor);
  }

  function getComprovanteResumo(nome, anchor = getCurrentPaymentAnchor()) {
    return getComprovanteTitulo(nome, anchor).replace(/\.[^.]+$/, "");
  }

  function getComprovantePeriodoAtual(dateKey) {
    if (!dateKey) return getCurrentPaymentAnchor();
    const [year, month, day] = dateKey.split("-").map(Number);
    return getCurrentPaymentAnchor(new Date(year, (month || 1) - 1, day || 1));
  }

  function getComprovanteNomePorData(dateKey, nomeOriginal) {
    return normalizarNomeComprovante(nomeOriginal, getComprovantePeriodoAtual(dateKey));
  }

  function getComprovanteResumoPorData(dateKey, nome) {
    return getComprovanteResumo(nome, getComprovantePeriodoAtual(dateKey));
  }

  function getComprovanteTituloPorData(dateKey, nome) {
    return getComprovanteTitulo(nome, getComprovantePeriodoAtual(dateKey));
  }

  function getPeriodoLabelPorData(dateKey) {
    return getPeriodoNome(getComprovantePeriodoAtual(dateKey));
  }

  function getPeriodoNomeData(date) {
    return getPeriodoNome(getCurrentPaymentAnchor(date));
  }

  function getComprovanteNomePorDataObj(date, nomeOriginal) {
    return normalizarNomeComprovante(nomeOriginal, getCurrentPaymentAnchor(date));
  }

  function getComprovanteResumoPorDataObj(date, nome) {
    return getComprovanteResumo(nome, getCurrentPaymentAnchor(date));
  }

  function getComprovanteTituloPorDataObj(date, nome) {
    return getComprovanteTitulo(nome, getCurrentPaymentAnchor(date));
  }

  function getPeriodoLabelPorDataObj(date) {
    return getPeriodoNome(getCurrentPaymentAnchor(date));
  }

  function getPeriodoAnchorForDate(date) {
    return getCurrentPaymentAnchor(date);
  }

  function getComprovanteNome(dateOrKey, nomeOriginal) {
    if (dateOrKey instanceof Date) return getComprovanteNomePorDataObj(dateOrKey, nomeOriginal);
    return getComprovanteNomePorData(dateOrKey, nomeOriginal);
  }

  function getComprovanteResumoLabel(dateOrKey, nome) {
    if (dateOrKey instanceof Date) return getComprovanteResumoPorDataObj(dateOrKey, nome);
    return getComprovanteResumoPorData(dateOrKey, nome);
  }

  function getComprovanteTituloLabel(dateOrKey, nome) {
    if (dateOrKey instanceof Date) return getComprovanteTituloPorDataObj(dateOrKey, nome);
    return getComprovanteTituloPorData(dateOrKey, nome);
  }

  function getPeriodoNomeLabel(dateOrKey) {
    if (dateOrKey instanceof Date) return getPeriodoLabelPorDataObj(dateOrKey);
    return getPeriodoLabelPorData(dateOrKey);
  }

  function getPeriodoAnchorValue(dateOrKey) {
    if (dateOrKey instanceof Date) return getPeriodoAnchorForDate(dateOrKey);
    return getComprovantePeriodoAtual(dateOrKey);
  }

  function getComprovanteNomePadraoPorData(dateOrKey, ext = "jpg") {
    return getComprovanteNome(dateOrKey, `arquivo.${ext}`);
  }

  function getComprovanteResumoPadraoPorData(dateOrKey) {
    return getComprovanteResumoLabel(dateOrKey);
  }

  function getComprovanteTituloPadraoPorData(dateOrKey) {
    return getComprovanteTituloLabel(dateOrKey);
  }

  function getPeriodoNomePadraoPorData(dateOrKey) {
    return getPeriodoNomeLabel(dateOrKey);
  }

  function getPeriodoAnchorPadraoPorData(dateOrKey) {
    return getPeriodoAnchorValue(dateOrKey);
  }

  function getComprovanteFileName(dateOrKey, nomeOriginal) {
    return getComprovanteNome(dateOrKey, nomeOriginal);
  }

  function getComprovanteDisplayName(dateOrKey, nome) {
    return getComprovanteTituloLabel(dateOrKey, nome);
  }

  function getComprovanteDisplayShortName(dateOrKey, nome) {
    return getComprovanteResumoLabel(dateOrKey, nome);
  }

  function getPeriodoDisplayName(dateOrKey) {
    return getPeriodoNomeLabel(dateOrKey);
  }

  function getPeriodoAnchorFor(dateOrKey) {
    return getPeriodoAnchorValue(dateOrKey);
  }

  function getPeriodoComprovanteNome(dateOrKey, nomeOriginal) {
    return getComprovanteFileName(dateOrKey, nomeOriginal);
  }

  function getPeriodoComprovanteTitulo(dateOrKey, nome) {
    return getComprovanteDisplayName(dateOrKey, nome);
  }

  function getPeriodoComprovanteResumo(dateOrKey, nome) {
    return getComprovanteDisplayShortName(dateOrKey, nome);
  }

  function getPeriodoComprovanteLabel(dateOrKey) {
    return getPeriodoDisplayName(dateOrKey);
  }

  function getPeriodoComprovanteAnchor(dateOrKey) {
    return getPeriodoAnchorFor(dateOrKey);
  }

  function getComprovantePadrao(dateOrKey, nomeOriginal) {
    return getPeriodoComprovanteNome(dateOrKey, nomeOriginal);
  }

  function getComprovantePadraoTitulo(dateOrKey, nome) {
    return getPeriodoComprovanteTitulo(dateOrKey, nome);
  }

  function getComprovantePadraoResumo(dateOrKey, nome) {
    return getPeriodoComprovanteResumo(dateOrKey, nome);
  }

  function getPeriodoPadrao(dateOrKey) {
    return getPeriodoComprovanteLabel(dateOrKey);
  }

  function getPeriodoPadraoAnchor(dateOrKey) {
    return getPeriodoComprovanteAnchor(dateOrKey);
  }

  function getComprovanteNomeFinal(dateOrKey, nomeOriginal) {
    return getComprovantePadrao(dateOrKey, nomeOriginal);
  }

  function getComprovanteTituloFinal(dateOrKey, nome) {
    return getComprovantePadraoTitulo(dateOrKey, nome);
  }

  function getComprovanteResumoFinal(dateOrKey, nome) {
    return getComprovantePadraoResumo(dateOrKey, nome);
  }

  function getPeriodoFinal(dateOrKey) {
    return getPeriodoPadrao(dateOrKey);
  }

  function getPeriodoFinalAnchor(dateOrKey) {
    return getPeriodoPadraoAnchor(dateOrKey);
  }

  function buildComprovanteNome(dateOrKey, nomeOriginal) {
    return getComprovanteNomeFinal(dateOrKey, nomeOriginal);
  }

  function buildComprovanteTitulo(dateOrKey, nome) {
    return getComprovanteTituloFinal(dateOrKey, nome);
  }

  function buildComprovanteResumo(dateOrKey, nome) {
    return getComprovanteResumoFinal(dateOrKey, nome);
  }

  function buildPeriodoNome(dateOrKey) {
    return getPeriodoFinal(dateOrKey);
  }

  function buildPeriodoAnchor(dateOrKey) {
    return getPeriodoFinalAnchor(dateOrKey);
  }

  function padronizarNomeComprovante(dateOrKey, nomeOriginal) {
    return buildComprovanteNome(dateOrKey, nomeOriginal);
  }

  function resumirNomeComprovante(dateOrKey, nome) {
    return buildComprovanteResumo(dateOrKey, nome);
  }

  function titularNomeComprovante(dateOrKey, nome) {
    return buildComprovanteTitulo(dateOrKey, nome);
  }

  function nomePeriodoComprovante(dateOrKey) {
    return buildPeriodoNome(dateOrKey);
  }

  function anchorPeriodoComprovante(dateOrKey) {
    return buildPeriodoAnchor(dateOrKey);
  }

  function getComprovanteMetadata(dateOrKey, nomeOriginal) {
    return {
      nome: padronizarNomeComprovante(dateOrKey, nomeOriginal),
      titulo: titularNomeComprovante(dateOrKey, nomeOriginal),
      resumo: resumirNomeComprovante(dateOrKey, nomeOriginal),
      periodo: nomePeriodoComprovante(dateOrKey),
      anchor: anchorPeriodoComprovante(dateOrKey),
    };
  }

  function getComprovanteNomeInfo(dateOrKey, nomeOriginal) {
    return getComprovanteMetadata(dateOrKey, nomeOriginal).nome;
  }

  function getComprovanteTituloInfo(dateOrKey, nomeOriginal) {
    return getComprovanteMetadata(dateOrKey, nomeOriginal).titulo;
  }

  function getComprovanteResumoInfo(dateOrKey, nomeOriginal) {
    return getComprovanteMetadata(dateOrKey, nomeOriginal).resumo;
  }

  function getPeriodoInfo(dateOrKey) {
    return getComprovanteMetadata(dateOrKey).periodo;
  }

  function getPeriodoAnchorInfo(dateOrKey) {
    return getComprovanteMetadata(dateOrKey).anchor;
  }

  function getComprovanteData(dateOrKey, nomeOriginal) {
    return getComprovanteMetadata(dateOrKey, nomeOriginal);
  }

  function getComprovanteNomePadronizado(dateOrKey, nomeOriginal) {
    return getComprovanteData(dateOrKey, nomeOriginal).nome;
  }

  function getComprovanteResumoPadronizado(dateOrKey, nomeOriginal) {
    return getComprovanteData(dateOrKey, nomeOriginal).resumo;
  }

  function getComprovanteTituloPadronizado(dateOrKey, nomeOriginal) {
    return getComprovanteData(dateOrKey, nomeOriginal).titulo;
  }

  function getPeriodoPadronizado(dateOrKey) {
    return getComprovanteData(dateOrKey).periodo;
  }

  function getPeriodoAnchorPadronizado(dateOrKey) {
    return getComprovanteData(dateOrKey).anchor;
  }

  function getComprovanteMeta(dateOrKey, nomeOriginal) {
    return getComprovanteData(dateOrKey, nomeOriginal);
  }

  function getComprovantePadraoNome(dateOrKey, nomeOriginal) {
    return getPeriodoComprovanteNome(dateOrKey, nomeOriginal);
  }

  function getComprovantePadraoResumo(dateOrKey, nomeOriginal) {
    return getPeriodoComprovanteResumo(dateOrKey, nomeOriginal);
  }

  function getComprovantePadraoTitulo(dateOrKey, nomeOriginal) {
    return getPeriodoComprovanteTitulo(dateOrKey, nomeOriginal);
  }

  function getPeriodoPadraoNome(dateOrKey) {
    return getPeriodoComprovanteLabel(dateOrKey);
  }

  function getPeriodoPadraoData(dateOrKey) {
    return getPeriodoComprovanteAnchor(dateOrKey);
  }

  function getComprovanteNomeUtil(dateOrKey, nomeOriginal) {
    return getComprovantePadraoNome(dateOrKey, nomeOriginal);
  }

  function getComprovanteResumoUtil(dateOrKey, nomeOriginal) {
    return getComprovantePadraoResumo(dateOrKey, nomeOriginal);
  }

  function getComprovanteTituloUtil(dateOrKey, nomeOriginal) {
    return getComprovantePadraoTitulo(dateOrKey, nomeOriginal);
  }

  function getPeriodoUtil(dateOrKey) {
    return getPeriodoPadraoNome(dateOrKey);
  }

  function getPeriodoDataUtil(dateOrKey) {
    return getPeriodoPadraoData(dateOrKey);
  }

  function getComprovanteNomeFinalizado(dateOrKey, nomeOriginal) {
    return getComprovanteNomeUtil(dateOrKey, nomeOriginal);
  }

  function getComprovanteResumoFinalizado(dateOrKey, nomeOriginal) {
    return getComprovanteResumoUtil(dateOrKey, nomeOriginal);
  }

  function getComprovanteTituloFinalizado(dateOrKey, nomeOriginal) {
    return getComprovanteTituloUtil(dateOrKey, nomeOriginal);
  }

  function getPeriodoFinalizado(dateOrKey) {
    return getPeriodoUtil(dateOrKey);
  }

  function getPeriodoDataFinalizado(dateOrKey) {
    return getPeriodoDataUtil(dateOrKey);
  }

  function getComprovanteNomeView(dateOrKey, nomeOriginal) {
    return getComprovanteNomeFinalizado(dateOrKey, nomeOriginal);
  }

  function getComprovanteResumoView(dateOrKey, nomeOriginal) {
    return getComprovanteResumoFinalizado(dateOrKey, nomeOriginal);
  }

  function getComprovanteTituloView(dateOrKey, nomeOriginal) {
    return getComprovanteTituloFinalizado(dateOrKey, nomeOriginal);
  }

  function getPeriodoView(dateOrKey) {
    return getPeriodoFinalizado(dateOrKey);
  }

  function getPeriodoDataView(dateOrKey) {
    return getPeriodoDataFinalizado(dateOrKey);
  }

  function getComprovanteNomeUI(dateOrKey, nomeOriginal) {
    return getComprovanteNomeView(dateOrKey, nomeOriginal);
  }

  function getComprovanteResumoUI(dateOrKey, nomeOriginal) {
    return getComprovanteResumoView(dateOrKey, nomeOriginal);
  }

  function getComprovanteTituloUI(dateOrKey, nomeOriginal) {
    return getComprovanteTituloView(dateOrKey, nomeOriginal);
  }

  function getPeriodoUI(dateOrKey) {
    return getPeriodoView(dateOrKey);
  }

  function getPeriodoDataUI(dateOrKey) {
    return getPeriodoDataView(dateOrKey);
  }

  function getComprovanteNomeFinalUI(dateOrKey, nomeOriginal) {
    return getComprovanteNomeUI(dateOrKey, nomeOriginal);
  }

  function getComprovanteResumoFinalUI(dateOrKey, nomeOriginal) {
    return getComprovanteResumoUI(dateOrKey, nomeOriginal);
  }

  function getComprovanteTituloFinalUI(dateOrKey, nomeOriginal) {
    return getComprovanteTituloUI(dateOrKey, nomeOriginal);
  }

  function getPeriodoFinalUI(dateOrKey) {
    return getPeriodoUI(dateOrKey);
  }

  function getPeriodoDataFinalUI(dateOrKey) {
    return getPeriodoDataUI(dateOrKey);
  }

  function getComprovantePadraoUI(dateOrKey, nomeOriginal) {
    return getComprovanteNomeFinalUI(dateOrKey, nomeOriginal);
  }

  function getComprovantePadraoResumoUI(dateOrKey, nomeOriginal) {
    return getComprovanteResumoFinalUI(dateOrKey, nomeOriginal);
  }

  function getComprovantePadraoTituloUI(dateOrKey, nomeOriginal) {
    return getComprovanteTituloFinalUI(dateOrKey, nomeOriginal);
  }

  function getPeriodoPadraoUI(dateOrKey) {
    return getPeriodoFinalUI(dateOrKey);
  }

  function getPeriodoDataPadraoUI(dateOrKey) {
    return getPeriodoDataFinalUI(dateOrKey);
  }

  function getComprovanteNomeAtual(dateOrKey, nomeOriginal) {
    return getComprovantePadraoUI(dateOrKey, nomeOriginal);
  }

  function getComprovanteResumoAtual(dateOrKey, nomeOriginal) {
    return getComprovantePadraoResumoUI(dateOrKey, nomeOriginal);
  }

  function getComprovanteTituloAtual(dateOrKey, nomeOriginal) {
    return getComprovantePadraoTituloUI(dateOrKey, nomeOriginal);
  }

  function getPeriodoAtualNome(dateOrKey) {
    return getPeriodoPadraoUI(dateOrKey);
  }

  function getPeriodoAtualData(dateOrKey) {
    return getPeriodoDataPadraoUI(dateOrKey);
  }

  function buildComprovantePadrao(dateOrKey, nomeOriginal) {
    return {
      nome: getComprovanteNomeAtual(dateOrKey, nomeOriginal),
      resumo: getComprovanteResumoAtual(dateOrKey, nomeOriginal),
      titulo: getComprovanteTituloAtual(dateOrKey, nomeOriginal),
      periodo: getPeriodoAtualNome(dateOrKey),
      anchor: getPeriodoAtualData(dateOrKey),
    };
  }

  function getComprovantePadraoInfo(dateOrKey, nomeOriginal) {
    return buildComprovantePadrao(dateOrKey, nomeOriginal);
  }

  function getComprovanteNomeSafe(dateOrKey, nomeOriginal) {
    return getComprovantePadraoInfo(dateOrKey, nomeOriginal).nome;
  }

  function getComprovanteResumoSafe(dateOrKey, nomeOriginal) {
    return getComprovantePadraoInfo(dateOrKey, nomeOriginal).resumo;
  }

  function getComprovanteTituloSafe(dateOrKey, nomeOriginal) {
    return getComprovantePadraoInfo(dateOrKey, nomeOriginal).titulo;
  }

  function getPeriodoSafe(dateOrKey) {
    return getComprovantePadraoInfo(dateOrKey).periodo;
  }

  function getPeriodoAnchorSafe(dateOrKey) {
    return getComprovantePadraoInfo(dateOrKey).anchor;
  }

  function getComprovanteNomeDisplay(dateOrKey, nomeOriginal) {
    return getComprovanteNomeSafe(dateOrKey, nomeOriginal);
  }

  function getComprovanteResumoDisplay(dateOrKey, nomeOriginal) {
    return getComprovanteResumoSafe(dateOrKey, nomeOriginal);
  }

  function getComprovanteTituloDisplay(dateOrKey, nomeOriginal) {
    return getComprovanteTituloSafe(dateOrKey, nomeOriginal);
  }

  function getPeriodoDisplay(dateOrKey) {
    return getPeriodoSafe(dateOrKey);
  }

  function getPeriodoAnchorDisplay(dateOrKey) {
    return getPeriodoAnchorSafe(dateOrKey);
  }

  function getComprovanteInfo(dateOrKey, nomeOriginal) {
    return {
      nome: getComprovanteNomeDisplay(dateOrKey, nomeOriginal),
      resumo: getComprovanteResumoDisplay(dateOrKey, nomeOriginal),
      titulo: getComprovanteTituloDisplay(dateOrKey, nomeOriginal),
      periodo: getPeriodoDisplay(dateOrKey),
      anchor: getPeriodoAnchorDisplay(dateOrKey),
    };
  }

  function resolveComprovanteInfo(dateOrKey, nomeOriginal) {
    return getComprovanteInfo(dateOrKey, nomeOriginal);
  }

  function formatComprovanteNome(dateOrKey, nomeOriginal) {
    return resolveComprovanteInfo(dateOrKey, nomeOriginal).nome;
  }

  function formatComprovanteResumo(dateOrKey, nomeOriginal) {
    return resolveComprovanteInfo(dateOrKey, nomeOriginal).resumo;
  }

  function formatComprovanteTitulo(dateOrKey, nomeOriginal) {
    return resolveComprovanteInfo(dateOrKey, nomeOriginal).titulo;
  }

  function formatPeriodoComprovante(dateOrKey) {
    return resolveComprovanteInfo(dateOrKey).periodo;
  }

  function resolvePeriodoComprovante(dateOrKey) {
    return resolveComprovanteInfo(dateOrKey).anchor;
  }

  function buildComprovanteInfo(dateOrKey, nomeOriginal) {
    return resolveComprovanteInfo(dateOrKey, nomeOriginal);
  }

  function getComprovanteInfoResolved(dateOrKey, nomeOriginal) {
    return buildComprovanteInfo(dateOrKey, nomeOriginal);
  }

  function obterNomeUsuario() {
    let nome = localStorage.getItem(NOME_KEY);
    if (nome === null) {
      nome = (prompt("Como podemos te chamar?") || "").trim();
      localStorage.setItem(NOME_KEY, nome);
    }
    return nome;
  }

  function getLocationDisplay(loc) {
    if (!loc) return "Não registrada";
    if (typeof loc === "string") return loc;
    if (loc.address) return loc.address;
    if (loc.endereco) return loc.endereco;
    if (typeof loc.lat === "number" && typeof loc.lng === "number") {
      return `Lat: ${loc.lat.toFixed(5)}, Lng: ${loc.lng.toFixed(5)}`;
    }
    return "Não registrada";
  }

  function getLocationMapLink(loc) {
    if (!loc) return '<span style="color:var(--muted);font-size:11px;">Não registrada</span>';
    const label = getLocationDisplay(loc);
    if (typeof loc === "object" && typeof loc.lat === "number" && typeof loc.lng === "number") {
      return `<a href="https://www.google.com/maps?q=${loc.lat},${loc.lng}" target="_blank" rel="noopener" style="color:var(--primary-dark);font-size:11px;">${label}</a>`;
    }
    return `<span style="color:var(--muted);font-size:11px;">${label}</span>`;
  }

  function defaultUserPhoto() {
    return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#4A701C"/></svg>')}`;
  }

  function abrirImagem(base64) {
    const modal = byId("imgModal");
    const img = byId("imgModalPic");
    if (!modal || !img) return;
    img.src = base64;
    modal.classList.add("show");
  }

  function fecharImagem() {
    byId("imgModal")?.classList.remove("show");
  }

  function initImageModal() {
    on("closeImgModal", "click", fecharImagem);
    on("imgModal", "click", (e) => {
      if (e.target.id === "imgModal") fecharImagem();
    });
  }

  function resolveHomePath() {
    return ROOT === "." ? "index.html" : "../index.html";
  }

  function resolveViewPath(fileName) {
    if (ROOT === ".") {
      return `views/${fileName}`;
    }
    return fileName;
  }

  function goToHome() {
    window.location.href = resolveHomePath();
  }

  function goToCalendario() {
    window.location.href = resolveViewPath("calendario.html");
  }

  function goToRegistro() {
    window.location.href = resolveViewPath("banco-horas.html");
  }

  initSplashScreen();

  function setPrimaryNavigationOverride(config) {
    primaryNavOverride = config || null;
    const btn = byId("primaryNavBtn");
    if (btn) btn.setAttribute("aria-label", primaryNavOverride?.ariaLabel || (VIEW === "home" ? "Abrir calendário" : "Ir para tela inicial"));
    renderDataPrincipal();
  }

  function initPrimaryNavigation() {
    on("primaryNavBtn", "click", () => {
      if (primaryNavOverride?.onClick) {
        primaryNavOverride.onClick();
        return;
      }
      if (VIEW === "home") {
        goToCalendario();
        return;
      }
      goToHome();
    });
  }

  function updateUserMenu(user) {
    const btnUsuario = byId("btnUsuario");
    const dropdownHeader = byId("dropdownHeader");
    const dropdownSignIn = byId("dropdownSignIn");
    const dropdownSignOut = byId("dropdownSignOut");
    const userDropdown = byId("userDropdown");
    if (!btnUsuario || !dropdownHeader || !dropdownSignIn || !dropdownSignOut || !userDropdown) return;

    if (user) {
      const photo = user.photoURL || defaultUserPhoto();
      btnUsuario.innerHTML = `<img src="${photo}" alt="${user.displayName || "Usuário"}">`;
      btnUsuario.title = user.displayName || user.email || "Usuário logado";
      dropdownHeader.innerHTML = `
        <img src="${photo}" alt="">
        <div class="user-info">
          <div class="user-name">${user.displayName || "Usuário"}</div>
          <div class="user-email">${user.email || ""}</div>
          <div class="user-status">Conta Google conectada</div>
        </div>
      `;
      dropdownSignIn.hidden = true;
      dropdownSignOut.hidden = false;
      dropdownSignOut.onclick = async () => {
        await Store.signOut();
        userDropdown.hidden = true;
        btnUsuario.setAttribute("aria-expanded", "false");
      };
      return;
    }

    btnUsuario.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    `;
    btnUsuario.title = "Entrar com Google";
    dropdownHeader.innerHTML = `
      <div class="user-guest-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      </div>
      <div class="user-info">
        <div class="user-name">Não conectado</div>
        <div class="user-email">Entre para sincronizar seus registros</div>
      </div>
    `;
    dropdownSignIn.hidden = false;
    dropdownSignOut.hidden = true;
    dropdownSignIn.onclick = async () => {
      try {
        await Store.signInWithGoogle();
      } catch (error) {
        console.error("Erro no login:", error);
        mostrarToast("Erro ao entrar. Tente novamente.");
      }
      userDropdown.hidden = true;
      btnUsuario.setAttribute("aria-expanded", "false");
    };
  }

  function initUserMenu() {
    const btnUsuario = byId("btnUsuario");
    const userDropdown = byId("userDropdown");
    const userMenu = byId("userMenu");
    if (!btnUsuario || !userDropdown || !userMenu) return;

    btnUsuario.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = userDropdown.hidden;
      userDropdown.hidden = !willOpen;
      btnUsuario.setAttribute("aria-expanded", String(willOpen));
    });

    userMenu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      userDropdown.hidden = true;
      btnUsuario.setAttribute("aria-expanded", "false");
    });
  }

  function initFirebase() {
    if (firebaseApp) return Promise.resolve();
    try {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
      firebaseAuth = firebaseApp.auth();
      firebaseDb = firebaseApp.firestore();
      firebaseDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    } catch (error) {
      console.warn("Firebase init failed:", error);
    }
    return Promise.resolve();
  }

  const Store = {
    _user: null,
    _authReady: false,
    _migrated: false,
    _authListeners: [],

    async init() {
      await initFirebase();
      if (!firebaseAuth) {
        this._authReady = true;
        this._notifyAuthChange(null);
        return;
      }

      firebaseAuth.onAuthStateChanged(async (user) => {
        this._user = user;
        this._authReady = true;
        if (user && !this._migrated) {
          await this._migrateLocalToFirestore();
          this._migrated = true;
        }
        this._notifyAuthChange(user);
      });
    },

    _notifyAuthChange(user) {
      this._authListeners.forEach((callback) => callback(user));
    },

    onAuthStateChanged(callback) {
      this._authListeners.push(callback);
      if (this._authReady) callback(this._user);
    },

    getCurrentUser() {
      return this._user;
    },

    _getCollection() {
      if (!this._user || !firebaseDb) return null;
      return firebaseDb.collection("users").doc(this._user.uid).collection("registros");
    },

    async signInWithGoogle() {
      if (!firebaseAuth) throw new Error("Firebase não inicializado");
      const provider = new firebase.auth.GoogleAuthProvider();
      return firebaseAuth.signInWithPopup(provider);
    },

    async signOut() {
      if (!firebaseAuth) return;
      return firebaseAuth.signOut();
    },

    getAllSync() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      } catch {
        return {};
      }
    },

    async getAll() {
      while (!this._authReady) await new Promise((resolve) => setTimeout(resolve, 50));
      const col = this._getCollection();
      if (!col) return this.getAllSync();

      const snapshot = await col.get();
      const data = {};
      snapshot.forEach((doc) => {
        data[doc.id] = doc.data();
      });
      return data;
    },

    async get(dateKey) {
      const all = await this.getAll();
      return all[dateKey] || null;
    },

    async set(dateKey, data) {
      while (!this._authReady) await new Promise((resolve) => setTimeout(resolve, 50));
      const col = this._getCollection();
      if (col) {
        await col.doc(dateKey).set(data);
        return;
      }
      const all = this.getAllSync();
      all[dateKey] = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    },

    async _migrateLocalToFirestore() {
      const localData = this.getAllSync();
      const keys = Object.keys(localData);
      if (keys.length === 0) return;
      const col = this._getCollection();
      if (!col) return;

      const batch = firebaseDb.batch();
      keys.forEach((key) => batch.set(col.doc(key), localData[key]));
      await batch.commit();
      localStorage.removeItem(STORAGE_KEY);
    },
  };

  async function initShell({ onReady, onAuthChange } = {}) {
    maybeShowSplash();
    renderDataPrincipal();
    initPrimaryNavigation();
    initUserMenu();
    initImageModal();

    await Store.init();

    let firstAuthEvent = true;
    Store.onAuthStateChanged(async (user) => {
      updateUserMenu(user);
      if (firstAuthEvent) {
        firstAuthEvent = false;
        return;
      }
      if (onAuthChange) await onAuthChange(user);
    });

    if (onReady) await onReady(Store.getCurrentUser());
  }

  window.TimeWallet = {
    VIEW,
    ROOT,
    PONTO_MINUTOS,
    TOLERANCIA_MINUTOS,
    STORAGE_KEY,
    NOME_KEY,
    DIAS_SEMANA,
    DIAS_SEMANA_ABR,
    MESES,
    hoje,
    hojeKey,
    Store,
    byId,
    on,
    toKey,
    fmtCurta,
    formatarDataPrincipal,
    renderDataPrincipal,
    mostrarToast,
    calcularExtra,
    formatarExtra,
    getPeriodBounds,
    getCurrentPaymentAnchor,
    obterNomeUsuario,
    isDiaUtil,
    reverseGeocode,
    getLocationDisplay,
    getLocationMapLink,
    setPrimaryNavigationOverride,
    getPeriodConfig,
    setPeriodConfig,
    getPeriodDayOptions,
    getPeriodLabel,
    shiftPaymentAnchor,
    abrirImagem,
    fecharImagem,
    getComprovanteInfo: resolveComprovanteInfo,
    formatComprovanteNome,
    formatComprovanteResumo,
    formatComprovanteTitulo,
    formatPeriodoComprovante,
    goToHome,
    goToCalendario,
    goToRegistro,
    initShell,
  };
})();
