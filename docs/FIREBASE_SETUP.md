# Firebase Setup — TimeWallet (Banco de Horas)

Documentação completa dos passos para configurar Firebase Auth (Google) + Firestore no projeto.

---

## 1. Criar projeto no Firebase Console

1. Acesse: https://console.firebase.google.com
2. **Add project** → Nome: `timewallet-banco-horas` (ou seu nome)
3. **Desative** Google Analytics (não necessário)
4. **Create project**

---

## 2. Ativar Authentication (Google Sign-In)

1. Menu lateral **Authentication** → **Get started**
2. Aba **Sign-in method** → **Google** → **Enable**
3. Em **Authorized domains**, adicione:
   - `localhost` (teste local)
   - `capitainprice.github.io` (produção GitHub Pages)
4. **Save**

---

## 3. Criar Firestore Database

1. Menu lateral **Firestore Database** → **Create database**
2. **Start in test mode** (temporário — vamos travar nas rules)
3. Região: **southamerica-east1 (São Paulo)** → **Enable**

---

## 4. Registrar Web App e obter credenciais

1. No topo: **⚙️ Project settings** (engrenagem) → aba **General**
2. Role até **Your apps** → clique no ícone **</> (Web)**
3. App nickname: `TimeWallet Web` → **Register app**
4. **Copie o objeto `firebaseConfig`** (JSON com `apiKey`, `authDomain`, `projectId`, etc.)

> ⚠️ **Não use o snippet CDN** — copie só o objeto JSON.

---

## 5. Criar `config.js` local (não commitado)

Na raiz do projeto, crie `config.js`:

```js
// config.js — NÃO COMMITAR (já está no .gitignore)
window.FIREBASE_CONFIG = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};
```

> `storageBucket` em projetos novos do Firebase vem no formato `SEU_PROJETO.firebasestorage.app` (não mais `.appspot.com`) — copie o valor exato que o Console te der no passo 4, não confie neste placeholder.

O `.gitignore` já inclui `config.js` — **nunca commite este arquivo**.

---

## 6. Configurar Regras de Segurança do Firestore (OBRIGATÓRIO)

No console **Firestore → Rules**, substitua **tudo** por:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

> A regra usa `{document=**}` (recursiva) porque o app grava em **duas** subcoleções por usuário — `registros` e `baixas`. Uma regra que trave só `registros/{docId}` deixa `baixas` sem regra alguma, e toda leitura de `baixas` (usada pelo Banco de Horas) cai em **negado por padrão**, com erro `Missing or insufficient permissions` — quebrando a tela inteira mesmo com login correto.

→ **Publish**

**Por que isso importa:** Garante que cada usuário só lê/escreve **seus próprios dados**. Ninguém acessa dados de outro usuário.

---

## 7. (Recomendado) Ativar App Check

Protege sua API key contra uso indevido:

1. Menu lateral **App Check** → **Get started**
2. Provedor: **reCAPTCHA v3** → registre seu site
3. Domínios: `localhost`, `capitainprice.github.io`
4. **Save**

---

## 8. Limitar usuários Google a 3 contas

O frontend não consegue impor esse limite com segurança. O projeto inclui as Cloud Functions `limitarUsuariosGoogle` e `removerUsuarioGoogleDoLimite` em `functions/index.js`.

`limitarUsuariosGoogle` usa o gatilho `beforeUserCreated`, consulta as contas Google reais já existentes e usa uma transação no Firestore para rejeitar o quarto cadastro antes da criação da conta. `removerUsuarioGoogleDoLimite` reduz o contador quando uma conta Google é excluída.

### Configuração no terminal local

Execute os comandos abaixo **na raiz local do projeto**, em `C:\Users\guilherme.goncalves\TimeWallet`. O arquivo `firebase.json` já existe, então não é necessário executar `firebase init functions` novamente.

```powershell
cd C:\Users\guilherme.goncalves\TimeWallet
npm install -g firebase-tools
firebase login
firebase use SEU_PROJECT_ID
cd functions
npm install
cd ..
firebase deploy --only functions
```

Substitua `SEU_PROJECT_ID` pelo `projectId` do projeto no Firebase Console. O `config.js` local deste repositório não contém as credenciais do projeto; em produção, o `config.js` é gerado pelo workflow a partir do secret `FIREBASE_CONFIG`.

### Configuração no Firebase Console

Depois do deploy, no Firebase Console:

1. Abra **Authentication → Settings → Identity Platform** e habilite o recurso, caso seja solicitado.
2. Confirme que as **blocking functions** estão habilitadas para o projeto.
3. Em **Authentication → Users**, confirme que existem no máximo 3 contas Google ativas.
4. Teste uma quarta conta em uma janela anônima. Ela deve ser rejeitada antes da criação.

O documento `config/limiteUsuarios` é acessado somente pelo Admin SDK da Function. A contagem real do Authentication inclui usuários criados antes do deploy.

## 9. Estrutura de dados no Firestore

```
users/{uid}/
  registros/{YYYY-MM-DD}/
    saida: "HH:MM"           // horário de saída
    extraMin: number         // minutos extra (negativo = desconto)
    comprovante: "data:image/...base64"  // foto base64
    comprovanteNome: "arquivo.jpg"
    comprovantePeriodo: "periodo 08"     // rótulo do período no momento do registro
    localizacao: {           // opcional — só existe depois da geolocalização resolver
      lat: number,
      lng: number,
      address: "string"      // resolvido via reverseGeocode (Nominatim/OSM)
    }

  baixas/{YYYY-MM-DD}/
    data: "YYYY-MM-DD"
    horario: "HH:MM"
    saldoBaixado: number      // saldo (minutos) baixado nesse momento
    comprovante: "data:image/...base64"   // foto da baixa
    comprovanteNome: "arquivo.jpg"
    recibo: "data:image/...base64"        // comprovante gerado em canvas
    reciboNome: "arquivo.png"
```

---

## 10. Como o app usa (código)

- **`index.html`** carrega `config.js` antes do script principal (linha 12)
- `Store` abstrai dual-mode:
  - Autenticado → Firestore (`users/{uid}/registros/{dateKey}` e `users/{uid}/baixas/{dateKey}`)
  - Não autenticado → `localStorage` (fallback original)
- Todos métodos `Store` são **async** (`getAll`, `get`, `set`, `getAllBaixas`, `addBaixa`)
- **Migração automática**: no 1º login, dados do `localStorage` vão para Firestore
- **Offline**: Firestore persistence ativada (`enablePersistence`) — o SDK loga um aviso de depreciação (`enableMultiTabIndexedDbPersistence` será substituído por `FirestoreSettings.cache`); não afeta o funcionamento hoje, mas é troca pendente numa atualização futura do Firebase SDK

---

## 11. Testar local

**Opção A: Deploy direto (mais simples, HTTPS real)**
```bash
git add index.html .gitignore
git commit -m "Firebase configurado"
git push
# Acesse: https://capitainprice.github.io/TimeWallet/
```

**Opção B: Local com HTTPS válido (mkcert)**
```bash
# Uma vez:
mkcert -install
mkcert localhost 127.0.0.1 ::1

# Rodar:
npx http-server -S -C localhost+2.pem -K localhost+2-key.pem -p 3000
# Abra https://localhost:3000
```

**Opção C: Local HTTP (câmera/geolocalização NÃO funcionam)**
```bash
npx serve -l 3000
# Abra http://localhost:3000
```

---

## 12. Checklist de validação

- [ ] Projeto Firebase criado
- [ ] Authentication → Google enabled + domínios autorizados
- [ ] Firestore Database criado
- [ ] Regras publicadas (travadas por `request.auth.uid`)
- [ ] `config.js` criado com credenciais reais
- [ ] `config.js` no `.gitignore`
- [ ] App Check ativado (opcional)
- [ ] Cloud Functions `limitarUsuariosGoogle` e `removerUsuarioGoogleDoLimite` publicadas (limite de 3 contas)
- [ ] Teste: login Google funciona
- [ ] Teste: registro salva no Firestore (console → Data)
- [ ] Teste: logout volta para localStorage
- [ ] Deploy no GitHub Pages funcionando

---

## 13. Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| `Invalid API key` | `config.js` errado ou não carrega | Verifique se `config.js` carrega (Network tab), credenciais corretas |
| `Permission denied` | Rules não publicadas ou erradas | Publique rules (passo 6) |
| `Firebase not initialized` | `config.js` carrega depois do script | `config.js` deve estar **antes** do script principal no HTML |
| Câmera não abre | HTTP em vez de HTTPS | Use HTTPS (deploy ou mkcert) |
| `config.js` 404 | Servidor não serve da raiz | Rode `serve`/`http-server` na pasta do projeto |

---

## 14. Próximos passos (futuro)

- [ ] Firebase Storage para fotos (hoje base64 no Firestore)
- [ ] Sincronização em background / conflict resolution
- [ ] Backup automático / export JSON
- [x] Limite de 3 usuários Google no backend