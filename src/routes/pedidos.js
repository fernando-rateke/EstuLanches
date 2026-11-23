'use strict';

const express = require('express');
const { validarPedido, calcularTotal, podeTransitar, STATUS } = require('../domain/pedido');
const { ErroApp } = require('../domain/erros');
const { transacao } = require('../db');
const { idDaRota, exigirValido } = require('./util');

async function buscarPedido(db, id) {
  const { rows } = await db.query(
    `SELECT p.id, p.cliente_nome, p.observacao, p.status, p.total_centavos, p.criado_em, p.atualizado_em,
            COALESCE(json_agg(json_build_object(
              'produto_id', i.produto_id, 'nome', pr.nome,
              'quantidade', i.quantidade, 'preco_unitario_centavos', i.preco_unitario_centavos
            ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS itens
       FROM pedidos p
       LEFT JOIN itens_pedido i ON i.pedido_id = p.id
       LEFT JOIN produtos pr ON pr.id = i.produto_id
      WHERE p.id = $1
      GROUP BY p.id`,
    [id],
  );
  return rows[0];
}

function rotasPedidos({ pool, admin, limitePedidos }) {
  const r = express.Router();

  // Público (aluno): faz o pedido. Preço e total são SEMPRE calculados no servidor;
  // o cliente só informa produto e quantidade.
  r.post('/', limitePedidos, async (req, res) => {
    const d = exigirValido(validarPedido(req.body));

    const id = await transacao(pool, async (client) => {
      const ids = d.itens.map((i) => i.produto_id);
      const { rows } = await client.query(
        'SELECT id, nome, preco_centavos, disponivel FROM produtos WHERE id = ANY($1::int[]) FOR SHARE',
        [ids],
      );
      const produtos = new Map(rows.map((p) => [p.id, p]));
      const { total_centavos, linhas } = calcularTotal(d.itens, produtos);

      const pedido = await client.query(
        'INSERT INTO pedidos (cliente_nome, observacao, total_centavos) VALUES ($1, $2, $3) RETURNING id',
        [d.cliente_nome, d.observacao, total_centavos],
      );
      const pedidoId = pedido.rows[0].id;
      for (const l of linhas) {
        await client.query(
          `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario_centavos)
           VALUES ($1, $2, $3, $4)`,
          [pedidoId, l.produto_id, l.quantidade, l.preco_unitario_centavos],
        );
      }
      return pedidoId;
    });

    res.status(201).json(await buscarPedido(pool, id));
  });

  // Público: o aluno acompanha o status do próprio pedido pelo número.
  r.get('/:id', async (req, res) => {
    const pedido = await buscarPedido(pool, idDaRota(req));
    if (!pedido) throw new ErroApp(404, 'pedido não encontrado');
    res.json(pedido);
  });

  // Cantina: fila de pedidos, opcionalmente filtrada por status.
  r.get('/', admin, async (req, res) => {
    const { status } = req.query;
    if (status !== undefined && !STATUS.includes(status)) throw new ErroApp(400, 'status inválido');
    const { rows } = await pool.query(
      `SELECT id FROM pedidos WHERE ($1::text IS NULL OR status = $1) ORDER BY criado_em DESC, id DESC LIMIT 100`,
      [status ?? null],
    );
    const pedidos = await Promise.all(rows.map((p) => buscarPedido(pool, p.id)));
    res.json(pedidos);
  });

  // Cantina: avança o status respeitando o fluxo permitido.
  r.patch('/:id/status', admin, async (req, res) => {
    const id = idDaRota(req);
    const novo = req.body && req.body.status;
    if (!STATUS.includes(novo)) throw new ErroApp(400, `status deve ser um de: ${STATUS.join(', ')}`);

    await transacao(pool, async (client) => {
      const { rows } = await client.query('SELECT status FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw new ErroApp(404, 'pedido não encontrado');
      if (!podeTransitar(rows[0].status, novo)) {
        throw new ErroApp(409, `não é possível mudar de "${rows[0].status}" para "${novo}"`);
      }
      await client.query('UPDATE pedidos SET status = $2, atualizado_em = NOW() WHERE id = $1', [id, novo]);
    });

    res.json(await buscarPedido(pool, id));
  });

  return r;
}

module.exports = { rotasPedidos };
