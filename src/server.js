'use strict';

const { carregarConfig, validarConfig } = require('./config');
const { criarPool, aguardarBanco } = require('./db');
const { migrar } = require('./migrate');
const { criarApp } = require('./app');
const logger = require('./logger');

async function iniciar() {
  const config = carregarConfig();
  const erros = validarConfig(config);
  if (erros.length) {
    erros.forEach((e) => logger.error('Configuração inválida', { erro: e }));
    process.exit(1);
  }

  logger.info('Iniciando EstuLanches', { versao: config.versao, ambiente: config.env });

  const pool = criarPool(config.db);
  await aguardarBanco(pool);
  logger.info('Conectado ao PostgreSQL', { host: process.env.PGHOST, banco: process.env.PGDATABASE });
  await migrar(pool, { contaCantina: config.cantina });

  const app = criarApp({ pool, config });
  const servidor = app.listen(config.porta, () => {
    logger.info('Servidor HTTP no ar', { porta: config.porta });
  });

  // Desligamento gracioso: o "docker stop" envia SIGTERM; terminamos as
  // requisições em andamento e fechamos as conexões com o banco.
  const desligar = (sinal) => {
    logger.info('Sinal recebido, encerrando', { sinal });
    servidor.close(async () => {
      await pool.end();
      logger.info('Encerrado com sucesso');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', desligar);
  process.on('SIGINT', desligar);
}

iniciar().catch((err) => {
  logger.error('Falha ao iniciar a aplicação', { erro: err.message });
  process.exit(1);
});
