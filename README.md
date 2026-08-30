# TimeWallet — Banco de Horas

App pessoal para controle de banco de horas de estágio. O usuário bate ponto de entrada fixo às **15:00** e registra o horário de saída, calculando automaticamente o tempo extra (ou desconto, se saiu antes da hora).

## Acesso

**🌐 https://capitainprice.github.io/TimeWallet/**

Funciona 100% no navegador do celular — sem instalar nada.

## Funcionalidades

- **Registro de saída** via câmera in-app (selfie) + geolocalização automática
- **Calendário** com navegação por período de pagamento (26 → 25)
- **Banco de Horas** com saldo do período, lista paginada e exportação em imagem (PNG)
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
├── index.html           # App completo (HTML + CSS + JS)
├── timewallet_logo_header.svg
├── .github/workflows/deploy.yml
├── CLAUDE.md            # Documentação técnica do projeto
└── .gitignore
```

---

Desenvolvido para uso pessoal — foco 100% mobile, sem firulas.