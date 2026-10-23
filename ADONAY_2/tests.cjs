'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const context = vm.createContext({
  Date, JSON, Number, String, Object, Array, Set, Math, Error,
  Utilities: {
    Charset: {UTF_8: 'utf8'}, DigestAlgorithm: {SHA_256: 'sha256'},
    computeDigest: (_, input) => [...crypto.createHash('sha256').update(input).digest()].map(n => n > 127 ? n - 256 : n)
  }
});
for (const name of ['Schema.gs', 'Migration.gs']) vm.runInContext(fs.readFileSync(__dirname + '/' + name, 'utf8'), context, {filename: name});
const run = script => vm.runInContext(script, context);

assert.equal(run('adny2Money_(63)'), 6300);
assert.equal(run('adny2Money_(549.99)'), 54999);
assert.equal(run("adny2AssertAuthorized_('LUCAS02BH@GMAIL.COM')"), 'lucas02bh@gmail.com');
assert.throws(() => run("adny2AssertAuthorized_('intruso@example.com')"), /ACCESS_DENIED/);

const row = Array(41).fill('');
row[0] = 'PED-EXEMPLO-0001'; row[1] = 'Cliente Teste'; row[2] = '(31) 99999-0000';
row[3] = '2026-10-23'; row[4] = '2026-11-30'; row[5] = 10;
row[6] = JSON.stringify({v:2,etapaProducaoAtual:'Corte',produtos:[{
  nomeProduto:'Camisa', tipoPeca:'Camisas Comum', detalhesPeca:'Gola O', tipoMalha:'PV', corMalha:'MARINHO',
  precoUnitario:63, valorTotal:630, tamanhos:[{tamanho:'G',quantidade:10}],
  estampas:[{tipo:'Bordado',localidade:'Peito Esquerdo 10x10',quantidadeCores:''}]
}]});
row[8] = 630; row[9] = 100; row[10] = 530; row[11] = 'Novo pedido';
row[25] = 'ISABELA'; row[26] = 'PEDIDO'; row[30] = 'https://example.com/arte.png';
const headers = ['ID','Nome Cliente','Telefone','Data Pedido','Data Entrega','Total Peças','Produtos','Observações','Valor Total','Entrada','Restante','Status','Data Criação','Data Modificação','ARTE','OS','CORTE','COSTURA','ESTAMPA PRODUÇÃO','PRONTO PARA ENVIO','Tipo Peça','Tipo Malha','Cor Malha','Detalhe Peça','Estampa Resumo','Vendedor','Tag Pedido','ID BUSCA','Lista Personalização','URL Mockup','URL Arte 1','URL Arte 2','URL Arte 3','URL Arte 4','URL Arte 5','URL Arte 6','URL Arte 7','URL Arte 8','URL Arte 9','URL Arte 10'];
context.sample = {headers, rows:[row]};
const result = run('adny2Project_(sample)');
assert.equal(result.report.pedidos, 1);
assert.equal(result.report.produtos, 1);
assert.equal(result.report.pecas, 10);
assert.equal(result.report.totalCentavos, 63000);
assert.equal(result.tables.V2_ESTAMPAS.length, 1);
assert.equal(result.tables.V2_ANEXOS.length, 1);
assert.equal(result.tables.V2_PEDIDOS[0][9], 'ISABELA');
assert.equal(result.tables.V2_PAGAMENTOS.length, 0, 'Entrada histórica não pode virar pagamento confirmado');
assert.equal(result.tables.V2_PEDIDOS[0][16], 10000);
assert.equal(result.tables.V2_PEDIDOS[0][17], 53000);
assert.throws(() => run('adny2Project_({headers: sample.headers, rows:[sample.rows[0],sample.rows[0]]})'), /DUPLICATE_LEGACY_ID/);
row[5] = 9;
assert.throws(() => run('adny2Project_(sample)'), /TOTAL_MISMATCH/);
row[5] = 10;
const noCostura = headers.filter(name => name !== 'COSTURA');
const shiftedRow = row.filter((_, index) => index !== headers.indexOf('COSTURA'));
context.shifted = {headers: noCostura, rows:[shiftedRow]};
const shiftedResult = run('adny2Project_(shifted)');
assert.equal(shiftedResult.tables.V2_PEDIDOS[0][9], 'ISABELA');
assert.equal(shiftedResult.tables.V2_ANEXOS.length, 1);
console.log('ADONAY 2.0: verificações de migração e autorização passaram.');
