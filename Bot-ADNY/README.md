# Bot ADNY — instalação

## Pré-requisito: Node.js

Instale a versão **LTS (18 ou superior)** em https://nodejs.org/ e confira no PowerShell:

```powershell
node -v
npm -v
```

## Dependências do projeto

Na pasta deste repositório:

```powershell
cd "C:\Users\PC SUBLIMAÇÃO\Documents\GitHub\sistema-pedidos\Bot-ADNY"
npm install
```

### Windows: erro “execução de scripts foi desabilitada” (`npm.ps1`)

O PowerShell bloqueia o `npm` quando ele tenta rodar o script `npm.ps1`. **Três jeitos** (use um):

1. **Prompt de Comando (cmd)** — abra `cmd.exe`, vá até a pasta `Bot-ADNY` e rode `npm install` (o cmd usa `npm.cmd`, sem esse bloqueio).
2. **Chamar o launcher `.cmd` no PowerShell:**  
   `npm.cmd install` e depois `npm.cmd start` (em muitos PCs isso já basta).
3. **Liberar scripts só para seu usuário** (uma vez):

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Alternativa: na pasta do projeto, dê duplo clique em **`install.bat`** para instalar; **`start.bat`** para subir o servidor.

## Configuração

```powershell
copy .env.example .env
```

Edite `.env` com os valores reais (Meta, URL do Apps Script, grupo permitido, etc.).

## Rodar

```powershell
npm start
```

Desenvolvimento com reinício automático:

```powershell
npm run dev
```

Teste: abra `http://127.0.0.1:3000/health` — deve responder JSON com `"ok": true`.

## Webhook WhatsApp (Meta)

1. No app Meta, configure a URL de callback (com **HTTPS**, ex. túnel ngrok):  
   `https://SEU_HOST/webhook/whatsapp`
2. Defina o mesmo **Verify Token** em `META_VERIFY_TOKEN` no `.env`.
3. Depois da verificação GET, eventos chegam em **POST** no mesmo caminho.
4. Se preencher `META_APP_SECRET`, o servidor valida o cabeçalho `X-Hub-Signature-256` (recomendado em produção).
5. `ALLOWED_GROUP_IDS`: com um ou mais IDs, o bot **só responde** a mensagens de grupo cujo `group_id` está na lista (útil para um único grupo). Deixe vazio **só em teste**.
6. Com `LOG_WEBHOOK_BODY=1`, o payload aparece no console — útil para descobrir o `group_id` do grupo.

### Comandos no grupo (texto)

O texto deve conter o gatilho (padrão **ADNY**) ou começar com `/adny`. Exemplos: `ADNY abertos`, `/adny busca Maria`, `ADNY relatorio 2025-01-01 2025-01-31`.

## Túnel HTTPS (webhook Meta)

Para testes locais, use **ngrok** ou **Cloudflare Tunnel** e aponte para a porta do `PORT` (padrão 3000). O Meta exige URL HTTPS.

### ngrok no Windows

1. Instale (se ainda não tiver), por exemplo: `winget install Ngrok.Ngrok`
2. **Conta gratuita:** cadastre-se em https://dashboard.ngrok.com e copie o **Authtoken**.
3. Registre o token **uma vez** (feche e reabra o terminal depois do winget, se `ngrok` não for reconhecido):

```powershell
ngrok config add-authtoken SEU_TOKEN_AQUI
```

4. Deixe o bot rodando (`start.bat` ou `npm.cmd start`) e, **em outro terminal**, na mesma porta do `.env`:

```powershell
ngrok http 3000
```

5. Use a URL **Forwarding** `https://….ngrok-free.app` que aparece na tela. O webhook da Meta fica:  
   `https://….ngrok-free.app/webhook/whatsapp`  
   (a URL muda a cada execução no plano gratuito, salvo domínio reservado.)
6. Painel local do ngrok (inspeção): http://127.0.0.1:4040

**Erros comuns**

- `ERR_NGROK_4018` — falta `ngrok config add-authtoken`.
- `ERR_NGROK_3200` endpoint offline — o comando `ngrok http` não está rodando **ou** o bot não está na porta correta.
