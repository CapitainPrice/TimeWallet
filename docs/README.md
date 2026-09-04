# TimeWallet — Banco de Horas

App pessoal para controle de banco de horas com foco mobile. O usuário registra a saída do dia com comprovante por imagem, cálculo automático de saldo e histórico por período.

## Acesso

**🌐 https://capitainprice.github.io/TimeWallet/**

## Funcionamento e regras de negócio

Tudo sobre como o app calcula e se comporta, num lugar só.

- **Ponto fixo**: entrada sempre às **15:00**; o usuário só registra o horário de **saída**.
- **Cálculo do tempo extra**:
  - Saída antes das **15:00** → gera **desconto**.
  - Saída entre **15:00 e 15:10** (tolerância) → **neutro**, saldo zero.
  - Saída a partir das **15:11** → gera **tempo extra**, descontando a tolerância.
  - Regra vale em todo lugar que mostra tempo extra: home, detalhe do dia e saldo do Banco de Horas.
- **Dias úteis**: sábados, domingos e feriados nacionais brasileiros (fixos + móveis, calculados via algoritmo de Páscoa) não são clicáveis e não contam como pendência.
- **Períodos de pagamento**: a lógica de períodos usa a configuração definida no app (padrão `26 → 25`), não o mês calendário fixo. Calendário e Banco de Horas navegam pelos **12 períodos do ano civil** (janeiro a dezembro), mas só mostram os que já têm pelo menos 1 registro — mais o período atual, sempre disponível mesmo vazio. Quando o ano vira, a lista de períodos reseta sozinha para o novo ano.
- **Trava por primeiro login**: no Calendário, dias anteriores ao seu primeiro login no app não podem ser registrados/abertos — isso é independente de qual período você está navegando.
- **Baixa de saldo** (Banco de Horas): tira foto, confirma, salva data/horário/saldo baixado/foto e gera comprovante em imagem. A partir da baixa, o saldo acumulado do ano zera e volta a somar só registros posteriores — nada é apagado, só para de contar.
- **Comprovante de registro**: cada registro diário (câmera ou anexo manual) gera automaticamente um recibo com a foto, data, usuário, horário, saldo e localização — não é só a foto crua. O nome do arquivo carrega a posição do dia dentro do período (`comprovante_01_...`, `comprovante_02_...`), calculada pela data do registro, não pela ordem em que você de fato salvou.
- **Persistência**: **autenticado** → salva no Firestore; **não autenticado** → salva em `localStorage`. No primeiro login, os dados locais migram automaticamente para o Firestore.
- **⚠️ Limpeza automática de dados antigos**: a partir de 8 de janeiro de cada ano, o app apaga **permanentemente e sem aviso** todos os registros e baixas do ano civil anterior inteiro. Não tem confirmação, não tem lixeira — se precisar guardar histórico de anos anteriores, baixe os comprovantes/relatórios antes disso.
- **Registro único por dia**: só permite 1 registro por dia na home, destravando automaticamente após a meia-noite.

## Funcionalidades atuais

- **Registro diário único na home** — só permite 1 registro por dia e destrava automaticamente após a meia-noite (exige login, câmera bloqueada se não autenticado)
- **Registro com comprovante** por câmera ou galeria, com recibo gerado automaticamente (foto + data + usuário + horário + saldo + localização), não a foto crua
- **Banco de Horas e Calendário navegam pelos mesmos 12 períodos do ano civil**, mostrando só os que já têm registro (mais o atual, sempre disponível)
- **Resumo acumulado do ano** com total de registros, extras, descontos e saldo acumulado
- **Histórico de registros** paginado no Banco de Horas (**6 registros por página**)
- **Select de períodos** respeitando a configuração real do período do app (ex.: `26/08/2026 – 25/09/2026`)
- **Configuração do período** via botão de engrenagem no Calendário (`periodSettingsBtn`), que abre modal pra trocar o dia de início/fim do período (padrão 26→25), salvo em `localStorage`
- **Download dos comprovantes do período em ZIP** com nome intuitivo, numerado pela posição do dia no período
- **Registro manual no calendário** pra dias liberados (a partir do seu primeiro login), com modal de seleção de horário
- **Login com Google + sincronização no Firebase/Firestore**
- **Fallback em `localStorage`** quando não houver autenticação
- **Geocodificação reversa** (Nominatim/OSM) resolve endereço a partir de lat/lng, com cache em memória
- **Splash screen**, navegação mobile e exportação de relatório em imagem
- **Limpeza automática (destrutiva)** de registros/baixas do ano anterior, a partir de 8 de janeiro
- **Identidade visual**: header verde-acinzentado escuro (`#5F674F`), tela de registro manual com botões de destaque (`#7B846D`) e fundos neutros (`#F0F0F0`) no lugar do verde-claro padrão, menu do usuário com item "Sair" centralizado, ícone/badge do registro salvo verde no tempo extra e vermelho no desconto
- **Mensagens de feedback**: toasts de sucesso, atenção e erro com ícone, contraste e cores alinhados à identidade visual; validações e falhas não usam mais `alert()` nativo

## Tecnologias

- HTML + CSS + JavaScript puro
- Firebase Authentication (Google)
- Cloud Firestore
- Geolocation API
- MediaDevices / `getUserMedia`
- Canvas API
- JSZip
- GitHub Pages + GitHub Actions

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
