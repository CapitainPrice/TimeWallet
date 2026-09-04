(() => {
  const VIEW = document.body.dataset.view || "";
  const ROOT = document.body.dataset.root || ".";
  const PONTO_MINUTOS = 15 * 60;
  const TOLERANCIA_MINUTOS = 15 * 60 + 10;
  const STORAGE_KEY = "bancoHoras_registros";
  const BAIXAS_STORAGE_KEY = "bancoHoras_baixas";
  const NOME_KEY = "bancoHoras_nome";
  const PERIOD_CONFIG_KEY = "bancoHoras_periodo";
  const SPLASH_SESSION_KEY = "timewallet_splash_seen";
  const DEFAULT_PERIOD_CONFIG = Object.freeze({ startDay: 26, endDay: 25 });
  const COMPROVANTE_PERIODO_MESES = 6;
  const COMPROVANTE_CICLO_KEY_PREFIX = "bancoHoras_comprovantes_primeiro_login";
  const LIMPEZA_ANO_KEY_PREFIX = "bancoHoras_limpeza_ano";

  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const DIAS_SEMANA_ABR = ["D", "S", "T", "Q", "Q", "S", "S"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {};

  const hoje = new Date();
  const hojeKey = toKey(hoje);
  const GEOCODING_CACHE = new Map();
  const LOGO_CACHE = new Map();
  const feriadosCache = {};

  let firebaseApp = null;
  let firebaseAuth = null;
  let firebaseDb = null;
  let primaryNavOverride = null;
  let camStream = null;
  let camFotoCapturada = null;
  let camResolver = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function on(id, eventName, handler) {
    const el = byId(id);
    if (el) el.addEventListener(eventName, handler);
    return el;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
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

  function getSemestralLabel(start, end) {
    return `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}/${start.getFullYear()} – ${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}/${end.getFullYear()}`;
  }

  function getPeriodosDoAno(ano) {
    const periodos = [];
    for (let mes = 0; mes < 12; mes += 1) {
      const anchor = new Date(ano, mes, 1);
      const bounds = getPeriodBounds(anchor);
      periodos.push({
        value: toKey(anchor),
        anchor,
        start: bounds.start,
        end: bounds.end,
        label: getSemestralLabel(bounds.start, bounds.end),
      });
    }
    return periodos;
  }

  function periodoTemRegistro(periodo, registros) {
    for (let d = new Date(periodo.start); d <= periodo.end; d.setDate(d.getDate() + 1)) {
      if (registros[toKey(d)]) return true;
    }
    return false;
  }

  function getPeriodosComRegistro(ano, registros) {
    const todos = getPeriodosDoAno(ano);
    const periodoAtualKey = toKey(getCurrentPaymentAnchor(new Date()));
    return todos.filter((periodo) => periodo.value === periodoAtualKey || periodoTemRegistro(periodo, registros));
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

  function mostrarToast(msg, tipo = "success") {
    const toast = byId("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.dataset.type = ["success", "error", "warning"].includes(tipo) ? tipo : "success";
    toast.classList.add("show");
    clearTimeout(mostrarToast.timer);
    mostrarToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
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

  function formatarSaldoTexto(extraMin) {
    const texto = formatarExtra(extraMin);
    return extraMin > 0 ? `+${texto}` : texto;
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
    const { start, end } = getPeriodBounds(anchor);
    const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    return `${fmt(start)} – ${fmt(end)}`;
  }

  function resolveComprovanteData(dateOrKey) {
    if (dateOrKey instanceof Date) return dateOrKey;
    if (!dateOrKey) return new Date();
    const [year, month, day] = dateOrKey.split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  }

  function formatarDataArquivo(date) {
    return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
  }

  function sanitizarNomeArquivo(texto) {
    return String(texto || "").trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
  }

  function getPeriodoOrdemDia(dateOrKey) {
    const data = resolveComprovanteData(dateOrKey);
    const anchor = resolveComprovanteAnchor(data);
    const { start } = getPeriodBounds(anchor);
    const dias = Math.round((data - start) / 86400000) + 1;
    return String(Math.max(1, dias)).padStart(2, "0");
  }

  function getComprovanteNomePadrao(dateOrKey, ext = "jpg") {
    const extensao = String(ext || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const data = resolveComprovanteData(dateOrKey);
    const ordem = getPeriodoOrdemDia(data);
    const dataArquivo = formatarDataArquivo(data);
    const usuario = sanitizarNomeArquivo(obterNomeUsuario()) || "usuario";
    return `comprovante_${ordem}_${dataArquivo}_${usuario}.${extensao}`;
  }

  function normalizarNomeComprovante(dateOrKey, nomeOriginal) {
    const match = String(nomeOriginal || "").match(/\.([a-zA-Z0-9]+)$/);
    const ext = match?.[1] || "jpg";
    return getComprovanteNomePadrao(dateOrKey, ext);
  }

  function getComprovantePeriodoAtual(dateKey) {
    if (!dateKey) return getCurrentPaymentAnchor();
    const [year, month, day] = dateKey.split("-").map(Number);
    return getCurrentPaymentAnchor(new Date(year, (month || 1) - 1, day || 1));
  }

  function resolveComprovanteAnchor(dateOrKey) {
    return dateOrKey instanceof Date ? getCurrentPaymentAnchor(dateOrKey) : getComprovantePeriodoAtual(dateOrKey);
  }

  function getComprovanteInfo(dateOrKey, nomeOriginal) {
    const anchor = resolveComprovanteAnchor(dateOrKey);
    const titulo = nomeOriginal || getComprovanteNomePadrao(dateOrKey);
    return {
      nome: normalizarNomeComprovante(dateOrKey, nomeOriginal),
      titulo,
      resumo: titulo.replace(/\.[^.]+$/, ""),
      periodo: getPeriodoNome(anchor),
      anchor,
    };
  }

  function formatComprovanteNome(dateOrKey, nomeOriginal) {
    return getComprovanteInfo(dateOrKey, nomeOriginal).nome;
  }

  function formatComprovanteResumo(dateOrKey, nomeOriginal) {
    return getComprovanteInfo(dateOrKey, nomeOriginal).resumo;
  }

  function formatComprovanteTitulo(dateOrKey, nomeOriginal) {
    return getComprovanteInfo(dateOrKey, nomeOriginal).titulo;
  }

  function formatPeriodoComprovante(dateOrKey) {
    return getComprovanteInfo(dateOrKey).periodo;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  function getComprovanteCicloKey() {
    const uid = Store.getCurrentUser()?.uid || "guest";
    return `${COMPROVANTE_CICLO_KEY_PREFIX}_${uid}`;
  }

  function getComprovanteCicloBase() {
    const key = getComprovanteCicloKey();
    const salvo = localStorage.getItem(key);
    if (salvo) {
      const dataSalva = new Date(`${salvo}T00:00:00`);
      if (!Number.isNaN(dataSalva.getTime())) return dataSalva;
    }
    const agora = new Date();
    localStorage.setItem(key, toKey(agora));
    return agora;
  }

  function setComprovanteCicloBase(date) {
    localStorage.setItem(getComprovanteCicloKey(), toKey(date));
  }

  function getComprovanteCicloAtual() {
    let inicio = getCurrentPaymentAnchor(getComprovanteCicloBase());
    let fim = getPeriodBounds(addMonths(inicio, COMPROVANTE_PERIODO_MESES - 1)).end;
    const agora = new Date();

    while (agora > fim) {
      inicio = addMonths(inicio, COMPROVANTE_PERIODO_MESES);
      fim = getPeriodBounds(addMonths(inicio, COMPROVANTE_PERIODO_MESES - 1)).end;
      setComprovanteCicloBase(inicio);
    }

    return { start: inicio, end: fim };
  }

  function getLocalizacaoTexto(localizacao) {
    if (!localizacao) return "Não registrada";
    if (localizacao.address) return localizacao.address;
    if (localizacao.endereco) return localizacao.endereco;
    return `${localizacao.lat.toFixed(5)}, ${localizacao.lng.toFixed(5)}`;
  }

  function fitTextWithEllipsis(ctx, text, maxWidth) {
    let value = String(text || "");
    if (ctx.measureText(value).width <= maxWidth) return value;
    while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
      value = value.slice(0, -1);
    }
    return `${value}…`;
  }

  function breakLongToken(ctx, token, maxWidth) {
    const parts = [];
    let current = "";
    for (const char of String(token || "")) {
      const test = current + char;
      if (current && ctx.measureText(test).width > maxWidth) {
        parts.push(current);
        current = char;
      } else {
        current = test;
      }
    }
    if (current) parts.push(current);
    return parts.length ? parts : [String(token || "—")];
  }

  function wrapText(ctx, text, maxWidth, maxLines = 2) {
    const tokens = String(text || "—").trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return ["—"];

    const lines = [];
    let current = "";

    tokens.forEach((token) => {
      const parts = ctx.measureText(token).width > maxWidth ? breakLongToken(ctx, token, maxWidth) : [token];
      parts.forEach((part, index) => {
        const separator = current ? (index === 0 ? " " : "") : "";
        const test = `${current}${separator}${part}`;
        if (!current || ctx.measureText(test).width <= maxWidth) {
          current = test;
          return;
        }
        lines.push(current);
        current = part;
      });
    });

    if (current) lines.push(current);
    if (lines.length <= maxLines) return lines;

    const limited = lines.slice(0, maxLines);
    limited[maxLines - 1] = fitTextWithEllipsis(ctx, limited[maxLines - 1], maxWidth);
    if (!limited[maxLines - 1].endsWith("…")) {
      limited[maxLines - 1] = fitTextWithEllipsis(ctx, `${limited[maxLines - 1]}…`, maxWidth);
    }
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

  function drawCellLines(ctx, lines, x, y, width, height, align, color, font) {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    const pad = 10;
    const fontSizeMatch = font.match(/(\d+)px/);
    const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 14;
    const lineHeight = Math.round(fontSize * 1.4);
    const totalHeight = lines.length * lineHeight;
    const baseX = align === "left" ? x + pad : align === "right" ? x + width - pad : x + width / 2;
    let currentY = y + (height - totalHeight) / 2 + lineHeight * 0.75;
    lines.forEach((line) => {
      ctx.fillText(line, baseX, currentY);
      currentY += lineHeight;
    });
  }

  function drawCellText(ctx, value, x, y, width, height, align, color, font, maxLines = 2) {
    ctx.font = font;
    const pad = 10;
    const maxW = Math.max(24, width - pad * 2);
    const lines = wrapText(ctx, value, maxW, maxLines);
    drawCellLines(ctx, lines, x, y, width, height, align, color, font);
  }

  async function drawLogoImage(ctx, totalW, padding, svgPath, maxWidth) {
    try {
      let logoSrc = LOGO_CACHE.get(svgPath);
      if (!logoSrc) {
        const response = await fetch(svgPath);
        const svg = await response.text();
        logoSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        LOGO_CACHE.set(svgPath, logoSrc);
      }
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = logoSrc;
      });
      const ratio = img.width / img.height;
      const height = maxWidth / ratio;
      ctx.drawImage(img, (totalW - maxWidth) / 2, padding, maxWidth, height);
      return height;
    } catch {
      return 0;
    }
  }

  function baixarImagemRelatorio(blob, nomeArquivo) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    mostrarToast("Imagem salva com sucesso!");
  }

  function drawInfoCell(ctx, x, y, width, height, label, value, nota) {
    if (label) {
      ctx.fillStyle = "#7A8570";
      ctx.font = "700 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label.toUpperCase(), x + 20, y + 20);

      ctx.strokeStyle = "#C9D1BC";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 27);
      ctx.lineTo(x + width - 20, y + 27);
      ctx.stroke();
    }

    ctx.font = "700 17px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#20291A";
    ctx.textAlign = "left";
    const linhasValor = wrapText(ctx, value, width - 40, 2);
    let vy = y + 52;
    linhasValor.forEach((linhaTexto) => {
      ctx.fillText(linhaTexto, x + 20, vy);
      vy += 21;
    });

    if (nota) {
      ctx.fillStyle = "#000000";
      ctx.font = "700 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(nota, x + 20, vy + 8);
    }
  }

  function drawInfoRow(ctx, padding, totalW, y, rowH, celulas) {
    const colW = (totalW - padding * 2) / celulas.length;
    celulas.forEach((celula, index) => {
      drawInfoCell(ctx, padding + colW * index, y, colW, rowH, celula.label, celula.value, celula.nota);
      if (index > 0) {
        ctx.strokeStyle = "#B9C2AC";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padding + colW * index, y + 8);
        ctx.lineTo(padding + colW * index, y + rowH - 8);
        ctx.stroke();
      }
    });
  }

  async function gerarComprovanteRegistro({ foto, data, horario, localizacao, usuario, saldo }) {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = foto;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const totalW = 640;
    const padding = 32;

    const logoPath = `${ROOT}/assets/timewallet_logo_header_black.svg`;
    const logoH = await drawLogoImage(ctx, totalW, padding, logoPath, 260);
    const titleTop = padding + logoH + 14;

    const maxPhotoW = totalW - padding * 2;
    const maxPhotoH = 460;
    const ratio = img.naturalWidth / img.naturalHeight || 1;
    let photoW = maxPhotoW;
    let photoH = photoW / ratio;
    if (photoH > maxPhotoH) {
      photoH = maxPhotoH;
      photoW = photoH * ratio;
    }
    const photoTop = titleTop + 40;
    const photoX = padding + (maxPhotoW - photoW) / 2;

    const usuarioRowH = 58;
    const linhas = [
      [
        { label: "Horário do ponto", value: "15:00" },
        { label: "Horário de saída", value: horario },
        { label: "Saldo", value: saldo, nota: "*Tolerância até 15:10" },
      ],
      [{ label: "Localização", value: localizacao || "Não registrada" }],
    ];
    const rowH = 96;
    const tableTop = photoTop + photoH + 16;
    const tableH = usuarioRowH + linhas.length * rowH;
    const totalH = tableTop + tableH + padding + 34;

    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#F7F5EE";
    ctx.fillRect(0, 0, totalW, totalH);

    if (logoH) await drawLogoImage(ctx, totalW, padding, logoPath, 260);

    ctx.fillStyle = "#20291A";
    ctx.font = '700 24px Georgia, "Times New Roman", serif';
    ctx.textAlign = "center";
    ctx.fillText("Comprovante de Registro", totalW / 2, titleTop + 6);

    drawRoundedRect(ctx, padding, photoTop - 10, maxPhotoW, photoH + 20, 24, "#FFFFFF", "#E6EBDB");
    ctx.save();
    drawRoundedRect(ctx, photoX, photoTop, photoW, photoH, 16, null, null);
    ctx.clip();
    ctx.drawImage(img, photoX, photoTop, photoW, photoH);
    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, padding, tableTop, totalW - padding * 2, tableH, 24, "#FFFFFF", null);
    ctx.clip();
    ctx.fillStyle = "#5F674F";
    ctx.fillRect(padding, tableTop, totalW - padding * 2, usuarioRowH);
    ctx.restore();
    drawRoundedRect(ctx, padding, tableTop, totalW - padding * 2, tableH, 24, null, "#AEB7A0");

    const dataBaseline = tableTop + usuarioRowH / 2 + 6;
    const virgulaIdx = String(data || "").indexOf(",");
    const diaSemana = virgulaIdx >= 0 ? data.slice(0, virgulaIdx + 1) : data;
    const restoData = virgulaIdx >= 0 ? data.slice(virgulaIdx + 1) : "";

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.font = "700 21px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(diaSemana, padding + 20, dataBaseline);
    if (restoData) {
      const larguraDia = ctx.measureText(diaSemana).width;
      ctx.font = "700 16px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(restoData, padding + 20 + larguraDia, dataBaseline);
    }

    ctx.font = "700 18px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(usuario || "—", totalW - padding - 20, dataBaseline);

    let y = tableTop + usuarioRowH;
    linhas.forEach((celulas) => {
      ctx.strokeStyle = "#C2CAB6";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(padding + 1, y);
      ctx.lineTo(totalW - padding - 1, y);
      ctx.stroke();

      drawInfoRow(ctx, padding, totalW, y, rowH, celulas);
      y += rowH;
    });

    ctx.fillStyle = "#000000";
    ctx.font = "700 12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Gerado em ${new Date().toLocaleString("pt-BR")}`, totalW / 2, totalH - padding + 6);

    return canvas.toDataURL("image/jpeg", 0.85);
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
    const label = escapeHtml(getLocationDisplay(loc));
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

  function camMostrarLive() {
    byId("camVideo")?.style.setProperty("display", "block");
    byId("camPreview")?.style.setProperty("display", "none");
    byId("camQuestion")?.style.setProperty("display", "none");
    byId("camActionsLive")?.style.setProperty("display", "flex");
    byId("camActionsPreview")?.style.setProperty("display", "none");
  }

  function camFechar(resultado) {
    byId("camModal")?.classList.remove("show");
    if (camStream) {
      camStream.getTracks().forEach((track) => track.stop());
      camStream = null;
    }
    camFotoCapturada = null;
    camMostrarLive();
    if (camResolver) {
      const resolve = camResolver;
      camResolver = null;
      resolve(resultado);
    }
  }

  function camCapturarFoto() {
    const video = byId("camVideo");
    const canvas = byId("camCanvas");
    const preview = byId("camPreview");
    if (!video || !canvas || !preview) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
    ctx.clearRect(-canvas.width, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    camFotoCapturada = canvas.toDataURL("image/jpeg", 0.85);

    preview.src = camFotoCapturada;
    byId("camVideo")?.style.setProperty("display", "none");
    preview.style.display = "block";
    byId("camQuestion")?.style.setProperty("display", "block");
    byId("camActionsLive")?.style.setProperty("display", "none");
    byId("camActionsPreview")?.style.setProperty("display", "flex");
  }

  function initCameraModal() {
    on("camCancelar", "click", () => camFechar(null));
    on("camFecharX", "click", () => camFechar(null));
    on("camCapturar", "click", camCapturarFoto);
    on("camMudar", "click", camMostrarLive);
    on("camFeito", "click", () => camFechar(camFotoCapturada));
    on("camModal", "click", (e) => {
      if (e.target.id === "camModal") camFechar(null);
    });
  }

  async function abrirCameraModal() {
    const modal = byId("camModal");
    const video = byId("camVideo");
    if (!modal || !video) return null;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "unsupported";

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!devices.some((device) => device.kind === "videoinput")) return "unsupported";
    } catch {}

    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    } catch (error) {
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return "denied";
      return "unsupported";
    }

    video.srcObject = camStream;
    camMostrarLive();
    modal.classList.add("show");
    return new Promise((resolve) => {
      camResolver = resolve;
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
      const photo = escapeHtml(user.photoURL || defaultUserPhoto());
      const nome = escapeHtml(user.displayName || "Usuário");
      const email = escapeHtml(user.email || "");
      btnUsuario.innerHTML = `<img src="${photo}" alt="${nome}">`;
      btnUsuario.title = user.displayName || user.email || "Usuário logado";
      dropdownHeader.innerHTML = `
        <img src="${photo}" alt="">
        <div class="user-info">
          <div class="user-name">${nome}</div>
          <div class="user-email">${email}</div>
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
        <div class="user-email user-email-wrap">Entre para sincronizar seus registros</div>
      </div>
    `;
    dropdownSignIn.hidden = false;
    dropdownSignOut.hidden = true;
    dropdownSignIn.onclick = async () => {
      try {
        await Store.signInWithGoogle();
      } catch (error) {
        console.error("Erro no login:", error);
        const erroLimite = error?.code === "auth/admin-restricted-operation"
          || error?.code === "auth/operation-not-allowed"
          || String(error?.message || "").toLowerCase().includes("limite de 3");
        if (erroLimite) {
          mostrarToast("O limite de 3 usuários ativos já foi atingido.", "warning");
        } else {
          mostrarToast("Não foi possível entrar com o Google. Tente novamente.", "error");
        }
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
      firebaseDb.enablePersistence({ synchronizeTabs: true }).catch((error) => {
        console.warn("Persistência offline indisponível:", error?.code || error);
      });
    } catch (error) {
      console.warn("Firebase init failed:", error);
      mostrarToast("Servidor indisponível. Seus dados ficarão salvos neste dispositivo.", "warning");
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
        if (user && !this._migrated) {
          await this._migrateLocalToFirestore();
          this._migrated = true;
        }
        this._authReady = true;
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

    async waitAuthReady() {
      while (!this._authReady) await new Promise((resolve) => setTimeout(resolve, 50));
    },

    _getCollection() {
      if (!this._user || !firebaseDb) return null;
      return firebaseDb.collection("users").doc(this._user.uid).collection("registros");
    },

    _getBaixasCollection() {
      if (!this._user || !firebaseDb) return null;
      return firebaseDb.collection("users").doc(this._user.uid).collection("baixas");
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
        return this._confirmSynced();
      }
      const all = this.getAllSync();
      all[dateKey] = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      return true;
    },

    async _confirmSynced(timeoutMs = 6000) {
      if (!firebaseDb || typeof firebaseDb.waitForPendingWrites !== "function") return true;
      let timedOut = false;
      const timeout = new Promise((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs);
      });
      try {
        await Promise.race([firebaseDb.waitForPendingWrites(), timeout]);
      } catch {
        return false;
      }
      return !timedOut;
    },

    async _migrateLocalToFirestore() {
      const localData = this.getAllSync();
      const localBaixas = this.getAllBaixasSync();
      const keys = Object.keys(localData);
      const baixaKeys = Object.keys(localBaixas);
      if (keys.length === 0 && baixaKeys.length === 0) return;
      const col = this._getCollection();
      const colBaixas = this._getBaixasCollection();
      if (!col || !colBaixas) return;

      const batch = firebaseDb.batch();
      keys.forEach((key) => batch.set(col.doc(key), localData[key]));
      baixaKeys.forEach((key) => batch.set(colBaixas.doc(key), localBaixas[key]));
      await batch.commit();
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BAIXAS_STORAGE_KEY);
    },

    getAllBaixasSync() {
      try {
        return JSON.parse(localStorage.getItem(BAIXAS_STORAGE_KEY)) || {};
      } catch {
        return {};
      }
    },

    async getAllBaixas() {
      while (!this._authReady) await new Promise((resolve) => setTimeout(resolve, 50));
      const col = this._getBaixasCollection();
      if (!col) return this.getAllBaixasSync();

      const snapshot = await col.get();
      const data = {};
      snapshot.forEach((doc) => {
        data[doc.id] = doc.data();
      });
      return data;
    },

    async addBaixa(dateKey, data) {
      while (!this._authReady) await new Promise((resolve) => setTimeout(resolve, 50));
      const col = this._getBaixasCollection();
      if (col) {
        await col.doc(dateKey).set(data);
        return;
      }
      const all = this.getAllBaixasSync();
      all[dateKey] = data;
      localStorage.setItem(BAIXAS_STORAGE_KEY, JSON.stringify(all));
    },

    async removeMany(keys) {
      if (!keys.length) return;
      while (!this._authReady) await new Promise((resolve) => setTimeout(resolve, 50));
      const col = this._getCollection();
      if (col) {
        for (let i = 0; i < keys.length; i += 450) {
          const lote = keys.slice(i, i + 450);
          const batch = firebaseDb.batch();
          lote.forEach((key) => batch.delete(col.doc(key)));
          await batch.commit();
        }
        return;
      }
      const all = this.getAllSync();
      keys.forEach((key) => delete all[key]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    },

    async removeBaixasMany(keys) {
      if (!keys.length) return;
      while (!this._authReady) await new Promise((resolve) => setTimeout(resolve, 50));
      const col = this._getBaixasCollection();
      if (col) {
        for (let i = 0; i < keys.length; i += 450) {
          const lote = keys.slice(i, i + 450);
          const batch = firebaseDb.batch();
          lote.forEach((key) => batch.delete(col.doc(key)));
          await batch.commit();
        }
        return;
      }
      const all = this.getAllBaixasSync();
      keys.forEach((key) => delete all[key]);
      localStorage.setItem(BAIXAS_STORAGE_KEY, JSON.stringify(all));
    },
  };

  function getLimpezaAnoKey() {
    const uid = Store.getCurrentUser()?.uid || "local";
    return `${LIMPEZA_ANO_KEY_PREFIX}_${uid}`;
  }

  async function limparDadosAnoAnteriorSeNecessario() {
    const agora = new Date();
    const anoAtual = agora.getFullYear();
    const gatilho = new Date(anoAtual, 0, 8);
    if (agora < gatilho) return;

    const chaveConfig = getLimpezaAnoKey();
    const ultimoAnoLimpo = Number(localStorage.getItem(chaveConfig) || 0);
    if (ultimoAnoLimpo >= anoAtual) return;

    const anoAnterior = anoAtual - 1;
    const [registros, baixas] = await Promise.all([Store.getAll(), Store.getAllBaixas()]);
    const chavesRegistros = Object.keys(registros).filter((key) => key.startsWith(`${anoAnterior}-`));
    const chavesBaixas = Object.keys(baixas).filter((key) => key.startsWith(`${anoAnterior}-`));

    await Promise.all([Store.removeMany(chavesRegistros), Store.removeBaixasMany(chavesBaixas)]);
    localStorage.setItem(chaveConfig, String(anoAtual));
  }

  async function initShell({ onReady, onAuthChange } = {}) {
    maybeShowSplash();
    renderDataPrincipal();
    initPrimaryNavigation();
    initUserMenu();
    initImageModal();
    initCameraModal();

    await Store.init();
    await limparDadosAnoAnteriorSeNecessario();

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
    formatarSaldoTexto,
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
    getSemestralLabel,
    getPeriodosDoAno,
    periodoTemRegistro,
    getPeriodosComRegistro,
    shiftPaymentAnchor,
    abrirImagem,
    abrirCameraModal,
    fecharImagem,
    getComprovanteInfo,
    formatComprovanteNome,
    formatComprovanteResumo,
    formatComprovanteTitulo,
    formatPeriodoComprovante,
    COMPROVANTE_PERIODO_MESES,
    startOfMonth,
    addMonths,
    getComprovanteCicloAtual,
    getLocalizacaoTexto,
    wrapText,
    drawRoundedRect,
    drawMetricCard,
    drawCellText,
    drawCellLines,
    drawLogoImage,
    baixarImagemRelatorio,
    gerarComprovanteRegistro,
    goToHome,
    goToCalendario,
    goToRegistro,
    initShell,
  };
})();
