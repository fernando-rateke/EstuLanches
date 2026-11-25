'use strict';

const express = require('express');
const {
  validarPedido, calcularTotal, podeTransitar, alunoPodeCancelar, STATUS,
} = require('../domain/pedido');
const { ErroApp } = require('../domain/erros');
const { transacao } = require('../db');
const { idDaRota, exigirValido } = require('./util');

/**
 * Busca pedidos já com os itens e o nome do aluno, numa única consulta.
 * "filtro" é sempre um trecho FIXO escrito aqui no código; os valores vão em "params".
 */
async function consultarPedidos(db, filtro, params, limite = 100) {
  const { rows } = await db.query(
    `SELECT p.id, p.usuario_id, u.nome AS cliente_nome, u.matricula, p.observacao, p.status,
            p.total_centavos, p.criado_em, p.atualizado_em,
            COALESCE(json_agg(json_build_object(
              'produto_id', i.produto_id, 'nome', pr.nome,
              'quantidade', i.quantidade, 'preco_unitario_centavos', i.preco_unitario_centavos
            ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS itens
       FROM pedidos p
       JOIN usuarios u ON u.id = p.usuario_id
       LEFT JOIN itens_pedido i ON i.pedido_id = p.id
       LEFT JOIN produtos pr ON pr.id = i.produto_id
      WHERE ${filtro}
      GROUP BY p.id, u.id
      ORDER BY p.criado_em DESC, p.id DESC
      LIMIT ${Number(limite)}`,
    params,
  );
  return rows;
}

async function buscarPedido(db, id) {
  return (await consultarPedidos(db, 'p.id = $1', [id], 1))[0];
}

/**
 * Pedidos.
 *   aluno    -> faz pedido, vê os SEUS pedidos, cancela enquanto "recebido"
 *   cantina  -> vê a fila inteira e avança o status
 */
function rotasPedidos({ pool, login, aluno, cantina, limitePedidos }) {
  const r = express.Router();

  // Preço e total são SEMPRE calculados aqui no servidor.
  // O navegador só diz QUAL produto e QUANTOS.
  r.post('/', login, aluno, limitePedidos, async (req, res) => {
    const d = exigirValido(validarPedido(req.body));

    const id = await transacao(pool, async (client) => {
      const { rows } = await client.query(
        'SELECT id, nome, preco_centavos, disponivel FROM produtos WHERE id = ANY($1::int[]) FOR SHARE',
        [d.itens.map((i) => i.produto_id)],
      );
      const { total_centavos, linhas } = calcularTotal(d.itens, new Map(rows.map((p) => [p.id, p])));

      const novo = await client.query(
        'INSERT INTO pedidos (usuario_id, observacao, total_centavos) VALUES ($1, $2, $3) RETURNING id',
        [req.usuario.id, d.observacao, total_centavos],
      );
      for (const l of linhas) {
        await client.query(
          `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario_centavos)
           VALUES ($1, $2, $3, $4)`,
          [novo.rows[0].id, l.produto_id, l.quantidade, l.preco_unitario_centavos],
        );
      }
      return novo.rows[0].id;
    });

    res.status(201).json(await buscarPedido(pool, id));
  });

  // Histórico do aluno logado
  r.get('/meus', login, async (req, res) => {
    res.json(await consultarPedidos(pool, 'p.usuario_id = $1', [req.usuario.id], 50));
  });

  // Fila da cantina (opcional: ?status=preparando)
  r.get('/', login, cantina, async (req, res) => {
    const { status } = req.query;
    if (status !== undefined && !STATUS.includes(status)) throw new ErroApp(400, 'status inválido');
    res.json(status
      ? await consultarPedidos(pool, 'p.status = $1', [status])
      : await consultarPedidos(pool, 'TRUE', []));
  });

  // Um pedido. Aluno só enxerga os próprios; pedido de outro aluno = "não encontrado".
  r.get('/:id', login, async (req, res) => {
    const pedido = await buscarPedido(pool, idDaRota(req));
    const dono = pedido && pedido.usuario_id === req.usuario.id;
    if (!pedido || (!dono && req.usuario.perfil !== 'cantina')) throw new ErroApp(404, 'pedido não encontrado');
    res.json(pedido);
  });

  // Aluno desiste do pedido (só enquanto "recebido")
  r.post('/:id/cancelar', login, aluno, async (req, res) => {
    const id = idDaRota(req);
    await transacao(pool, async (client) => {
      const { rows } = await client.query(
        'SELECT status FROM pedidos WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
        [id, req.usuario.id],
      );
      if (!rows[0]) throw new ErroApp(404, 'pedido não encontrado');
      if (!alunoPodeCancelar(rows[0].status)) {
        throw new ErroApp(409, 'a cantina já começou este pedido; fale com o balcão');
      }
      await client.query("UPDATE pedidos SET status = 'cancelado', atualizado_em = NOW() WHERE id = $1", [id]);
    });
    res.json(await buscarPedido(pool, id));
  });

  // Cantina avança o status respeitando o fluxo permitido
  r.patch('/:id/status', login, cantina, async (req, res) => {
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
