'use strict';

const express = require('express');
const { validarProduto } = require('../domain/produto');
const { ErroApp } = require('../domain/erros');
const { idDaRota, exigirValido } = require('./util');

const CAMPOS = 'id, nome, descricao, categoria, preco_centavos, disponivel';

function rotasProdutos({ pool, admin }) {
  const r = express.Router();

  // Público: cardápio com os produtos disponíveis.
  r.get('/', async (req, res) => {
    const sql = `SELECT ${CAMPOS} FROM produtos WHERE disponivel = TRUE ORDER BY categoria, nome`;
    const { rows } = await pool.query(sql);
    res.json(rows);
  });

  // Cantina: todos os produtos, inclusive os indisponíveis.
  r.get('/todos', admin, async (req, res) => {
    const { rows } = await pool.query(`SELECT ${CAMPOS} FROM produtos ORDER BY categoria, nome`);
    res.json(rows);
  });

  r.get('/:id', async (req, res) => {
    const { rows } = await pool.query(`SELECT ${CAMPOS} FROM produtos WHERE id = $1`, [idDaRota(req)]);
    if (!rows[0]) throw new ErroApp(404, 'produto não encontrado');
    res.json(rows[0]);
  });

  r.post('/', admin, async (req, res) => {
    const d = exigirValido(validarProduto(req.body));
    const { rows } = await pool.query(
      `INSERT INTO produtos (nome, descricao, categoria, preco_centavos, disponivel)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${CAMPOS}`,
      [d.nome, d.descricao ?? '', d.categoria, d.preco_centavos, d.disponivel ?? true],
    );
    res.status(201).json(rows[0]);
  });

  r.patch('/:id', admin, async (req, res) => {
    const id = idDaRota(req);
    const d = exigirValido(validarProduto(req.body, { parcial: true }));
    // Os nomes de coluna vêm da validação (lista fixa), nunca do usuário;
    // os valores vão como parâmetros ($1, $2...) -> sem SQL injection.
    const colunas = Object.keys(d);
    const sets = colunas.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE produtos SET ${sets}, atualizado_em = NOW() WHERE id = $1 RETURNING ${CAMPOS}`,
      [id, ...colunas.map((c) => d[c])],
    );
    if (!rows[0]) throw new ErroApp(404, 'produto não encontrado');
    res.json(rows[0]);
  });

  r.delete('/:id', admin, async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM produtos WHERE id = $1', [idDaRota(req)]);
    if (!rowCount) throw new ErroApp(404, 'produto não encontrado');
    res.status(204).end();
  });

  return r;
}

module.exports = { rotasProdutos };
