'use strict';

const logger = require('../logger');
const { ErroApp } = require('../domain/erros');

function naoEncontrado(req, res) {
  res.status(404).json({ erro: 'rota não encontrada' });
}

// eslint-disable-next-line no-unused-vars
function tratarErros(err, req, res, next) {
  if (err instanceof ErroApp) {
    return res.status(err.status).json({ erro: err.message, detalhes: err.detalhes });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'requisição muito grande' });
  if (err.code === '23503') return res.status(409).json({ erro: 'registro em uso por outro registro' });

  // Erro inesperado: loga o detalhe, mas não expõe stack trace ao cliente.
  logger.error('Erro interno', { erro: err.message, stack: err.stack, rota: req.originalUrl });
  return res.status(500).json({ erro: 'erro interno do servidor' });
}

function logRequisicoes(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/health') return; // não poluir o log com o healthcheck
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    logger.info('http', { metodo: req.method, rota: req.originalUrl, status: res.statusCode, ms: Math.round(ms) });
  });
  next();
}

module.exports = { naoEncontrado, tratarErros, logRequisicoes };
