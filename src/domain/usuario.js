'use strict';

const PERFIS = ['aluno', 'cantina'];
const SENHA_MINIMA = 8;
// matrícula: letras, números, ponto, hífen ou sublinhado (ex.: 2026A0153)
const FORMATO_MATRICULA = /^[A-Za-z0-9._-]{3,20}$/;

function texto(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Valida o cadastro de um aluno. Retorna { erros, dados }. */
function validarCadastro(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const erros = [];
  const nome = texto(e.nome);
  const matricula = texto(e.matricula).toLowerCase();
  const senha = typeof e.senha === 'string' ? e.senha : '';

  if (nome.length < 2 || nome.length > 100) erros.push('nome deve ter entre 2 e 100 caracteres');
  if (!FORMATO_MATRICULA.test(matricula)) {
    erros.push('matrícula deve ter de 3 a 20 letras, números, ponto, hífen ou sublinhado');
  }
  if (senha.length < SENHA_MINIMA || senha.length > 72) {
    erros.push(`senha deve ter entre ${SENHA_MINIMA} e 72 caracteres`);
  } else if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
    erros.push('senha deve ter letras e números');
  } else if (senha.toLowerCase().includes(matricula)) {
    erros.push('senha não pode conter a matrícula');
  }
  return { erros, dados: { nome, matricula, senha } };
}

/** Valida o login: só confere se os campos vieram, sem dizer qual está errado. */
function validarLogin(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const matricula = texto(e.matricula).toLowerCase();
  const senha = typeof e.senha === 'string' ? e.senha : '';
  const erros = matricula && senha && senha.length <= 72 ? [] : ['informe matrícula e senha'];
  return { erros, dados: { matricula, senha } };
}

/** O que pode ser devolvido ao navegador (nunca a senha_hash). */
function usuarioPublico(u) {
  return { id: u.id, nome: u.nome, matricula: u.matricula, perfil: u.perfil };
}

module.exports = { PERFIS, SENHA_MINIMA, validarCadastro, validarLogin, usuarioPublico };
