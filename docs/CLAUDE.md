# Banco de Horas

> **Manutenção deste arquivo**: sempre que uma mudança for feita no app (regra de cálculo, tela nova, cor, fluxo, estrutura de dados etc.), atualize este `CLAUDE.md` na mesma tarefa, refletindo o estado atual do projeto. Toda regra de negócio nova/alterada entra na seção **Funcionamento e regras de negócio** abaixo — é o lugar único de consulta, não duplique o mesmo dado em mais de uma seção. Não deixe a documentação dessincronizar do código.

## Proposta

App pessoal para controle de banco de horas de estágio. O usuário bate ponto de entrada fixo às **15:00** (horário do estágio) e usa o app pra registrar o horário de **saída**, calculando automaticamente quanto tempo extra foi feito (ou descontado, se saiu antes da hora). Foco 100% mobile: usado no celular, no fim do expediente, pra tirar uma foto do comprovante e já sair registrado.

App está organizado sem build e sem framework, com HTML + CSS + JS puro abrindo direto no navegador (double-click ou `file://`). A entrada principal continua sendo o `index.html` na raiz, com estilos compartilhados em `assets/css/style.css`, módulo compartilhado em `assets/js/shared.js` (`Store`, `calcularExtra`, `isDiaUtil`, `initShell`, geocoding, config de período etc.), scripts próprios de cada tela (`assets/js/script.js` pra home, `assets/js/calendario.js` e `assets/js/banco-horas.js`) e telas separadas em `views/` (`calendario.html`, `banco-horas.html`, `splash.html`). `views/base.html` existe no repo como template `{{content}}`/`{{root}}` mas não é referenciado por nenhuma tela atual — código morto/experimento, não usar como referência de estrutura.

> **Registro de mudanças**: sempre que qualquer arquivo do projeto for alterado, registre a mudança em `logs/versions/` com um `.md` novo contendo data, arquivos afetados e campos/itens modificados. Ao alterar comportamento, mantenha `docs/CLAUDE.md` e `docs/README.md` alinhados com esse histórico.

## Funcionamento e regras de negócio

Tudo sobre como o app se comporta e calcula está aqui, num lugar só.

### Cálculo do tempo extra

Ponto de referência fixo: **15:00**.

- Saída **antes das 15:00** → desconta. `extra = saída − 15:00` (negativo).
- Saída entre **15:00 e 15:10** (tolerância) → **neutro**, não conta nada (`extra = 0`).
- Saída **a partir das 15:11** → soma tempo extra, descontando a tolerância. `extra = saída − 15:10`.

Essa regra vale em todo lugar que mostra tempo extra: card da tela inicial, detalhe do dia no calendário e saldo total na tela "Banco de Horas" (aplicado ao saldo somado do período).

**Cor do card grande de resultado (home, "Registro salvo" no Calendário, saldo do Banco de Horas)**: fica sempre cinza-oliva (`hero-muted`, `#AEB49E` com texto branco), **independente do sinal** — uma tentativa de deixar verde/vermelho por sinal foi feita e revertida a pedido do usuário (commit `d2577f7`), não reintroduzir sem confirmar antes.

**Ícone/badge do card "Registro salvo" no Calendário** (diferente do card grande acima) — esse sim reage ao sinal: `.detail-card-badge` e `#detailHeroIcon` (título "Registro") ficam vermelhos (`.is-danger`) no desconto e verdes (`.is-success`) no tempo extra; neutro fica no cinza padrão. Lógica em `mostrarDetalhe()` (`calendario.js`), classes em `style.css`.

### Dias úteis / feriados

- Sábado, domingo e feriados nacionais brasileiros = não úteis, não clicáveis, não contam pendência.
- Feriados fixos são hardcoded; feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi) são calculados via algoritmo de Páscoa (Gauss) — funciona pra qualquer ano automaticamente.

### Persistência

**Dual-mode: Firebase (prioridade) + localStorage (fallback)**

- **Autenticado** → Firestore em `users/{uid}/registros/{dateKey}` — sincroniza entre dispositivos, persiste offline.
- **Não autenticado** → `localStorage` (chave `bancoHoras_registros`) — comportamento original.
- Migração automática `localStorage → Firestore` no primeiro login.
- **Registro diário (botão de câmera na home) exige login**: `abrirCamera()` em `script.js` bloqueia (toast "Faça login com Google para registrar.") se `Store.getCurrentUser()` for `null` — mesmo com o fallback de `localStorage` existindo tecnicamente, não dá mais pra registrar sem estar autenticado. Não afeta o registro manual do Calendário, que continua sem essa trava.
- Firestore travado por `request.auth.uid == userId` — cada usuário só acessa os próprios dados.

O objeto `Store` abstrai isso: `getAll()`, `get(key)`, `set(key, data)` — todos **async** (retornam Promise).

Estrutura no Firestore:
```
users/{uid}/
  registros/{YYYY-MM-DD}/
    saida: "HH:MM"
    extraMin: number
    comprovante: "data:image/png...base64"   // recibo gerado (App.gerarComprovanteRegistro), não a foto crua
    comprovanteNome: "arquivo.jpg"
    comprovantePeriodo: "26/08/2026 – 25/09/2026"
    localizacao: { lat, lng, address }   // opcional, só depois da geolocalização resolver

  baixas/{YYYY-MM-DD}/
    data, horario, saldoBaixado, comprovante, comprovanteNome, recibo, reciboNome
```

### Período de pagamento

- Configurável (padrão 26→25), editável em `periodModal`, salvo em `localStorage`.
- **Navegação de período (Calendário e Banco de Horas) usa o mesmo modelo**, unificado em `App.getPeriodosComRegistro(ano, registros)` (`shared.js`, usado por `calendario.js` e `banco-horas.js`): ano civil fixo — 12 períodos possíveis, janeiro a dezembro, sempre recalculado a partir da data de hoje (sem depender de primeiro login, sem nada salvo — reseta sozinho a cada virada de ano). **Só aparecem na navegação/select os períodos que já têm pelo menos 1 registro, mais o período atual** (mesmo sem registro ainda, pra não deixar a tela sem opção nenhuma); o cálculo dos 12 períodos continua existindo por trás (`getPeriodosDoAno`) — é só a lista visível que filtra. No Banco de Horas, o saldo acumulado do topo soma o ano inteiro, então o filtro não muda o valor — só limpa a navegação.
- **Trava de "primeiro login" no Calendário é separada da navegação de período**: `App.getComprovanteCicloAtual()` (ancorado no período de pagamento que contém a data do primeiro login, via `getCurrentPaymentAnchor`) só serve como **piso** pra saber se um dia pode ser clicado/registrado (`getPrimeiroPeriodoPermitido()` em `calendario.js`) — não limita mais até onde dá pra navegar com ‹ › (isso agora segue o modelo dos 12 períodos do ano acima, igual ao Banco de Horas). `COMPROVANTE_PERIODO_MESES` (6 meses) não é mais usado como teto de navegação, só existe internamente dentro de `getComprovanteCicloAtual` pra decidir quando avançar essa data-base.

### Limpeza automática de dados do ano anterior (DESTRUTIVO)

- `limparDadosAnoAnteriorSeNecessario()` (`shared.js`, chamada dentro de `initShell` logo após `Store.init()`, roda em toda tela) **apaga permanentemente** todos os `registros` e `baixas` do **ano civil anterior inteiro** (Firestore e/ou `localStorage`, conforme o modo), sem confirmação do usuário — é automático e silencioso.
- Gatilho: dispara a partir de **8 de janeiro** do ano corrente (ou seja, 1 semana depois da virada do ano). Antes disso, dados do ano anterior continuam intactos mesmo que já não apareçam mais na navegação de 12 períodos.
- Roda **uma vez por ano por usuário**: guarda o último ano já limpo em `localStorage` (`bancoHoras_limpeza_ano_{uid|"local"}`) pra não tentar apagar de novo (idempotente, mas evita reconsultar o Firestore toda vez).
- Sem desfazer: não existe backup/lixeira. Se essa lógica de data tiver um bug, o risco é apagar ano errado — qualquer mudança aqui exige atenção redobrada nos limites de data (`key.startsWith(`${anoAnterior}-`)`).
- `Store.removeMany(keys)`/`Store.removeBaixasMany(keys)` (`shared.js`) fazem a exclusão em lote (batch do Firestore, chunk de 450 por lote pelo limite de 500 operações; ou remoção direta do objeto no `localStorage`).

### Baixa de saldo (Banco de Horas)

- Ao confirmar: tira foto (câmera ou galeria), pede confirmação ("tem certeza") **depois** de já ter a foto (nunca antes — diálogo bloqueante antes da câmera quebra a permissão do navegador), salva `{data, horário, saldoBaixado, foto}` e gera uma imagem de comprovante no mesmo estilo do relatório (campos: Data, Localização, Saldo resgatado, Nome do usuário).
- A partir da data/hora da baixa, o "Saldo acomulado" do ano zera e passa a somar só registros **depois** da baixa. Registros anteriores continuam visíveis no Histórico de registros (não são apagados), só param de contar no saldo corrente.
- Baixa não captura localização (só data, horário, saldo, nome do usuário).

### Comprovante de registro diário (câmera e manual)

- `App.gerarComprovanteRegistro({foto, data, horario, localizacao, usuario, saldo})` (`shared.js`) gera um recibo em Canvas: logo, título "Comprovante de Registro", a foto tirada/anexada centralizada, e uma tabela única (mesmo card/borda) onde a primeira linha é uma faixa cor do header (`#5F674F`, cantos arredondados seguindo o card) com **Data** à esquerda e **Usuário** à direita (texto branco, sem rótulo), seguida por: **Horário do ponto** fixo "15:00" / **Horário de saída** / **Saldo** (3 colunas na mesma linha — Saldo mostra só o resultado com sinal, `+` acima da tolerância, `-` desconto, sem sinal no neutro, via `App.formatarSaldoTexto(extraMin)`, com a nota em **negrito preto** "Tolerância até 15:10" em fonte menor logo abaixo do valor); e por último **Localização** em linha única full-width. Mesmo estilo visual dos outros geradores (relatório do período em `calendario.js` e recibo de baixa em `banco-horas.js`). O resultado (`data:image/png`) é o que vira o campo `comprovante` salvo — a foto crua em si não é persistida separadamente.
- Usado nos dois fluxos de registro diário, com o mesmo padrão: câmera/galeria da home (`script.js`, `salvarRegistroHoje`) e anexo do registro manual no Calendário (`calendario.js`, handler `salvarManual`). Naming do arquivo (`App.formatComprovanteNome`/`getComprovanteInfo`) já era compartilhado entre os dois — segue igual.
- **Nome do arquivo reservado pela posição no período, não pela ordem de upload**: `getComprovanteNomePadrao` (`shared.js`) calcula `getPeriodoOrdemDia(data)` — o número do dia dentro do período de pagamento daquela data (1º dia do período = `01`, 2º = `02`, etc.), sempre baseado na data do registro, nunca em quando o registro foi de fato salvo. Formato: `comprovante_{ordem}_{dd-mm-aaaa}_{usuario}.{ext}` (ex.: `comprovante_03_28-08-2026_guilherme.png`). Assim, se você esquecer o dia 1 e preencher ele manualmente depois de já ter outros dias registrados, ele ainda fica com `comprovante_01_...` — a posição é reservada pelo calendário, não pela ordem em que você de fato registrou.
- Na home, a localização normalmente ainda não chegou no momento do save (é assíncrona, resolve depois — ver regra de Baixa acima sobre o padrão "salva rápido, geolocalização depois"). Por isso o recibo é gerado **duas vezes** quando a localização resolve a tempo: uma vez no save (campo Localização em branco/"Não registrada"), e outra em `salvarLocalizacaoRegistroHoje()`, que regenera o recibo com a localização real e sobrescreve `comprovante` — só funciona **na mesma sessão** em que a foto foi tirada (usa a foto crua ainda em memória, `comprovanteFotoOriginal`); depois de recarregar a página essa foto crua não existe mais (só o recibo já gerado ficou salvo), então nesse caso só o campo `localizacao` é atualizado, o recibo não é regerado.
- Registro manual não captura localização (mesma regra da Baixa), então o recibo já sai completo na primeira geração, sem necessidade de regenerar depois.
- Formato de data com dia da semana usa vírgula em todo lugar: `"Segunda, 26/08/2026"` (`getDataFmtHoje()` em `script.js`, `dataFmt`/coluna "Dia" do relatório em `calendario.js`, `formatarDataPrincipal` em `shared.js`).
- `App.getPeriodoNome`/`comprovantePeriodo` mostra o intervalo real do período (`"26/08/2026 – 25/09/2026"`), não mais o texto genérico `"periodo 08"` — aparece assim em `da-periodo` na tela de detalhe do registro (Calendário) e em qualquer outro lugar que leia `comprovanteInfo.periodo`.

### Segurança

- Câmera/geolocalização exigem contexto seguro (HTTPS ou localhost); em `file://` cai pro fallback de input comum sem localização.
- Nunca injetar texto vindo de fonte externa (endereço de geocoding via OSM, nome/foto de conta Google) em `innerHTML` sem escapar antes — evita XSS armazenado.

## Estrutura de telas

1. **Splash screen** — ao abrir a raiz (`index.html`), o app mostra `views/splash.html` por 2 segundos com logo e nome da empresa, e depois redireciona de volta para a home na mesma sessão.
2. **Tela inicial** — `div.sub-header` exibe a data completa no formato "Domingo, 30/08/2026" apenas na raiz/home. Card "Registro Saída" com botão de câmera, status visual de registro concluído sem exibir a imagem do comprovante, botão "Banco de Horas" (pílula bege com ícone de relógio).
3. **Câmera in-app** (`getUserMedia`, não usa `<input capture>` puro porque no Android isso cai na galeria) — preview ao vivo, captura, confirmação ("Foto ficou boa?" → Mudar / Feito!), aí sim preenche horário atual, salva e captura geolocalização. O card "Localização" (`#comprovanteMeta`/`#comprovantePeriodo`, dentro do hero de resultado) é o **único** lugar que mostra status de localização — passa por "Obtendo localização..." → "Obtendo endereço..." → endereço final; em erro (permissão negada, timeout, serviço desligado), mostra a causa e um botão "Tentar novamente" que também dispara sozinho quando a aba volta a ficar visível. A localização resolvida é persistida de volta no registro (que já tinha sido salvo antes, sem esperar a geolocalização) via `salvarLocalizacaoRegistroHoje()`.
4. **Calendário** — navegação por **período configurável** (padrão 26→25, editável via botão de engrenagem `periodSettingsBtn` que abre o `periodModal`, salvo em `localStorage`), indicadores visuais por dia: hoje (classe `today`), preenchido (`filled` + `filled-negative/neutral/positive`), pendente/sem registro (classe `pending`, borda vermelha — **só aplica pra dias passados, `key < hojeKey`; hoje sem registro nunca fica marcado como pendente, só como "hoje"**), fim de semana/feriado (`off`, cinza, não clicável). Clicar num dia útil sempre abre o detalhe/formulário de registro manual (com modal de seleção de horário); o card mostra o rótulo "Período" e o botão de engrenagem pra alterar início e fim do período. Navegação de período (‹ ›) segue os 12 períodos do ano civil com registro (mesmo modelo do Banco de Horas, ver seção "Período de pagamento"); dias antes do período do seu primeiro login continuam bloqueados pra registro/detalhe (`getPrimeiroPeriodoPermitido`), independente de até onde a navegação alcança.
5. **Detalhe do dia / Registro manual** — dentro do calendário, ao clicar num dia sem registro abre o formulário de registro manual (`renderFormManual`, wrapper `.form-manual`): campo "Horário Saída" via botão que abre modal de seleção de horário (hora/minuto), campo "Comprovante" com seleção de imagem da galeria, botão "Salvar registro". Dia já registrado mostra o detalhe: horário de ponto (15:00 fixo), horário de saída, localização (link pro Google Maps + endereço resolvido por **geocodificação reversa** via Nominatim/OSM, cacheado em memória, com fallback pra lat/lng cru se a API falhar), tempo extra do dia, comprovante (miniatura + visualizar + baixar).
6. **Banco de Horas** — saldo total do período atual, lista paginada de registros (`REG_POR_PAGINA = 6`), rótulo "Período" acima do intervalo, botão "Exportar relatório" com ícone de exportação (renderiza em Canvas) e botão "Baixar comprovantes do período" que gera um ZIP (via JSZip) com os comprovantes do período selecionado.
7. **Perfil do usuário** — menu do usuário com visual mais moderno: avatar/cartão arredondado, cabeçalho mais rico, estado de convidado com badge e CTA de sincronização via Google. Item "Sair" (`#dropdownSignOut`) centralizado no dropdown (diferente dos demais itens, alinhados à esquerda).

## Identidade visual

- **Paleta**: verde-oliva como cor primária (`#4A701C`, escuro `#375215`, claro `#E8F0DD`), fundo creme (`#F7F5EE`), texto quase-preto esverdeado (`#20291A`), texto secundário verde-acinzentado (`#7A8570`), vermelho de alerta (`#B3261E`), bege caqui como cor de destaque secundária (`#B9A47C` no botão "Banco de Horas", `#C9B589`/`#EFF1EA` nos estados neutros). Verde-acinzentado `#7B846D` (escurecido `#5F674F` em estado ativo) é a cor de destaque neutro (`hero-muted`) e também a cor do header (`.top-bar`, escurecido pra `#5F674F` em relação ao tom original) e dos botões-chave do fluxo de registro manual.
- **Tipografia**: sans-serif do sistema pra UI (labels, botões, inputs); serifada (Georgia) só nos títulos de saudação/cabeçalho de tela ("Bom dia, ...", "Calendário", "Banco de Horas", "Período"). Regra completa:
  - Georgia (serifada) **só** em títulos: saudação da home, títulos de tela (`hero-title`), títulos de card (`reg-export-title`, `detail-card-title`), sub-títulos de seção (`period-label-centered` — "Período", `legend-title` — "Legenda"), títulos de modal (`period-sheet-title`), nome da empresa na splash.
  - Sistema sans-serif (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`) em todo o resto: labels, botões, inputs e **selects** — inclusive o `<select>` nativo, que por padrão herdaria a fonte do navegador em vez da do app (por isso `button,input,select{font:inherit;}` no CSS).
  - Nas telas internas, os títulos principais "Calendário" e "Banco de Horas" usam tamanho levemente ampliado, com espaçamento entre letras mais fechado, e a linha da data logo abaixo também aparece maior que no header da home — dá o tom "gerado por IA/personalizado" que o projeto buscou.
- **Linguagem visual**: cards brancos arredondados com sombra suave (`--radius:16px`), botões em pílula, ícones SVG inline (sem emoji), hero cards de destaque em cinza-oliva `hero-muted` (`#AEB49E`) — ver nota sobre cor do card de resultado x cor do badge/ícone em "Cálculo do tempo extra".
- **Layout**: mobile-first, largura máxima 480px centralizada, header verde-acinzentado (`.top-bar`, `#5F674F`) fixo no topo (logo alinhada mais à esquerda, acompanhando o mesmo eixo inicial dos títulos e datas das telas internas), sombra lateral esquerda intencional (`box-shadow:-4px 0 20px rgba(0,0,0,.2)`) tanto no `.app` quanto no rodapé fixo, pra dar uma "borda" de profundidade consistente em toda a tela. O footer fica quase colado ao conteúdo acima em todas as telas, e a área principal não força mais um espaço elástico grande antes dele.
- **Tela de registro manual** (`.form-manual`, escopo pra não afetar o resto do app): os elementos que herdariam o verde-claro padrão (`--primary-light` / `#E8F0DD`) — ícone do label (`.label-ico`) e botão "Abrir galeria" (`.fa-btn`) — usam cinza neutro `#F0F0F0` em vez disso. O botão "Salvar registro" (`.btn` dentro de `.form-manual`) e o botão "Salvar horário" do modal de seleção de horário (`.period-save-btn`, usado a partir dessa tela) usam `#7B846D` (ativo `#5F674F`) em vez do verde padrão do `.btn` global — **cuidado com ordem no CSS**: regras com a mesma especificidade (`.form-manual .btn` vs `.btn`, `.period-save-btn` vs `.btn`) precisam vir **depois** da definição base de `.btn` no arquivo, senão a cascata deixa o verde padrão vencer mesmo a regra mais específica em intenção.

## Observações técnicas

- Geolocalização e câmera (`getUserMedia`) exigem contexto seguro (HTTPS ou `localhost`) — abrindo como `file://` local, o navegador bloqueia essas APIs silenciosamente e cai em fallback (input de arquivo comum sem localização).
- **Auth Google implementado**: botão de usuário no header → login/logout com Firebase Auth.
- **Mensagens de feedback**: `App.mostrarToast(msg, tipo)` centraliza os estados de sucesso (`success`), atenção (`warning`) e erro (`error`) em um toast acessível, com ícone e cores alinhados à paleta do projeto. Avisos de formulário, exportação e permissões usam esse padrão; a confirmação da baixa de saldo continua usando `confirm()` por exigir decisão explícita antes de uma ação destrutiva.
- **App Check recomendado**: reCAPTCHA v3 no Firebase Console para proteger API key.
- **Regras Firestore**: travadas por `request.auth.uid == userId` (cada usuário só acessa seus dados).
- Sem framework, sem bundler: mudanças de estrutura visual podem ficar distribuídas entre `index.html`, `views/*.html`, `assets/css/style.css` e `assets/js/*.js`.

## Deploy (GitHub Pages)

- **Workflow**: `.github/workflows/deploy.yml` — roda a cada push na `main`.
- **Publica**: raiz do repositório (onde está o `index.html`).
- **URL**: `https://capitainprice.github.io/TimeWallet/`.
- **Geração do `config.js`**: o workflow lê o secret `FIREBASE_CONFIG` e gera `config.js` via script Node inline. Aceita tanto JSON puro quanto um snippet colado direto do console do Firebase (`const firebaseConfig = {...}` ou `window.FIREBASE_CONFIG = {...}`), normaliza espaços nos campos e valida que todos os campos obrigatórios (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) estão presentes antes de publicar.
- **Passo a passo**:
  1. Edite o(s) arquivo(s).
  2. `git add <arquivos>`.
  3. `git commit -m "mensagem"`.
  4. `git push` → GitHub Actions faz o deploy automático.
- **Configuração única no GitHub**: Settings → Pages → Source: "GitHub Actions".
- **Visualizar com Playwright global**:
  - Validar abertura básica da página publicada:
    ```bash
    NODE_PATH="$(npm root -g)" node -e "require('module').Module._initPaths(); const { chromium } = require('playwright'); (async() => { const browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); const resp = await page.goto('https://capitainprice.github.io/TimeWallet/', { waitUntil: 'domcontentloaded', timeout: 60000 }); console.log('STATUS=' + (resp && resp.status())); console.log('TITLE=' + await page.title()); console.log('URL=' + page.url()); await page.waitForTimeout(5000); console.log('BODY=' + ((await page.textContent('body')) || '').replace(/\\s+/g,' ').trim().slice(0,500)); await browser.close(); })().catch(err => { console.error(err.stack || err); process.exit(1); });"
    ```
  - Tirar screenshot mobile da versão publicada:
    ```bash
    playwright screenshot --device="iPhone 11" --full-page --timeout=120000 "https://capitainprice.github.io/TimeWallet/" "/c/Users/guiem/TimeWallet/.playwright-homepage.png"
    ```
  - Se o screenshot der timeout, usar a validação com `domcontentloaded` acima para inspecionar status, título e conteúdo inicial.

## Configuração Firebase (local, não commitado)

Arquivo `config.js` na raiz (adicionado ao `.gitignore`):
```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Carregado no `index.html` **antes** do script principal (linha 12).
