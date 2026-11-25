'use strict';

/**
 * Códigos de sessão: o "crachá" que o navegador mostra a cada requisição.
 * O código é aleatório (256 bits). No banco guardamos só o SHA-256 dele,
 * então quem ler o banco não consegue se passar por ninguém.
 */
const crypto = require('node:crypto');

function gerarCodigo() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashCodigo(codigo) {
  return crypto.createHash('sha256').update(String(codigo)).digest('hex');
}

module.exports = { gerarCodigo, hashCodigo };
