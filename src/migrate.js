'use strict';

const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');

const DIR_SQL = path.join(__dirname, '..', 'db');
// Número arbitrário para o advisory lock: com várias réplicas da aplicação
// subindo ao mesmo tempo, só uma executa a migração por vez.
const LOCK_ID = 2026111801;

async function migrar(pool, { seed = true } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(fs.readFileSync(path.join(DIR_SQL, 'schema.sql'), 'utf8'));
    if (seed) await client.query(fs.readFileSync(path.join(DIR_SQL, 'seed.sql'), 'utf8'));
    logger.info('Migrações do banco aplicadas', { seed });
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { migrar };
