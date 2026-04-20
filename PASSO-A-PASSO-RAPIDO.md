# 🚀 PASSO A PASSO RÁPIDO - CRIAR BANCO DE DADOS GOOGLE SHEETS

## ⏱️ Tempo estimado: 10-15 minutos

---

## 📝 PASSO 1: CRIAR GOOGLE SHEETS (2 minutos)

1. Acesse: **https://sheets.google.com**
2. Clique em **"+ Novo"** (ou "Blank spreadsheet")
3. Renomeie para: **"Adonay Confecção - Sistema de Pedidos"**
4. ✅ Planilha criada!

---

## ⚙️ PASSO 2: ABRIR APPS SCRIPT (1 minuto)

1. Na planilha, clique em: **Extensões** → **Apps Script**
2. Nova aba abrirá com o editor
3. **Apague** todo o código que aparece
4. Renomeie o projeto para: **"Sistema Adonay Confecção"**
5. ✅ Apps Script pronto!

---

## 📋 PASSO 3: COLAR CÓDIGO (2 minutos)

1. Abra o arquivo **`Code.gs`** do projeto (está na pasta do sistema)
2. **Ctrl+A** (selecionar tudo) → **Ctrl+C** (copiar)
3. Volte ao Apps Script
4. **Ctrl+V** (colar o código)
5. **Ctrl+S** (salvar) ou clique no ícone 💾
6. ✅ Código colado e salvo!

---

## 🏗️ PASSO 4: CRIAR ABAS DO BANCO (3 minutos)

### 4.1 Executar Função
1. No topo da página, procure o dropdown de funções
2. Selecione: **`criarTodasAbas`**
3. Clique no botão ▶️ **Executar**

### 4.2 Autorizar (PRIMEIRA VEZ)
🔒 **Vai aparecer uma tela de autorização:**

1. Clique em **"Revisar permissões"**
2. Escolha sua conta Google
3. Clique em **"Avançado"** (canto inferior esquerdo)
4. Clique em **"Ir para Sistema Adonay Confecção (não seguro)"**
5. Clique em **"Permitir"**
6. Aguarde a execução terminar

### 4.3 Verificar Criação
1. Volte à aba do Google Sheets
2. Veja se foram criadas **6 abas**:
   - PEDIDOS
   - CUSTOS_MALHAS
   - CUSTOS_MAO_OBRA
   - CUSTOS_ESTAMPAS
   - LOCALIDADES_ESTAMPAS
   - DASHBOARD_DATA

3. ✅ Abas criadas com dados!

---

## 🚀 PASSO 5: FAZER DEPLOY E GERAR URL (5 minutos)

### 5.1 Iniciar Deploy
1. No Apps Script, clique em **"Implantar"** (topo direito)
2. Selecione **"Nova implantação"**
3. Clique no ícone ⚙️ ao lado de "Selecione o tipo"
4. Escolha **"Aplicativo da Web"**

### 5.2 Configurar
Preencha exatamente assim:

```
Descrição: Sistema de Pedidos v1.0
Executar como: Eu (seu.email@gmail.com)
Quem tem acesso: Qualquer pessoa
```

### 5.3 Deploy
1. Clique em **"Implantar"**
2. Vai pedir autorização novamente
3. Clique em **"Autorizar acesso"**
4. Aguarde o processamento

### 5.4 COPIAR URL (IMPORTANTE! 🎯)
Após o deploy, aparecerá uma tela com a **URL do aplicativo da Web**:

```
https://script.google.com/macros/s/AKfycby...muitas letras.../exec
```

**📋 COPIE ESTA URL COMPLETA!**

✅ Deploy concluído e URL gerada!

---

## 🔗 PASSO 6: CONFIGURAR NO SISTEMA (2 minutos)

1. Abra o arquivo **`config.js`** do projeto
2. Procure a linha 11:
```javascript
APPS_SCRIPT_URL: 'COLE_A_URL_DO_APPS_SCRIPT_AQUI',
```

3. **Substitua** por sua URL (manter as aspas):
```javascript
APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby...sua-url.../exec',
```

4. **Salve o arquivo** (Ctrl+S)
5. ✅ Sistema configurado!

---

## 🧪 PASSO 7: TESTAR (2 minutos)

### 7.1 Abrir Sistema
1. Abra o arquivo **`index.html`** no navegador
2. Pressione **F12** para abrir o Console

### 7.2 Fazer Teste
1. Preencha um pedido simples:
   - Nome: **Teste**
   - Telefone: **(31) 99999-9999**
   - Produto: **Camisa Comum**
   - Malha: **Algodão Peteado**
   - Tamanho: **M - 10 peças**
   - Estampa: **Bordado - Peito Esquerdo**

2. Clique em **"Salvar Pedido"**

### 7.3 Verificar
1. Deve aparecer: ✅ **"Pedido salvo com sucesso!"**
2. Volte ao Google Sheets
3. Clique na aba **PEDIDOS**
4. Veja se o pedido apareceu na linha 2

✅ **Sistema funcionando!**

---

## 🎉 PRONTO! SEU BANCO DE DADOS ESTÁ FUNCIONANDO!

---

## ⚠️ PROBLEMAS COMUNS

### ❌ "Apps Script não autorizado"
- **Solução:** Repetir PASSO 4.2 e autorizar novamente

### ❌ "Aba não encontrada"
- **Solução:** Executar `criarTodasAbas()` novamente no PASSO 4

### ❌ "Erro ao salvar pedido"
- **Solução:** Verificar se a URL está correta no `config.js`
- **Solução:** Verificar se a URL termina com `/exec`
- **Solução:** Ver erros no Console (F12)

### ❌ "URL inválida"
- **Solução:** Copiar URL completa novamente
- **Solução:** Verificar se não tem espaços extras
- **Solução:** URL deve começar com `https://script.google.com/macros/s/`

### ❌ Pedido não aparece no Google Sheets
- **Solução:** Verificar se "Quem tem acesso" está como "Qualquer pessoa"
- **Solução:** Fazer nova implantação (repetir PASSO 5)
- **Solução:** Ver logs no Apps Script: **Execuções** → **Ver logs**

---

## 📞 DICA IMPORTANTE

**Guarde a URL do Apps Script em local seguro!**
- Se perder, pode recuperar em: Apps Script → Implantar → Gerenciar implantações
- Lá aparecerá a URL do aplicativo da Web

---

## 🎯 RESUMO DOS ARQUIVOS

```
📁 Projeto
├── 📄 index.html          (Abrir para usar o sistema)
├── 📄 config.js           (Onde você cola a URL)
├── 📄 script.js           (JavaScript do sistema)
├── 📄 styles.css          (Estilos)
├── 📄 print.css           (Estilos de impressão)
├── 📄 Code.gs             (Código para o Google Apps Script)
└── 📄 GUIA-BANCO-DADOS.md (Guia completo detalhado)
```

---

**⏰ Total: ~15 minutos**
**✅ Sistema 100% funcional após seguir os passos!**




