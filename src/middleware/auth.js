'use strict';

const crypto = require('node:crypto');

function hash(valor) {
  return crypto.createHash('sha256').update(String(valor)).digest();
}

/**
 * Protege as rotas da cantina (gestão do cardápio e dos pedidos).
 * Espera o cabeçalho: Authorization: Bearer <ADMIN_TOKEN>
 * A comparação usa timingSafeEqual para não vazar informação pelo tempo de resposta.
 */
function exigirAdmin(tokenEsperado) {
  const esperado = hash(tokenEsperado);
  return (req, res, next) => {
    const cabecalho = req.get('authorization') || '';
    const [tipo, token] = cabecalho.split(' ');
    const valido = tokenEsperado && tipo === 'Bearer' && token && crypto.timingSafeEqual(hash(token), esperado);
    if (!valido) return res.status(401).json({ erro: 'não autorizado' });
    return next();
  };
}

module.exports = { exigirAdmin };
