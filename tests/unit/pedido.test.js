'use strict';

const {
  podeTransitar,
  validarPedido,
  calcularTotal,
  formatarReais,
} = require('../../src/domain/pedido');
const { ErroApp } = require('../../src/domain/erros');

const cardapio = new Map([
  [1, { nome: 'X-Salada', preco_centavos: 1200, disponivel: true }],
  [2, { nome: 'Suco', preco_centavos: 600, disponivel: true }],
  [3, { nome: 'Esgotado', preco_centavos: 500, disponivel: false }],
]);

describe('calcularTotal', () => {
  test('soma preço × quantidade de cada item, em centavos', () => {
    const r = calcularTotal([{ produto_id: 1, quantidade: 2 }, { produto_id: 2, quantidade: 1 }], cardapio);
    expect(r.total_centavos).toBe(3000);
    expect(r.linhas).toEqual([
      { produto_id: 1, quantidade: 2, preco_unitario_centavos: 1200 },
      { produto_id: 2, quantidade: 1, preco_unitario_centavos: 600 },
    ]);
  });

  test('não sofre erro de ponto flutuante (centavos inteiros)', () => {
    const m = new Map([[9, { nome: 'Bala', preco_centavos: 10, disponivel: true }]]);
    expect(calcularTotal([{ produto_id: 9, quantidade: 3 }], m).total_centavos).toBe(30);
  });

  test('rejeita produto inexistente com 422', () => {
    expect(() => calcularTotal([{ produto_id: 99, quantidade: 1 }], cardapio)).toThrow(ErroApp);
    try { calcularTotal([{ produto_id: 99, quantidade: 1 }], cardapio); } catch (e) { expect(e.status).toBe(422); }
  });

  test('rejeita produto indisponível', () => {
    expect(() => calcularTotal([{ produto_id: 3, quantidade: 1 }], cardapio)).toThrow(/indisponível/);
  });
});

describe('validarPedido', () => {
  const valido = { cliente_nome: '  Ana  ', itens: [{ produto_id: 1, quantidade: 2 }] };

  test('aceita pedido válido e normaliza o nome', () => {
    const { erros, dados } = validarPedido(valido);
    expect(erros).toEqual([]);
    expect(dados.cliente_nome).toBe('Ana');
  });

  test('agrupa itens repetidos do mesmo produto', () => {
    const { dados } = validarPedido({ cliente_nome: 'Ana', itens: [
      { produto_id: 1, quantidade: 2 }, { produto_id: 1, quantidade: 3 }, { produto_id: 2, quantidade: 1 },
    ] });
    expect(dados.itens).toEqual([{ produto_id: 1, quantidade: 5 }, { produto_id: 2, quantidade: 1 }]);
  });

  test.each([
    ['sem nome', { itens: valido.itens }, /cliente_nome/],
    ['sem itens', { cliente_nome: 'Ana', itens: [] }, /itens/],
    ['itens não é lista', { cliente_nome: 'Ana', itens: 'x' }, /itens/],
    ['quantidade zero', { cliente_nome: 'Ana', itens: [{ produto_id: 1, quantidade: 0 }] }, /quantidade/],
    ['quantidade fracionada', { cliente_nome: 'Ana', itens: [{ produto_id: 1, quantidade: 1.5 }] }, /quantidade/],
    ['produto_id texto', { cliente_nome: 'Ana', itens: [{ produto_id: '1; DROP TABLE', quantidade: 1 }] }, /produto_id/],
    ['soma acima do limite', { cliente_nome: 'Ana', itens: [
      { produto_id: 1, quantidade: 15 }, { produto_id: 1, quantidade: 15 }] }, /excede/],
    ['corpo nulo', null, /cliente_nome/],
  ])('rejeita %s', (_, entrada, regex) => {
    const { erros } = validarPedido(entrada);
    expect(erros.join(' ')).toMatch(regex);
  });

  test('rejeita mais de 20 itens', () => {
    const itens = Array.from({ length: 21 }, (_, i) => ({ produto_id: i + 1, quantidade: 1 }));
    expect(validarPedido({ cliente_nome: 'Ana', itens }).erros.join(' ')).toMatch(/no máximo 20/);
  });
});

describe('podeTransitar (fluxo do pedido)', () => {
  test.each([
    ['recebido', 'preparando', true],
    ['preparando', 'pronto', true],
    ['pronto', 'entregue', true],
    ['recebido', 'cancelado', true],
    ['preparando', 'cancelado', true],
    ['recebido', 'entregue', false],
    ['pronto', 'cancelado', false],
    ['entregue', 'recebido', false],
    ['cancelado', 'preparando', false],
    ['inexistente', 'pronto', false],
  ])('%s -> %s = %s', (de, para, esperado) => {
    expect(podeTransitar(de, para)).toBe(esperado);
  });
});

test('formatarReais formata em BRL', () => {
  expect(formatarReais(1250).replace(/\s/g, ' ')).toBe('R$ 12,50');
});
