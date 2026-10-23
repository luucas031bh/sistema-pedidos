# ADONAY 2.0 — homologação

Esta pasta contém a reconstrução do sistema, isolada da versão publicada.

## Configuração aprovada

- Conta proprietária do novo Sheets: `lucas02bh@gmail.com`.
- Planilha V2: `1TdFHsbIS7SsdH_ONNt4kqfIy4W_-QH8FdCzzpCwEucM`.
- Acesso à aplicação: apenas `lucas02bh@gmail.com` e
  `isabelasiray14@gmail.com`, com conferência no backend.
- Planilha original: preservar sem alterações.

## Migração

Manter a aba `PEDIDOS` como snapshot histórico na cópia. A V2 terá abas
normalizadas para clientes, pedidos, produtos, grades, estampas, anexos,
pagamentos e eventos, com IDs imutáveis. A importação será idempotente,
auditada e validada contra os totais do relatório técnico.

## Estado do desenvolvimento

- [x] Cópia independente das abas legadas em novo Google Sheets.
- [x] Branch de homologação separada da `main`.
- [x] Modelo V2, projeção de pedidos/produtos/grades/estampas e testes locais.
- [x] Conferência preventiva de quantidades e valores antes e depois da gravação.
- [x] Separação de armazenamento da sessão de login da versão atual.
- [ ] Projeto Apps Script V2 configurado e publicado como serviço separado.
- [ ] Importação real executada e reconciliada na planilha nova.
- [ ] Testes reais de autorização com os dois e-mails e um terceiro não autorizado.
- [ ] Implementação de todos os módulos comerciais e produtivos.
- [ ] Homologação funcional desktop/mobile e aprovação do Lucas.

## Ordem segura para habilitar o backend

1. Criar um projeto **novo** de Apps Script sob `lucas02bh@gmail.com` e copiar `Schema.gs`, `Migration.gs`, `Api.gs` e o `Auth.gs` existente na raiz do repositório. Não vincular o script antigo nem editar sua implantação.
2. Configurar as propriedades de script `AUTH_ALLOWED_EMAILS` (JSON contendo **exatamente** os dois e-mails aprovados), `AUTH_GOOGLE_CLIENT_ID` e `AUTH_GOOGLE_CLIENT_SECRET`. O segredo permanece apenas nas propriedades privadas do novo script.
3. Ajustar o OAuth para a origem pública correta e confirmar as restrições dos URIs permitidos. Nunca publicar as credenciais no GitHub.
4. Executar `adny2AnalyzeMigration()` primeiro e confrontar os totais de pedidos, peças e valores com o banco copiado.
5. Executar `adny2ImportHistoricalOrders()` **somente após** aprovar o relatório. A função recusa segunda importação e grava exclusivamente no ID da planilha V2.
6. Conferir totais nas abas `V2_PEDIDOS`, `V2_PRODUTOS` e `V2_MIGRACAO`. Em caso de erro parcial, investigar sem repetir automaticamente.
7. Implantar o novo serviço Apps Script, colocar a URL em `index.html` **apenas na branch de homologação** e testar logins autorizados e não autorizados.

Não mesclar a branch de homologação na `main` nem mudar a versão publicada antes da validação final.
