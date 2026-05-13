# BOT-tipoCS — consulta WhatsApp (Baileys) ao sistema-pedidos

Bot **somente leitura**: envia apenas requisições **GET** ao Web App do Google Apps Script do projeto (mesmo `Code.gs` do repositório). Não altera pedidos.

## Pré-requisitos

- Node.js **18+**
- URL do Web App do Apps Script (`APPS_SCRIPT_URL`) já publicada
- Após alterar `Code.gs`, **implantar nova versão** do Web App no Google Apps Script

## Instalação

### PowerShell bloqueou `npm` (`npm.ps1` / ExecutionPolicy)

O Windows às vezes impede scripts `.ps1`. Use **uma** destas opções:

1. **Prompt de Comando (cmd)** — abra `cmd.exe`, vá até esta pasta e rode `npm install` (o cmd usa `npm.cmd`, sem esse bloqueio).
2. **No PowerShell**, chame o launcher `.cmd`: `npm.cmd install` e depois `npm.cmd start`.
3. **Duplo clique** em `install.bat` nesta pasta (já usa `npm.cmd`).

Para liberar scripts só para seu usuário (uma vez no PowerShell):

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Comandos usuais

```powershell
cd "C:\Users\PC CASA\Documents\GitHub\sistema-pedidos\BOT-tipoCS"
npm.cmd install
copy .env.example .env
```

Ou: `install.bat` → editar `.env` → `start.bat`.

Edite `.env`: `APPS_SCRIPT_URL` (obrigatório), `APPS_SCRIPT_TOKEN` se usar, e opcionalmente **`GEMINI_API_KEY`** para perguntas em linguagem natural (veja seção abaixo).

## Linguagem natural (Gemini)

Com **`GEMINI_API_KEY`** configurada ([Google AI Studio](https://aistudio.google.com/apikey)), depois do gatilho você pode escrever em português, por exemplo:

- *ADNY quantos pedidos estão na etapa Arte?*
- *ADNY quais entregas essa semana?*
- *ADNY peças por tamanho em aberto na cor preta*

O modelo **só escolhe** qual consulta GET fazer; **valores e listas** vêm da planilha (não inventamos totais no lugar do servidor).

Opcional: `GEMINI_MODEL` (padrão no código: **`gemini-2.5-flash`**). Alternativas comuns: `gemini-2.5-flash-lite`, `gemini-flash-latest`. Modelos antigos (ex. `gemini-1.5-flash`) podem retornar **404** — veja [deprecações](https://ai.google.dev/gemini-api/docs/deprecations). Se aparecer **429 / quota**, troque o modelo ou a chave. Frases como *lista de pedidos para entregar essa semana* são reconhecidas **sem** chamar a IA.

## Primeiro uso (QR)

```powershell
npm start
```

Escaneie o QR no terminal ou abra `qrcode.png` na pasta do projeto. A pasta `auth_info/` guarda a sessão (não envie ao Git).

## Comandos (exemplo com gatilho ADNY)

Com **`GEMINI_API_KEY`** no `.env`, pode perguntar em **frase livre** depois do gatilho (a IA só mapeia para consultas já existentes; os dados vêm da planilha).

| Exemplo | Ação |
|--------|------|
| `ADNY lista de pedidos para entregar essa semana` | **Sem IA** — mesma consulta que `entregas semana` |
| `ADNY quantos pedidos na arte?` | Com Gemini: contagem por etapa (ou use `ADNY etapa Arte` sem IA) |
| `ADNY abertos` | Lista pedidos em aberto |
| `ADNY busca Maria` | Busca por termo |
| `ADNY pedido 1234` | Detalhe de um pedido |
| `ADNY relatorio 2025-01-01 2025-01-31` | Relatório agregado (tipo malha) |
| `ADNY etapa Arte` | Quantidade de pedidos na etapa de produção **Arte** |
| `ADNY entregas semana` | Pedidos com data de entrega na **semana atual** (seg–dom, fuso do servidor) |
| `ADNY tamanhos` | Soma de peças por **tamanho** em pedidos em aberto |
| `ADNY tamanhos preta` | Idem, só produtos cuja cor da malha contém `preta` |
| `ADNY ajuda` | Lista de comandos |

## Segurança

- `ALLOWED_GROUP_IDS`: opcional; se preenchido (JIDs de grupo separados por vírgula), o bot **só responde** nesses grupos.
- Não commite `.env` nem `auth_info/`.

## Ações novas no Apps Script

O `Code.gs` passa a expor (GET):

- `action=contarPorEtapaProducao&etapa=Arte`
- `action=listarPedidosEntregaPeriodo&dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD`
- `action=agregarPecasAbertos&cor=preta` (parâmetro `cor` opcional)

## Problemas comuns

- **404 / modelo não encontrado**: use `GEMINI_MODEL=gemini-2.5-flash` (ou `gemini-2.5-flash-lite`) no `.env`; evite `gemini-1.5-flash` (removido/alias inválido em muitas contas). [Deprecações e modelos](https://ai.google.dev/gemini-api/docs/deprecations).
- **429 / quota do Gemini**: modelo mais leve (`gemini-2.5-flash-lite`) ou outra chave; entregas da semana também funcionam **sem** IA (tabela acima).
- **Resposta não é JSON**: URL errada ou Web App não implantado como acesso que retorna JSON.
- **Ação inválida**: Web App ainda na versão antiga do `Code.gs` — republicar implantação.
