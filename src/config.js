'use strict';

const pkg = require('../package.json');

function int(valor, padrao) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) ? n : padrao;
}

/**
 * Toda a configuração vem de VARIÁVEIS DE AMBIENTE.
 * Assim a mesma imagem Docker roda em teste e em produção;
 * só muda o que é passado pelo docker-compose / arquivo .env.
 */
function carregarConfig(env = process.env) {
  return {
    env: env.NODE_ENV || 'development',
    versao: env.APP_VERSION || pkg.version,
    porta: int(env.PORT, 3000),
    trustProxy: int(env.TRUST_PROXY, 0),
    // Conta da equipe da cantina, criada automaticamente na primeira subida
    cantina: {
      login: (env.CANTINA_LOGIN || 'cantina').toLowerCase(),
      senha: env.CANTINA_SENHA || '',
    },
    sessaoHoras: int(env.SESSAO_HORAS, 8), // um turno escolar
    rateLimit: {
      janelaMs: int(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      maxGeral: int(env.RATE_LIMIT_MAX, 300),
      maxPedidos: int(env.RATE_LIMIT_PEDIDOS_MAX, 20),
      maxLogin: int(env.RATE_LIMIT_LOGIN_MAX, 10),
    },
    // Credenciais do banco: variáveis padrão do PostgreSQL (PGHOST, PGUSER,
    // PGPASSWORD, PGDATABASE...), lidas automaticamente pelo driver "pg".
    db: { max: int(env.DB_POOL_MAX, 10) },
  };
}

function validarConfig(config) {
  const erros = [];
  if (config.env === 'production' && config.cantina.senha.length < 10) {
    erros.push('CANTINA_SENHA deve ter pelo menos 10 caracteres em produção');
  }
  if (config.sessaoHoras < 1 || config.sessaoHoras > 24) erros.push('SESSAO_HORAS deve estar entre 1 e 24');
  return erros;
}

module.exports = { carregarConfig, validarConfig };
