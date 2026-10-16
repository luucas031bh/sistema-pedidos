# Contexto do orquestrador — Adonay Confecção

Atualizado em 16/10/2026, à noite. A pessoa pediu para parar e voltar amanhã. Este arquivo é a memória do trabalho. Leia isto antes de continuar. Não trate como feito nada que esteja na lista "Ainda não foi feito".

## O que a pessoa pediu

Refinar o sistema de pedidos da Adonay Confecção, empresa de serigrafia e confecção personalizada. Ela gosta do sistema atual. Não reescrever. Primeiro a pesquisa e o plano, depois as mudanças.

A OS precisa ser visual e limpa, só com o que a produção usa. A GP é a guia do cliente.

## Regras que não podem ser quebradas

- Não alterar `Code.gs`. O script do Google Sheets fica como está.
- Não alterar o Node.js nem o bot em `IACriada/whatsapp-bot`.
- Não apagar, não editar e não modificar nenhuma entrada já gravada: pedido, orçamento, cliente, valor, status, produto, imagem, fornecedor ou receita.
- Leitura é permitida. Pedido de teste novo só depois de avisar, e sem reaproveitar id existente.
- A barra de navegação só troca de página. Ela não grava.

## O que já foi feito

- Pesquisa do sistema, dos 155 pedidos (somente leitura, de 19/03/2026 a 15/10/2026) e do mercado de estamparia. A cópia temporária dessa leitura foi apagada.
- Plano em quatro ciclos. O ciclo 1 (GP e OS) está em desenho. A pessoa recusou as duas primeiras versões.
- Regra permanente em `.cursor/rules/dados-intocaveis.mdc`.
- Barra fixa `#adonayNav` (`nav.js`, `nav.css`) em home, pedido, relatórios, calculadora de malha, ROANTONE, fornecedores e lista. Mostra "Você está em …". Conferida no desktop e na largura do iPhone 13.
- Terceira OS, ainda sem o ok dela (`print.css?v=10`, `print-os-gp.js?v=12`): uma página por produto, com número, nome, entrega e quantidade no topo; camisa da frente e das costas com o número no local da estampa; quadrado da cor; grade em números; lista da estampa embaixo. Sem preço. A quebra de página só começa no segundo produto. A GP ficou em linhas, com preço, total e assinatura. Conferido na tela com formulário novo, sem salvar.
- Aviso do Windows a cada 15 minutos, tarefa `Adonay Andamento`, lendo `contexto/andamento.json`. Verde quando segue ou está em pausa pedida. Vermelho quando precisa da pessoa, há erro ou aprovação. Se um aviso já está na tela, o próximo fecha o antigo e abre outro.

## Achados que o próximo dia precisa lembrar

- Ela ainda não aprovou o desenho. Amanhã o primeiro passo é ela abrir um pedido, atualizar a página e olhar **Imprimir OS**. Se ainda não gostar, ajustar o desenho antes de qualquer outro ciclo.
- GP é a guia do cliente, com preço e assinatura. OS é a folha de produção, sem preço. Silk mostra a quantidade de cores.
- 103 pedidos têm um produto. 52 são híbridos, de 2 a 9 produtos. A maioria das estampas é mista, não silk simples de frente e costas.
- Cor da malha está em texto livre (cerca de 72 grafias). O relatório não pode regravar isso. O agrupamento, se vier, é só na leitura. O quadrado de cor da OS só pinta nomes conhecidos (preta, branca, marinho e outras comuns). Nome desconhecido fica sem cor.
- ROANTONE tem 556 receitas. O código é `AM063`, não `AM63`. Pedido antigo não guarda esse código. Receita na OS só quando o código estiver no pedido.
- Campo extra dentro do JSON do produto sobrevive sem mudar `Code.gs`, porque o script copia as chaves do produto. Isso não autoriza regravar pedido antigo.

## Ainda não foi feito

- O ok dela na OS e na GP.
- Ranking claro do que mais e menos vende.
- Ligação da receita ROANTONE na OS.
- Ajuste fino da tela de preenchimento.
- Nenhum pedido de teste foi criado.

## Próximo passo

Amanhã: ela olha a OS atual. O relatório do que mais e do que menos vende só começa quando ela pedir de novo.

## Onde estão as telas

- Início: `home.html`
- Pedido: `index.html`
- Relatórios: `relatorio.html`
- Malha: `CalculadoraMalha/`
- Cores: `ROANTONE/`
- Fornecedores: `fornecedores.html`
- Lista: `ListaPreencher/lista.html`
