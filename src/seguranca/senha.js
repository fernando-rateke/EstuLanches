'use strict';

/**
 * Senhas com scrypt (já vem no Node.js, módulo "crypto", sem biblioteca extra).
 * O scrypt é lento DE PROPÓSITO e usa um "sal" aleatório por usuário:
 * mesmo que alguém roube o banco, descobrir as senhas fica caríssimo,
 * e duas pessoas com a mesma senha ficam com hashes diferentes.
 */
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const TAMANHO = 64;

async function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(String(senha), sal, TAMANHO);
  return `scrypt$${sal}$${hash.toString('hex')}`;
}

async function conferirSenha(senha, guardado) {
  const [tipo, sal, hashHex] = String(guardado || '').split('$');
  if (tipo !== 'scrypt' || !sal || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  if (esperado.length !== TAMANHO) return false;
  const calculado = await scrypt(String(senha), sal, TAMANHO);
  // comparação em tempo constante: não revela nada pelo tempo de resposta
  return crypto.timingSafeEqual(calculado, esperado);
}

module.exports = { hashSenha, conferirSenha };
