'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { exigirLogin, exigirPerfil } = require('./middleware/auth');
const { naoEncontrado, tratarErros, logRequisicoes } = require('./middleware/erros');
const { rotasAuth } = require('./routes/auth');
const { rotasProdutos } = require('./routes/produtos');
const { rotasPedidos } = require('./routes/pedidos');

function limitador(janelaMs, limite, mensagem) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { erro: mensagem },
  });
}

/**
 * Monta a aplicação Express. Recebe o pool do banco por parâmetro
 * (injeção de dependência): nos testes passamos um banco de teste.
 *
 * Caminho de uma requisição:
 *   segurança (helmet) -> lê JSON -> log -> limite de requisições
 *   -> login/perfil (quando a rota exige) -> rota -> resposta (ou tratador de erros)
 */
function criarApp({ pool, config }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy); // >0 quando atrás de balanceador/proxy reverso

  app.use(helmet()); // cabeçalhos de segurança: CSP, HSTS, X-Frame-Options, nosniff...
  app.use(express.json({ limit: '10kb' })); // aceita no máximo 10 KB por requisição
  app.use(logRequisicoes);

  // Healthcheck: o Docker (HEALTHCHECK) e balanceadores perguntam "está vivo?"
  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', versao: config.versao, banco: 'ok' });
    } catch {
      res.status(503).json({ status: 'erro', versao: config.versao, banco: 'indisponivel' });
    }
  });

  const rl = config.rateLimit;
  const limiteGeral = limitador(rl.janelaMs, rl.maxGeral, 'muitas requisições, tente novamente mais tarde');
  const limitePedidos = limitador(60 * 1000, rl.maxPedidos, 'muitos pedidos em pouco tempo, aguarde um minuto');
  const limiteLogin = limitador(rl.janelaMs, rl.maxLogin, 'muitas tentativas de login, aguarde alguns minutos');

  // "Porteiros" reaproveitados pelas rotas
  const login = exigirLogin(pool);
  const aluno = exigirPerfil('aluno');
  const soCantina = exigirPerfil('cantina');

  app.use('/api', limiteGeral);
  app.use('/api/auth', rotasAuth({ pool, config, login, limiteLogin }));
  app.use('/api/produtos', rotasProdutos({ pool, cantina: [login, soCantina] }));
  app.use('/api/pedidos', rotasPedidos({ pool, login, aluno, cantina: soCantina, limitePedidos }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

  app.use(naoEncontrado);
  app.use(tratarErros);
  return app;
}

module.exports = { criarApp };
