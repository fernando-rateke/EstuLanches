'use strict';

const { validarCadastro, validarLogin, usuarioPublico } = require('../../src/domain/usuario');

describe('validarCadastro', () => {
  const valido = { nome: ' Ana Lima ', matricula: ' 2026A0153 ', senha: 'Lanche2026' };

  test('aceita cadastro válido e normaliza nome e matrícula', () => {
    const { erros, dados } = validarCadastro(valido);
    expect(erros).toEqual([]);
    expect(dados).toEqual({ nome: 'Ana Lima', matricula: '2026a0153', senha: 'Lanche2026' });
  });

  test.each([
    ['nome curto', { ...valido, nome: 'A' }, /nome/],
    ['matrícula com espaço', { ...valido, matricula: '2026 01' }, /matrícula/],
    ['matrícula com símbolo perigoso', { ...valido, matricula: "x'; DROP--" }, /matrícula/],
    ['senha curta', { ...valido, senha: 'abc12' }, /entre 8/],
    ['senha só com letras', { ...valido, senha: 'somenteletras' }, /letras e números/],
    ['senha só com números', { ...valido, senha: '12345678' }, /letras e números/],
    ['senha contendo a matrícula', { ...valido, senha: 'x2026a0153' }, /matrícula/],
    ['corpo vazio', undefined, /nome/],
  ])('rejeita %s', (_, entrada, regex) => {
    expect(validarCadastro(entrada).erros.join(' ')).toMatch(regex);
  });
});

describe('validarLogin', () => {
  test('exige matrícula e senha, sem dizer qual faltou', () => {
    expect(validarLogin({ matricula: 'ana' }).erros).toEqual(['informe matrícula e senha']);
    expect(validarLogin({ senha: 'x' }).erros).toEqual(['informe matrícula e senha']);
  });

  test('matrícula não diferencia maiúsculas', () => {
    expect(validarLogin({ matricula: 'CANTINA', senha: 'x' }).dados.matricula).toBe('cantina');
  });
});

test('usuarioPublico nunca devolve a senha', () => {
  const u = usuarioPublico({ id: 1, nome: 'Ana', matricula: 'a1', perfil: 'aluno', senha_hash: 'scrypt$...' });
  expect(u).toEqual({ id: 1, nome: 'Ana', matricula: 'a1', perfil: 'aluno' });
});
