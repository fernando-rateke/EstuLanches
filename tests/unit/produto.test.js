'use strict';

const { validarProduto } = require('../../src/domain/produto');

describe('validarProduto', () => {
  const valido = { nome: 'Coxinha', categoria: 'salgado', preco_centavos: 600 };

  test('aceita produto válido', () => {
    expect(validarProduto(valido)).toEqual({ erros: [], dados: valido });
  });

  test.each([
    ['nome curto', { ...valido, nome: 'X' }, /nome/],
    ['categoria inválida', { ...valido, categoria: 'pizza' }, /categoria/],
    ['preço negativo', { ...valido, preco_centavos: -1 }, /preco_centavos/],
    ['preço decimal (deve ser centavos)', { ...valido, preco_centavos: 6.5 }, /preco_centavos/],
    ['preço como texto', { ...valido, preco_centavos: '600' }, /preco_centavos/],
    ['disponivel não booleano', { ...valido, disponivel: 'sim' }, /disponivel/],
  ])('rejeita %s', (_, entrada, regex) => {
    expect(validarProduto(entrada).erros.join(' ')).toMatch(regex);
  });

  test('edição parcial valida só os campos enviados', () => {
    expect(validarProduto({ disponivel: false }, { parcial: true })).toEqual({ erros: [], dados: { disponivel: false } });
  });

  test('edição parcial ignora campos desconhecidos (proteção contra mass assignment)', () => {
    const r = validarProduto({ id: 999, criado_em: 'x' }, { parcial: true });
    expect(r.erros).toEqual(['nenhum campo válido para atualizar']);
  });
});
