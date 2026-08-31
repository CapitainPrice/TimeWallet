# TimeWallet — Banco de Horas

App pessoal para controle de banco de horas com foco mobile. O usuário registra a saída do dia com comprovante por imagem, cálculo automático de saldo e histórico por período.

## Acesso

**🌐 https://capitainprice.github.io/TimeWallet/**

## Funcionalidades atuais

- **Registro diário único na home** — só permite 1 registro por dia e destrava automaticamente após a meia-noite
- **Registro com comprovante** por câmera ou galeria
- **Banco de Horas por ciclo** com ciclo atual de **6 períodos** baseado no primeiro login do usuário
- **Resumo acumulado do ciclo** com total de registros, extras, descontos e saldo acumulado
- **Histórico de registros** paginado no Banco de Horas (**6 registros por página**)
- **Select de períodos do ciclo** respeitando a configuração real do período do app (ex.: `26/08/2026 – 25/09/2026`)
- **Configuração do período** via botão de engrenagem no Calendário (`periodSettingsBtn`), que abre modal pra trocar o dia de início/fim do ciclo (padrão 26→25), salvo em `localStorage`
- **Download dos comprovantes do período em ZIP** com nome intuitivo
- **Calendário limitado ao ciclo atual** e à data de liberação baseada no primeiro login (trava adicional de 6 meses pra navegação/download de comprovantes)
- **Registro manual no calendário** apenas para dias liberados dentro do ciclo, com modal de seleção de horário
- **Login com Google + sincronização no Firebase/Firestore**
- **Fallback em `localStorage`** quando não houver autenticação
- **Geocodificação reversa** (Nominatim/OSM) resolve endereço a partir de lat/lng, com cache em memória
- **Splash screen**, navegação mobile e exportação de relatório em imagem

## Regras principais do app

- O ponto base continua sendo **15:00**
- Existe tolerância até **15:10** para saldo neutro
- Saída antes das **15:00** gera desconto
- Saída após **15:10** gera tempo extra
- A lógica de períodos usa a configuração definida no app, não mês calendário fixo

## Ciclo de 6 períodos

O app cria um ciclo de **6 períodos** a partir do **primeiro login** do usuário.

Exemplo com período configurado de `26` até `25`:

- `26/08/2026 – 25/09/2026`
- `26/09/2026 – 25/10/2026`
- `26/10/2026 – 25/11/2026`
- `26/11/2026 – 25/12/2026`
- `26/12/2026 – 25/01/2027`
- `26/01/2027 – 25/02/2027`

Quando o ciclo termina, o app avança automaticamente para os próximos 6 períodos.

## Tecnologias

- HTML + CSS + JavaScript puro
- Firebase Authentication (Google)
- Cloud Firestore
- Geolocation API
- MediaDevices / `getUserMedia`
- Canvas API
- JSZip
- GitHub Pages + GitHub Actions

## Persistência

O app trabalha em dois modos:

- **Autenticado**: salva em `Firestore`
- **Não autenticado**: salva em `localStorage`

No primeiro login, os dados locais podem ser usados junto com a experiência autenticada do usuário.

## Deploy

O deploy é feito pelo GitHub Actions ao enviar mudanças para a branch `main`.

### Requisitos do deploy

- GitHub Pages configurado para **GitHub Actions**
- Secret `FIREBASE_CONFIG` configurado no repositório

O workflow publica um `config.js` em tempo de deploy a partir do secret do Firebase. O script aceita tanto JSON puro quanto um snippet `firebaseConfig = {...}`/`window.FIREBASE_CONFIG = {...}` colado direto do console do Firebase, validando os campos obrigatórios.

## Desenvolvimento local

Para rodar localmente:

```bash
npx serve -l 3000
```

Depois abra:

```text
http://localhost:3000
```

Para recursos como câmera e geolocalização, prefira ambiente seguro (`https` ou `localhost`, dependendo do navegador/dispositivo).

## Estrutura

```text
.
├── assets/
│   ├── css/
│   └── js/
├── docs/
├── index.html
├── logs/
├── views/
└── .github/workflows/deploy.yml
```

## Observações

- O app foi desenhado com foco em uso pessoal e mobile
- Os períodos visuais do Banco de Horas e do Calendário seguem a mesma lógica de ciclo
- O download de comprovantes considera o período selecionado no ciclo atual
