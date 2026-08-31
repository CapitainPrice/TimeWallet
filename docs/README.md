# TimeWallet — Banco de Horas

App pessoal para controle de banco de horas de estágio. O usuário bate ponto de entrada fixo às **15:00** e registra o horário de saída, calculando automaticamente o tempo extra (ou desconto, se saiu antes da hora).

## Acesso

**🌐 https://capitainprice.github.io/TimeWallet/**

Funciona 100% no navegador do celular — sem instalar nada.

## Funcionalidades

- **Registro de saída** via câmera in-app (selfie) + geolocalização automática
- **Splash screen** com logo/nome da empresa na abertura da home
- **Calendário** com navegação por período configurável e acesso ao detalhe do dia
- **Banco de Horas** com saldo do período, lista paginada e exportação de relatório em imagem (PNG)
- **Registro de mudanças** em `logs/patchNotes/` e `logs/versions/`
- **Feriados brasileiros** (fixos + móveis via algoritmo de Páscoa)
- **Persistência local** (`localStorage`) — pronto para migrar para Firebase
- **Offline-first** — abre direto no navegador (`file://` ou HTTPS)

## Tecnologias

- HTML + CSS + JS puro (sem build, sem framework, sem dependências)
- `getUserMedia` (câmera frontal) + Geolocation API
- Canvas API para geração de imagem de comprovante
- Nominatim (OpenStreetMap) para reverse geocoding
- GitHub Pages + GitHub Actions (deploy automático)

## Deploy

```bash
git add index.html
git commit -m "mensagem"
git push
# GitHub Actions faz o deploy automático
```

> **Configuração única no GitHub**: Settings → Pages → Source: **"GitHub Actions"**

## Estrutura

```
.
├── assets/
├── docs/
├── index.html
├── logs/
│   ├── patchNotes/
│   └── versions/
├── views/
└── .github/workflows/deploy.yml
```

## Registro de alterações

Sempre que qualquer arquivo do projeto for alterado:

1. criar um arquivo `.md` em `logs/versions/` com data, arquivos alterados e itens/campos modificados;
2. usar `logs/patchNotes/` para notas funcionais mais amplas;
3. manter `docs/CLAUDE.md` e `docs/README.md` sincronizados com a mudança.

O histórico passa a fazer parte do fluxo padrão de manutenção.

---

Desenvolvido para uso pessoal — foco 100% mobile, sem firulas.