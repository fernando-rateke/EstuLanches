'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { exigirAdmin } = require('./middleware/auth');
const { naoEncontrado, tratarErros, logRequisicoes } = require('./middleware/erros');
const { rotasProdutos } = require('./routes/produtos');
const { rotasPedidos } = require('./routes/pedidos');

/**
 * Monta a aplicação Express. Recebe o pool do banco por parâmetro
 * (injeção de dependência), o que permite testar com um banco de teste.
 */
function criarApp({ pool, config }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy); // >0 quando atrás de balanceador/proxy reverso

  app.use(helmet()); // cabeçalhos de segurança: CSP, HSTS, X-Frame-Options, nosniff...
  app.use(express.json({ limit: '10kb' })); // limita tamanho do corpo
  app.use(logRequisicoes);

  // Healthcheck usado pelo Docker (HEALTHCHECK) e por balanceadores de carga.
  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', versao: config.versao, banco: 'ok' });
    } catch {
      res.status(503).json({ status: 'erro', versao: config.versao, banco: 'indisponivel' });
    }
  });

  const limiteGeral = rateLimit({
    windowMs: config.rateLimit.janelaMs,
    limit: config.rateLimit.maxGeral,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { erro: 'muitas requisições, tente novamente mais tarde' },
  });
  const limitePedidos = rateLimit({
    windowMs: 60 * 1000,
    limit: config.rateLimit.maxPedidos,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { erro: 'muitos pedidos em pouco tempo, aguarde um minuto' },
  });

  const admin = exigirAdmin(config.adminToken);

  app.use('/api', limiteGeral);
  app.use('/api/produtos', rotasProdutos({ pool, admin }));
  app.use('/api/pedidos', rotasPedidos({ pool, admin, limitePedidos }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

  app.use(naoEncontrado);
  app.use(tratarErros);
  return app;
}

module.exports = { criarApp };
