'use strict';

/**
 * Executor de MIGRAÇÕES do banco.
 *
 * Cada arquivo em db/migrations (001_..., 002_..., 003_...) é uma "mudança" no banco.
 * A tabela schema_migrations guarda quais já foram aplicadas; assim, ao subir uma
 * versão nova do sistema, só os arquivos novos rodam. Cada arquivo roda numa
 * transação: se der erro no meio, nada fica pela metade.
 */
const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');
const { hashSenha } = require('./seguranca/senha');

const PASTA = path.join(__dirname, '..', 'db', 'migrations');
const ARQUIVO_SEED = path.join(__dirname, '..', 'db', 'seed.sql');
// Trava do PostgreSQL (advisory lock): se várias cópias da aplicação subirem
// juntas, só uma aplica as migrações por vez.
const TRAVA = 2026111801;

function listarMigracoes() {
  return fs.readdirSync(PASTA).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
}

async function migrar(pool, { seed = true, contaCantina } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [TRAVA]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      versao VARCHAR(100) PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

    const { rows } = await client.query('SELECT versao FROM schema_migrations');
    const aplicadas = new Set(rows.map((r) => r.versao));
    const pendentes = listarMigracoes().filter((f) => !aplicadas.has(f));

    for (const arquivo of pendentes) {
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(PASTA, arquivo), 'utf8'));
        await client.query('INSERT INTO schema_migrations (versao) VALUES ($1)', [arquivo]);
        await client.query('COMMIT');
        logger.info('Migração aplicada', { arquivo });
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`falha na migração ${arquivo}: ${err.message}`);
      }
    }
    logger.info('Banco atualizado', { migracoes: aplicadas.size + pendentes.length, novas: pendentes.length });

    if (seed) await client.query(fs.readFileSync(ARQUIVO_SEED, 'utf8'));
    if (contaCantina && contaCantina.senha) await garantirContaCantina(client, contaCantina);
    else if (contaCantina) logger.warn('CANTINA_SENHA vazia: conta da cantina não foi criada');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [TRAVA]).catch(() => {});
    client.release();
  }
}

/** Cria a conta da equipe da cantina na primeira subida (se ainda não existir). */
async function garantirContaCantina(client, { login, senha }) {
  const { rowCount } = await client.query('SELECT 1 FROM usuarios WHERE matricula = $1', [login]);
  if (rowCount) return;
  await client.query(
    `INSERT INTO usuarios (nome, matricula, senha_hash, perfil) VALUES ('Equipe da Cantina', $1, $2, 'cantina')`,
    [login, await hashSenha(senha)],
  );
  logger.info('Conta da cantina criada', { login });
}

module.exports = { migrar, listarMigracoes };
