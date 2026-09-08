# TimeWallet — Banco de Horas

App pessoal para controle de banco de horas, focado em uso no celular. Registra a saída do dia com foto de comprovante, calcula o saldo automaticamente e guarda o histórico por período.

## Acesso

**🌐 https://capitainprice.github.io/TimeWallet/**

## Como usar

### Registrar o dia (tela inicial)

1. Abra o app e toque no botão de câmera.
2. Tire uma foto do comprovante (ou escolha da galeria).
3. Confirme — o horário de saída e a localização são preenchidos sozinhos.
4. O app calcula na hora se deu tempo extra, desconto ou neutro, e salva.

Só dá pra registrar 1 vez por dia; a trava libera de novo à meia-noite.

### Calendário

- Mostra o mês com os dias já registrados (verde = extra, vermelho = desconto, cinza = neutro).
- Fins de semana e feriados aparecem apagados e não são clicáveis.
- Clique num dia útil sem registro pra abrir o formulário de **registro manual** (horário de saída + comprovante).
- Clique num dia já registrado pra ver o detalhe (horário, saldo, localização, comprovante).
- O botão de engrenagem abre a configuração do **período de pagamento** (padrão dia 26 ao dia 25) e do **horário do ponto** (padrão 15:00).
- O botão "Exportar relatório" gera uma imagem com a tabela do período inteiro.

### Banco de Horas

- Mostra o saldo acumulado do ano e quantos registros foram extras/descontos.
- **Histórico de relatórios**: a cada período fechado (ao registrar o último dia útil dele), o app já salva sozinho a imagem do relatório aqui — é só baixar quando quiser.
- **Histórico de registros**: lista dia a dia do período selecionado, com paginação.
- **Baixar comprovantes do período**: gera um ZIP com todas as fotos de comprovante do período escolhido.
- **Dar baixa no saldo**: tira uma foto de confirmação e zera o saldo acumulado a partir daquele momento (registros antigos continuam no histórico, só param de contar no total).
- Aba "Baixas" mostra o histórico de baixas já feitas.

### Login

Login com Google sincroniza os registros entre aparelhos (Firestore). Sem login, os dados ficam salvos só naquele navegador.

## Base de cálculo

- Existe um horário de referência configurável (o "ponto", padrão **15:00**) e uma tolerância fixa de **10 minutos** depois dele.
- Saída **antes** do horário do ponto → desconta o quanto faltou.
- Saída **dentro da tolerância** (ponto até ponto+10min) → **neutro**, não conta nada.
- Saída **depois da tolerância** → soma como tempo extra, já descontando os 10 minutos de tolerância.

Essa regra vale em qualquer lugar que mostre tempo extra: card da tela inicial, detalhe do dia no Calendário, e saldo do Banco de Horas.

---

Documentação técnica completa (arquitetura, estrutura de dados, decisões de implementação): [`docs/CLAUDE.md`](CLAUDE.md).
Configuração do Firebase (Auth, Firestore, deploy das Cloud Functions): [`docs/FIREBASE_SETUP.md`](FIREBASE_SETUP.md).
