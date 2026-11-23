'use strict';

const { Pool } = require('pg');
const logger = require('./logger');

function criarPool(opcoes = {}) {
  const pool = new Pool({
    max: opcoes.max || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => logger.error('Erro inesperado no pool do PostgreSQL', { erro: err.message }));
  return pool;
}

/** Aguarda o banco aceitar conexões (com tentativas), útil na subida do container. */
async function aguardarBanco(pool, { tentativas = 10, intervaloMs = 2000 } = {}) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      logger.warn('Banco ainda indisponível, nova tentativa em breve', { tentativa: i, erro: err.message });
      if (i === tentativas) throw err;
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
}

/** Executa uma função dentro de uma transação (BEGIN/COMMIT/ROLLBACK). */
async function transacao(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { criarPool, aguardarBanco, transacao };
