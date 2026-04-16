# 🗄️ GUIA COMPLETO - BANCO DE DADOS GOOGLE SHEETS
## Sistema Adonay Confecção v1.0

---

## 📋 ÍNDICE
1. [Pré-requisitos](#pré-requisitos)
2. [PASSO 1: Criar Google Sheets](#passo-1-criar-google-sheets)
3. [PASSO 2: Acessar o Apps Script](#passo-2-acessar-o-apps-script)
4. [PASSO 3: Colar o Código](#passo-3-colar-o-código)
5. [PASSO 4: Criar as Abas](#passo-4-criar-as-abas)
6. [PASSO 5: Deploy como Web App](#passo-5-deploy-como-web-app)
7. [PASSO 6: Configurar Frontend](#passo-6-configurar-frontend)
8. [PASSO 7: Testar Sistema](#passo-7-testar-sistema)
9. [Troubleshooting](#troubleshooting)
10. [Estrutura do Banco](#estrutura-do-banco)

---

## 🔧 PRÉ-REQUISITOS

- ✅ Conta Google (Gmail)
- ✅ Acesso ao Google Sheets
- ✅ Acesso ao Google Apps Script
- ✅ Navegador moderno (Chrome, Firefox, Edge)
- ✅ Arquivo `Code.gs` do projeto (já criado)

---

## 📊 PASSO 1: Criar Google Sheets

### 1.1 Acessar Google Sheets
1. Abra o navegador e acesse: **https://sheets.google.com**
2. Faça login com sua conta Google
3. Clique em **"+ Novo"** ou **"Blank spreadsheet"**

### 1.2 Nomear a Planilha
1. Clique no nome padrão "Planilha sem título"
2. Digite: **"Adonay Confecção - Sistema de Pedidos"**
3. Pressione **Enter** ou clique fora
4. A planilha será salva automaticamente

### 1.3 Verificar Criação
- ✅ Planilha criada com sucesso
- ✅ Nome correto aplicado
- ✅ Pronto para próxima etapa

---

## ⚙️ PASSO 2: Acessar o Apps Script

### 2.1 Abrir Apps Script
1. Na planilha criada, clique em **"Extensões"** (menu superior)
2. Selecione **"Apps Script"**
3. Uma nova aba abrirá com o editor do Apps Script

### 2.2 Configurar Projeto
1. O arquivo padrão se chama **"Code.gs"** - **MANTER ESTE NOME**
2. Apague todo o código de exemplo que aparece
3. No canto superior esquerdo, clique no nome do projeto
4. Digite: **"Sistema Adonay Confecção"**
5. Pressione **Enter**

### 2.3 Verificar Acesso
- ✅ Apps Script aberto
- ✅ Projeto nomeado corretamente
- ✅ Arquivo Code.gs limpo
- ✅ Pronto para colar código

---

## 📝 PASSO 3: Colar o Código

### 3.1 Copiar Código do Projeto
1. Abra o arquivo **`Code.gs`** do projeto local
2. Selecione TODO o conteúdo (**Ctrl+A**)
3. Copie o código (**Ctrl+C**)

### 3.2 Colar no Apps Script
1. Volte ao editor do Apps Script
2. Cole o código (**Ctrl+V**)
3. Salve o projeto (**Ctrl+S** ou clique no ícone 💾)

### 3.3 Verificar Código
- ✅ Código colado completamente
- ✅ Projeto salvo com sucesso
- ✅ Sem erros de sintaxe visíveis
- ✅ Pronto para executar funções

---

## 🏗️ PASSO 4: Criar as Abas

### 4.1 Executar Função de Criação
1. No editor do Apps Script, localize a função **`criarTodasAbas()`**
2. Selecione esta função no dropdown de funções (topo da página)
3. Clique no botão **Executar** (▶️ Play)

### 4.2 Primeira Execução - Autorização
**IMPORTANTE:** Na primeira execução, será solicitada autorização:

1. Clique em **"Revisar permissões"**
2. Selecione sua conta Google
3. Clique em **"Avançado"** (canto inferior esquerdo)
4. Clique em **"Ir para Sistema Adonay Confecção (não seguro)"**
5. Clique em **"Permitir"**

### 4.3 Aguardar Execução
1. Aguarde a execução (pode levar alguns segundos)
2. Verifique os logs no final da página
3. Deve aparecer: **"Todas as abas foram criadas com sucesso!"**

### 4.4 Verificar Abas Criadas
1. Volte à planilha do Google Sheets
2. Verifique se foram criadas **5 abas**:
   - ✅ **PEDIDOS**
   - ✅ **CUSTOS_MALHAS**
   - ✅ **CUSTOS_MAO_OBRA**
   - ✅ **CUSTOS_ESTAMPAS**
   - ✅ **LOCALIDADES_ESTAMPAS**
   - ✅ **DASHBOARD_DATA**

### 4.5 Verificar Dados
1. Clique em cada aba para verificar se os dados foram inseridos
2. **PEDIDOS**: Deve estar vazia (apenas cabeçalhos)
3. **CUSTOS_***: Devem ter dados de exemplo
4. **DASHBOARD_DATA**: Deve ter métricas zeradas

---

## 🚀 PASSO 5: Deploy como Web App

### 5.1 Iniciar Deploy
1. No editor do Apps Script, clique em **"Implantar"** (topo direito)
2. Selecione **"Nova implantação"**
3. Clique no ícone de engrenagem ⚙️ ao lado de "Selecione o tipo"
4. Escolha **"Aplicativo da Web"**

### 5.2 Configurar Deploy
Preencha os campos:

- **Descrição:** `Sistema de Pedidos v1.0`
- **Executar como:** `Eu (seu.email@gmail.com)`
- **Quem tem acesso:** `Qualquer pessoa`

### 5.3 Finalizar Deploy
1. Clique em **"Implantar"**
2. Será solicitada autorização novamente
3. Clique em **"Autorizar acesso"**
4. Aguarde o processamento

### 5.4 Copiar URL
**IMPORTANTE:** Após o deploy, copie a **URL do aplicativo da Web**

- Exemplo: `https://script.google.com/macros/s/AKfycby.../exec`
- **GUARDE ESTA URL** - será necessária no próximo passo

---

## 🔗 PASSO 6: Configurar Frontend

### 6.1 Abrir Arquivo de Configuração
1. Abra o arquivo **`config.js`** do projeto local
2. Localize a linha 6: `APPS_SCRIPT_URL: 'COLE_A_URL_DO_APPS_SCRIPT_AQUI'`

### 6.2 Substituir URL
1. Substitua o texto por sua URL copiada:
```javascript
APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby.../exec'
```

### 6.3 Salvar Arquivo
1. Salve o arquivo (**Ctrl+S**)
2. Verifique se a URL está correta
3. Deve terminar com `/exec`

---

## 🧪 PASSO 7: Testar Sistema

### 7.1 Testar Conexão
1. Abra o arquivo **`index.html`** no navegador
2. Abra o Console do desenvolvedor (**F12**)
3. Verifique se não há erros de conexão
4. Deve aparecer: **"Sistema carregado com sucesso!"**

### 7.2 Testar Salvamento
1. Preencha um pedido de teste:
   - **Nome:** Cliente Teste
   - **Telefone:** (31) 99999-9999
   - **Produto:** Camisa Comum
   - **Malha:** Algodão Peteado
   - **Estampa:** Bordado
2. Clique em **"Salvar Pedido"**
3. Aguarde mensagem de sucesso
4. Verifique se não há erros no console

### 7.3 Verificar no Google Sheets
1. Volte ao Google Sheets
2. Clique na aba **"PEDIDOS"**
3. Verifique se o pedido apareceu na planilha
4. Confirme se todos os dados estão corretos

### 7.4 Testar Busca
1. No sistema, clique em **"Buscar Pedido"**
2. Digite o nome ou ID do pedido teste
3. Clique em **"Buscar"**
4. Verifique se os dados são carregados corretamente

---

## 🔧 TROUBLESHOOTING

### ❌ Erro: "Apps Script não autorizado"
**Solução:**
1. Repetir PASSO 4.2
2. Autorizar novamente
3. Verificar se todas as permissões foram concedidas

### ❌ Erro: "Aba não encontrada"
**Solução:**
1. Executar função `criarTodasAbas()` novamente
2. Verificar se todas as 6 abas foram criadas
3. Verificar logs de execução

### ❌ Erro: "URL inválida"
**Solução:**
1. Verificar se copiou a URL completa
2. URL deve terminar com `/exec`
3. Verificar se não há espaços extras

### ❌ Pedido não aparece na planilha
**Solução:**
1. Verificar se a URL está correta no `config.js`
2. Ver console do navegador para erros
3. Ver logs do Apps Script (Execuções > Ver logs)
4. Testar conexão com `testarConexao()`

### ❌ Erro CORS
**Solução:**
1. Garantir que "Quem tem acesso" está como "Qualquer pessoa"
2. Fazer nova implantação se necessário
3. Verificar se a URL está correta

### ❌ Erro: "Planilha não encontrada"
**Solução:**
1. Verificar se está na planilha correta
2. Executar `criarTodasAbas()` novamente
3. Verificar se as abas existem

---

## 🗂️ ESTRUTURA DO BANCO

### 📊 Aba PEDIDOS
| Coluna | Descrição | Tipo |
|--------|------------|------|
| A | ID | Texto |
| B | Nome Cliente | Texto |
| C | Telefone | Texto |
| D | Data Pedido | Data |
| E | Data Entrega | Data |
| F | Total Peças | Número |
| G | Produtos (JSON) | Texto |
| H | Observações | Texto |
| I | Total Pedido (R$) | Moeda |
| J | Valor Entrada (R$) | Moeda |
| K | Restante (R$) | Moeda |
| L | Status | Texto |
| M | Data Criação | Data/Hora |
| N | Data Modificação | Data/Hora |

### 📊 Aba CUSTOS_MALHAS
| Coluna | Descrição |
|--------|------------|
| A | Tipo Malha |
| B | Preço/kg (R$) |
| C | Rendimento/kg |
| D | Custo/peça (R$) |

### 📊 Aba CUSTOS_MAO_OBRA
| Coluna | Descrição |
|--------|------------|
| A | Tipo Peça |
| B | Custo por Peça (R$) |

### 📊 Aba CUSTOS_ESTAMPAS
| Coluna | Descrição |
|--------|------------|
| A | Tipo Estampa |
| B | Localidade |
| C | Tamanho |
| D | Custo Unitário (R$) |

### 📊 Aba LOCALIDADES_ESTAMPAS
| Coluna | Descrição |
|--------|------------|
| A | Categoria |
| B | Localidade |
| C | Tamanho |

### 📊 Aba DASHBOARD_DATA
| Coluna | Descrição |
|--------|------------|
| A | Métrica |
| B | Valor |
| C | Data Atualização |

---

## 🎯 FUNCIONALIDADES IMPLEMENTADAS

### ✅ Salvamento de Pedidos
- Estrutura completa de dados
- Validação de ID único
- Timestamps automáticos
- Status padrão "Em Análise"

### ✅ Busca de Pedidos
- Busca por ID ou Nome
- Retorno de dados completos
- Tratamento de erros

### ✅ Atualização de Pedidos
- Modificação de dados existentes
- Preservação de histórico
- Atualização de timestamps

### ✅ Controle de Status
- 6 status disponíveis
- Atualização individual
- Rastreamento de mudanças

### ✅ Dashboard Automático
- Métricas em tempo real
- Atualização automática
- Dados agregados

### ✅ Soft Delete
- Cancelamento de pedidos
- Preservação de dados
- Histórico completo

---

## 🚀 PRÓXIMOS PASSOS

Após completar este guia, você terá:

1. ✅ Banco de dados funcional
2. ✅ Sistema de salvamento
3. ✅ Sistema de busca
4. ✅ Dashboard preparado
5. ✅ Integração completa

**Para implementar o Dashboard (Fase 2):**
- Os dados já estarão disponíveis
- Use a função `obterDashboard()` do Apps Script
- Crie interface visual com os dados

---

## 📞 SUPORTE

Se encontrar problemas:

1. **Verifique os logs** do Apps Script
2. **Teste a conexão** com `testarConexao()`
3. **Execute `inicializarSistema()`** para diagnóstico
4. **Verifique as permissões** do Google

---

**🎉 Parabéns! Seu sistema de banco de dados está pronto!**




