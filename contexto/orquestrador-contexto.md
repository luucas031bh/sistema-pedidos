# Contexto do orquestrador — Adonay Confecção

Atualizado em 16/10/2026, à noite. Este arquivo é a memória do trabalho. Leia isto antes de continuar. Não trate como feito nada que esteja na lista "Ainda não foi feito".

## O que a pessoa pediu

Refinar o sistema de pedidos da Adonay Confecção, empresa de serigrafia e confecção personalizada. Ela gosta do sistema atual. Não reescrever. Primeiro a pesquisa e o plano, depois as mudanças.

## Regras que não podem ser quebradas

- Não alterar `Code.gs`. O script do Google Sheets fica como está.
- Não alterar o Node.js nem o bot em `IACriada/whatsapp-bot`.
- Não apagar, não editar e não modificar nenhuma entrada já gravada: pedido, orçamento, cliente, valor, status, produto, imagem, fornecedor ou receita.
- Leitura é permitida. Pedido de teste novo só depois de avisar, e sem reaproveitar id existente.
- A barra de navegação só troca de página. Ela não grava.

## O que já foi feito

- Pesquisa do sistema, dos 155 pedidos (somente leitura, de 19/03/2026 a 15/10/2026) e do mercado de estamparia. A cópia temporária dessa leitura foi apagada.
- Plano em quatro ciclos, ainda sem executar o ciclo 1.
- Regra permanente em `.cursor/rules/dados-intocaveis.mdc`.
- Barra fixa `#adonayNav` (`nav.js`, `nav.css`) em home, pedido, relatórios, calculadora de malha, ROANTONE, fornecedores e lista. Mostra "Você está em …". Conferida no desktop e na largura do iPhone 13.
- GP e OS refeitas em `print-os-gp.js` e `print.css`. A GP cabe o pedido híbrido de três produtos em cerca de uma folha, com preço, grade, local da estampa e assinatura. A OS não leva preço: capa com o índice e uma ficha por produto, com grade, local e quantidade de cores do silk. Pedido com mais de um produto quebra a página antes de cada ficha. Conferido na tela com um formulário novo, sem clicar em salvar.
- Aviso do Windows a cada 15 minutos, tarefa `Adonay Andamento`, lendo `contexto/andamento.json`. Verde quando segue ou está em pausa pedida. Vermelho quando precisa da pessoa, há erro ou aprovação. Se um aviso já está na tela, o próximo fecha o antigo e abre outro.

## Achados que o próximo ciclo precisa lembrar

- GP é a guia do cliente. Hoje não limita a duas folhas e não mostra o local da estampa.
- OS é a folha de produção, sem preço. Hoje junta todos os produtos num fluxo só. A quantidade de cores do silk existe no pedido e não sai na OS.
- 103 pedidos têm um produto. 52 são híbridos, de 2 a 9 produtos. A maioria das estampas é mista, não silk simples de frente e costas.
- Cor da malha está em texto livre (cerca de 72 grafias). O relatório não pode regravar isso. O agrupamento, se vier, é só na leitura.
- ROANTONE tem 556 receitas. O código é `AM063`, não `AM63`. Pedido antigo não guarda esse código. Receita na OS só quando o código estiver no pedido.
- Campo extra dentro do JSON do produto sobrevive sem mudar `Code.gs`, porque o script copia as chaves do produto. Isso não autoriza regravar pedido antigo.

## Ainda não foi feito

- Ranking claro do que mais e menos vende.
- Ligação da receita ROANTONE na OS.
- Ajuste fino da tela de preenchimento.
- Nenhum pedido de teste foi criado.

## Próximo passo

Ciclo 2: relatório do que mais e do que menos vende (peça, malha, cor e estampa), agrupando a cor só na leitura, sem regravar pedido antigo. Só começa quando a pessoa autorizar.

## Onde estão as telas

- Início: `home.html`
- Pedido: `index.html`
- Relatórios: `relatorio.html`
- Malha: `CalculadoraMalha/`
- Cores: `ROANTONE/`
- Fornecedores: `fornecedores.html`
- Lista: `ListaPreencher/lista.html`
