'use strict';

const express = require('express');
const { validarCadastro, validarLogin, usuarioPublico } = require('../domain/usuario');
const { hashSenha, conferirSenha } = require('../seguranca/senha');
const { gerarCodigo, hashCodigo } = require('../seguranca/sessao');
const { ErroApp } = require('../domain/erros');
const { exigirValido } = require('./util');

// Hash "falso" usado quando a matrícula não existe: o tempo de resposta fica
// parecido com o de uma senha errada, e ninguém descobre quais matrículas existem.
const HASH_FALSO = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

/**
 * Contas e sessões.
 *   POST /cadastro  aluno cria a conta (já sai logado)
 *   POST /login     entra com matrícula e senha
 *   POST /logout    sai (apaga a sessão)
 *   GET  /eu        quem está logado
 */
function rotasAuth({ pool, config, login, limiteLogin }) {
  const r = express.Router();

  async function abrirSessao(usuario) {
    const codigo = gerarCodigo();
    const { rows } = await pool.query(
      `INSERT INTO sessoes (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, NOW() + make_interval(hours => $3)) RETURNING expira_em`,
      [usuario.id, hashCodigo(codigo), config.sessaoHoras],
    );
    // limpeza: tira do banco as sessões vencidas deste usuário
    await pool.query('DELETE FROM sessoes WHERE usuario_id = $1 AND expira_em <= NOW()', [usuario.id]);
    return { usuario: usuarioPublico(usuario), token: codigo, expira_em: rows[0].expira_em };
  }

  // O perfil é sempre "aluno": a conta da cantina só nasce pelo .env do servidor.
  r.post('/cadastro', limiteLogin, async (req, res) => {
    const d = exigirValido(validarCadastro(req.body));
    let usuario;
    try {
      const { rows } = await pool.query(
        `INSERT INTO usuarios (nome, matricula, senha_hash, perfil)
         VALUES ($1, $2, $3, 'aluno') RETURNING id, nome, matricula, perfil`,
        [d.nome, d.matricula, await hashSenha(d.senha)],
      );
      usuario = rows[0];
    } catch (err) {
      if (err.code === '23505') throw new ErroApp(409, 'essa matrícula já tem cadastro');
      throw err;
    }
    res.status(201).json(await abrirSessao(usuario));
  });

  r.post('/login', limiteLogin, async (req, res) => {
    const d = exigirValido(validarLogin(req.body));
    const { rows } = await pool.query(
      'SELECT id, nome, matricula, perfil, senha_hash FROM usuarios WHERE matricula = $1',
      [d.matricula],
    );
    const usuario = rows[0];
    const ok = await conferirSenha(d.senha, usuario ? usuario.senha_hash : HASH_FALSO);
    if (!usuario || !ok) throw new ErroApp(401, 'matrícula ou senha incorretas');
    res.json(await abrirSessao(usuario));
  });

  // Sair apaga a sessão no banco: o código antigo para de funcionar na hora.
  r.post('/logout', login, async (req, res) => {
    await pool.query('DELETE FROM sessoes WHERE token_hash = $1', [req.sessaoHash]);
    res.status(204).end();
  });

  r.get('/eu', login, (req, res) => {
    res.json(usuarioPublico(req.usuario));
  });

  return r;
}

module.exports = { rotasAuth };
