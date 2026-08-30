# Banco de Horas

> **Manutenção deste arquivo**: sempre que uma mudança for feita no `index.html` (regra de cálculo, tela nova, cor, fluxo, estrutura de dados etc.), atualize este `CLAUDE.md` na mesma tarefa, refletindo o estado atual do projeto. Não deixe a documentação dessincronizar do código.

## Proposta

App pessoal para controle de banco de horas de estágio. O usuário bate ponto de entrada fixo às **15:00** (horário do estágio) e usa o app pra registrar o horário de **saída**, calculando automaticamente quanto tempo extra foi feito (ou descontado, se saiu antes da hora). Foco 100% mobile: usado no celular, no fim do expediente, pra tirar uma foto do comprovante e já sair registrado.

Todo o app é **um único arquivo HTML** (`index.html`), sem build, sem dependências externas, sem framework. HTML + CSS + JS puro, abre direto no navegador (double-click ou `file://`).

## Identidade visual

- **Paleta**: verde-oliva como cor primária (`#4A701C`, escuro `#375215`, claro `#E8F0DD`), fundo creme (`#F7F5EE`), texto quase-preto esverdeado (`#20291A`), texto secundário verde-acinzentado (`#7A8570`), vermelho de alerta (`#B3261E`), bege caqui como cor de destaque secundária (`#B9A47C` no botão "Banco de Horas", `#C9B589`/`#EFF1EA` nos estados neutros).
- **Tipografia**: sans-serif do sistema pra UI (labels, botões, inputs); serifada (Georgia) só nos títulos de saudação/cabeçalho de tela ("Bom dia, ...", "Calendário", "Banco de Horas", "Período") — dá o tom "gerado por IA/personalizado" que o projeto buscou.
- **Linguagem visual**: cards brancos arredondados com sombra suave (`--radius:16px`), botões em pílula, ícones SVG inline (sem emoji), hero cards de destaque (fundo verde sólido = positivo, vermelho = negativo, cinza claro `hero-muted` = neutro/zero/placeholder).
- **Layout**: mobile-first, largura máxima 480px centralizada, header verde fixo no topo (só um ícone de logo — relógio — à esquerda, sem texto), sombra lateral esquerda intencional (`box-shadow:-4px 0 20px rgba(0,0,0,.2)`) tanto no `.app` quanto no rodapé fixo, pra dar uma "borda" de profundidade consistente em toda a tela.

## Estrutura de telas

1. **Tela inicial** — saudação personalizada (banco de frases variando por manhã/tarde/noite + nome do usuário, pega uma vez via `prompt()` e guarda em `localStorage`), card "Registro Saída" com botão de câmera, botão "Banco de Horas" (pílula bege com ícone de relógio).
2. **Câmera in-app** (`getUserMedia`, não usa `<input capture>` puro porque no Android isso cai na galeria) — preview ao vivo, captura, confirmação ("Foto ficou boa?" → Mudar / Feito!), aí sim preenche horário atual, salva e captura geolocalização (assíncrono, atualiza o registro quando resolve).
3. **Calendário** (drawer lateral) — navegação por **período de pagamento 26→25** (não mês civil), indicadores visuais por dia: hoje (anel verde + "hoje"), preenchido (fundo verde), pendente/sem registro (borda vermelha), fim de semana/feriado (cinza, não clicável). Clicar num dia sem registro (passado ou hoje) abre formulário de **registro manual** (horário + foto da galeria) direto ali.
4. **Detalhe do dia** — dentro do calendário, mostra horário de ponto (15:00 fixo), horário de saída, localização (link pro Google Maps), tempo extra do dia, comprovante (miniatura + visualizar + baixar).
5. **Banco de Horas** (tela "Registro") — saldo total do período de pagamento atual (card sempre cinza, só o número muda de cor), lista de registros do período dentro de um card (mesmo estilo `.cal-card` do calendário) com navegação por período (‹ ›, independente da navegação do calendário) e paginação numerada (1, 2, 3...) quando os registros não cabem em uma página (8 por página), botão de exportar planilha (CSV) que exporta o período atualmente exibido nessa tela.

## Regra de cálculo do tempo extra

Ponto de referência fixo: **15:00**.

- Saída **antes das 15:00** → desconta. `extra = saída − 15:00` (negativo). Card fica **vermelho**.
- Saída entre **15:00 e 15:10** (tolerância) → **neutro**, não conta nada (`extra = 0`). Card fica **cinza claro** (`hero-muted`).
- Saída **a partir das 15:11** → soma tempo extra, descontando a tolerância. `extra = saída − 15:10`. Card fica **verde**.

Essa regra vale em todo lugar que mostra tempo extra: card da tela inicial, detalhe do dia no calendário e saldo total na tela "Banco de Horas" (aplicado ao saldo somado do período — se o total der exatamente 0, também fica cinza).

## Feriados e dias úteis

Calendário considera **sábado, domingo e feriados nacionais brasileiros** como não-úteis (não clicáveis, não contam pendência). Feriados fixos são hardcoded; feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi) são calculados via algoritmo de Páscoa (Gauss), então funciona pra qualquer ano automaticamente.

## Persistência

Hoje tudo fica em **`localStorage`** (chave `bancoHoras_registros`, um objeto `{ "YYYY-MM-DD": { saida, extraMin, comprovante (base64), comprovanteNome, localizacao } }`), acessado por um objeto `Store` isolado (`get`/`set`/`getAll`) — é o único ponto que precisa mudar pra migrar pro **Firebase** (Firestore + Storage + Auth anônimo), trocando os métodos do `Store` por chamadas assíncronas equivalentes. O resto do app (UI, cálculo, calendário) não depende de como os dados são persistidos.

## Observações técnicas

- Geolocalização e câmera (`getUserMedia`) exigem contexto seguro (HTTPS ou `localhost`) — abrindo como `file://` local, o navegador bloqueia essas APIs silenciosamente e cai em fallback (input de arquivo comum sem localização).
- Item "Usuário" no botão de perfil é placeholder ("Em breve!") — funcionalidade ainda não implementada.
- Sem framework, sem bundler: qualquer mudança é direto no `index.html`.
