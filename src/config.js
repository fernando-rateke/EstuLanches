'use strict';

const pkg = require('../package.json');

function int(valor, padrao) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) ? n : padrao;
}

/**
 * Toda a configuração vem de variáveis de ambiente (12-factor):
 * a mesma imagem Docker roda em teste, homologação e produção.
 */
function carregarConfig(env = process.env) {
  return {
    env: env.NODE_ENV || 'development',
    versao: env.APP_VERSION || pkg.version,
    porta: int(env.PORT, 3000),
    adminToken: env.ADMIN_TOKEN || '',
    trustProxy: int(env.TRUST_PROXY, 0),
    rateLimit: {
      janelaMs: int(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      maxGeral: int(env.RATE_LIMIT_MAX, 300),
      maxPedidos: int(env.RATE_LIMIT_PEDIDOS_MAX, 20),
    },
    // As credenciais do banco usam as variáveis padrão do PostgreSQL
    // (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE), lidas pelo driver "pg".
    db: {
      max: int(env.DB_POOL_MAX, 10),
    },
  };
}

function validarConfig(config) {
  const erros = [];
  if (config.env === 'production' && config.adminToken.length < 16) {
    erros.push('ADMIN_TOKEN deve ter pelo menos 16 caracteres em produção');
  }
  return erros;
}

module.exports = { carregarConfig, validarConfig };
