# Relatório: Implementação de Upload de Imagens no Sistema de Pedidos

**Data:** 01/05/2026  
**Status atual:** Frontend implementado e funcionando. Backend com problema a investigar.

---

## O que foi implementado

### Objetivo
Permitir salvar imagens de **Mockup** e até **10 Artes/Estampas** por pedido, organizadas no Google Drive por Ano/Mês, com nomenclatura padronizada.

### Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `index.html` | Adicionada seção `#secaoImagens` com upload de mockup e até 10 artes. Cache-busting `?v=2` nos scripts. |
| `script.js` | Funções de preview, coleta de imagens em base64, integração com `salvarPedido()`. |
| `styles.css` | Estilos para os blocos de upload e previews de imagem. |
| `print-os-gp.js` | Usa a URL do Drive salva para o mockup na impressão. |
| `Code.gs` | Funções de Drive (upload, pasta Ano/Mês), novas colunas na planilha, integração no `doPost`/`salvarPedido`. |

---

## Onde as imagens são salvas

- **Google Drive** → pasta raiz: `SistemaPedidos/`
- Organização: `SistemaPedidos/{Ano}/{Mês}/`
- Exemplo: `SistemaPedidos/2026/Maio/`

### Nomenclatura dos arquivos
```
NOME_CLIENTE_IDBUSCA_MOCKUP.jpg
NOME_CLIENTE_IDBUSCA_ARTE1.png
NOME_CLIENTE_IDBUSCA_ARTE2.jpg
...
```
Exemplo: `TESTE_1313_MOCKUP.jpg`

### Onde ficam as URLs na planilha
A aba `PEDIDOS` no Google Sheets tem 11 novas colunas ao final:
- `URL Mockup`
- `URL Arte 1` até `URL Arte 10`

---

## Status dos componentes

### ✅ Frontend (GitHub Pages)
- URL: `https://luucas031bh.github.io/sistema-pedidos/index.html`
- Seção "🖼️ Imagens do Pedido" visível no formulário
- Upload de mockup + até 10 artes funcionando visualmente
- Preview de thumbnail ao selecionar arquivo
- Coleta de base64 implementada em `coletarImagens()`
- Dados enviados via POST para o Apps Script

### ✅ Planilha Google Sheets
- Colunas `URL Mockup` e `URL Arte 1`..`URL Arte 10` **já existem** na aba PEDIDOS
- Foram criadas ao rodar `expandirCabecalhoUrlImagens()` no Apps Script

### ✅ Google Drive
- Pasta `SistemaPedidos` **foi criada** (confirmado ao rodar `obterPastaRaiz()`)
- DriveApp está **autorizado**

### ❌ Salvamento das imagens (problema em aberto)
- As imagens **não aparecem** na pasta do Drive após salvar um pedido
- O pedido em si é salvo com sucesso ("Pedido salvo" aparece)
- Mas as colunas `URL Mockup` ficam vazias na planilha
- A causa exata **ainda não foi identificada** — precisa dos logs de execução

---

## Diagnóstico pendente

### O que precisa ser feito para identificar o erro

**Passo 1 — Testar coleta no frontend (console do navegador):**
1. Abra o pedido no sistema
2. Selecione uma imagem pequena (< 500KB) na seção "Imagens do Pedido"
3. Abra o console (`F12`) **antes** de clicar em Salvar
4. Cole e execute:
```javascript
coletarImagens().then(img => console.log('IMAGENS:', JSON.stringify({
  temMockup: !!img?.mockup,
  base64Tamanho: img?.mockup?.base64?.length || 0,
  tipo: img?.mockup?.tipo || 'nenhum'
})))
```
- Se retornar `temMockup: true` e `base64Tamanho > 0` → frontend OK, problema é no backend
- Se retornar `temMockup: false` → problema na coleta da imagem no frontend

**Passo 2 — Ver logs do backend (Apps Script):**
1. Salve um pedido com imagem selecionada
2. Vá em [script.google.com](https://script.google.com) → **Execuções**
3. Clique na execução mais recente
4. Procure pelas linhas de log:
   - `[doPost] imagens recebido: SIM...` → imagem chegou ao backend
   - `[Drive] Salvando mockup: ...` → tentativa de salvar no Drive
   - `[Drive] Mockup salvo: ...` → sucesso
   - `Erro mockup: ...` → falha no Drive

**Passo 3 — Ver aba Network do DevTools:**
1. Abra o DevTools (`F12`) → aba **Network** (Rede)
2. Salve um pedido com imagem
3. Procure a requisição para `script.google.com`
4. Verifique o status (deve ser 200) e a resposta JSON

---

## Como atualizar o Apps Script

**IMPORTANTE:** O arquivo `Code.gs` neste repositório **não vai automaticamente** para o Apps Script. Toda vez que o `Code.gs` for modificado aqui no Cursor, é preciso:

1. Abrir o arquivo `Code.gs` no Cursor
2. Copiar todo o conteúdo (`Ctrl+A` → `Ctrl+C`)
3. Acessar [script.google.com](https://script.google.com) → abrir o projeto
4. Clicar no `Code.gs` no painel esquerdo
5. Selecionar tudo (`Ctrl+A`) e colar (`Ctrl+V`)
6. Salvar (`Ctrl+S`)
7. **Implantar** → **Gerenciar implantações** → ✏️ → **Nova versão** → **Implantar**

---

## Funções de manutenção no Apps Script

Essas funções podem ser executadas manualmente no editor do Apps Script:

| Função | Para que serve | Quando rodar |
|---|---|---|
| `expandirCabecalhoUrlImagens()` | Adiciona as 11 colunas de URL na planilha | Uma vez, após o primeiro deploy com imagens |
| `obterPastaRaiz()` | Cria/localiza a pasta `SistemaPedidos` no Drive | Para testar autorização do Drive |
| `expandirCabecalhoPedidos()` | Adiciona colunas de produção na planilha | Migração de planilhas antigas |

---

## Código relevante — frontend

### Função `coletarImagens()` em `script.js` (linha ~355)
Coleta os arquivos selecionados e converte para base64. Retorna `null` se nenhuma imagem nova foi selecionada.

### Função `salvarPedido()` em `script.js` (linha ~1053)
Inclui as imagens no payload JSON enviado ao Apps Script via POST.  
A condição `temImagensNovas` só envia imagens se houver **novas** selecionadas (não usa base64 para URLs já salvas).

---

## Código relevante — backend (Code.gs)

### `resolverUrlsImagens()` (linha ~425)
Decide quais URLs gravar na planilha:
- Se chegou `base64` → faz upload no Drive e usa a nova URL
- Se chegou `urlExistente` → preserva a URL já salva
- Se `imagens` é `null` → lê URLs diretamente da linha atual da planilha (preservação automática)

### `salvarImagemNoDrive()` (linha ~72)
Decodifica o base64, cria o arquivo no Drive e retorna a URL pública no formato:
```
https://drive.google.com/uc?id=FILE_ID&export=view
```

---

## Possíveis causas do problema (ainda não confirmadas)

1. **Apps Script não reimplantado com a versão mais recente** → solução: repetir o processo de deploy
2. **Timeout na execução** — imagem muito grande pode causar lentidão no upload → testar com imagem < 200KB
3. **Erro silencioso no Drive** — o bloco `try/catch` em `resolverUrlsImagens` captura erros mas não os propaga → verificar os logs de execução
4. **Problema de autorização intermitente** — o DriveApp foi autorizado mas pode precisar de reautorização → rodar `obterPastaRaiz()` manualmente de novo

---

## Checklist para retomar o trabalho

- [ ] Rodar o comando `coletarImagens()` no console do navegador para confirmar que o frontend coleta a imagem corretamente
- [ ] Verificar os logs de execução no Apps Script após salvar um pedido com imagem
- [ ] Confirmar que a versão mais recente do `Code.gs` está no Apps Script (com as linhas de log `[doPost]` e `[Drive]`)
- [ ] Testar com uma imagem pequena (< 200KB)
- [ ] Verificar se a pasta `SistemaPedidos/2026/Maio/` existe no Google Drive após o teste
