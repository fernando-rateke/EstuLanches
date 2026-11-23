'use strict';

const { ErroApp } = require('../domain/erros');

function idDaRota(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw new ErroApp(400, 'id inválido');
  return id;
}

function exigirValido({ erros, dados }) {
  if (erros.length) throw new ErroApp(400, 'dados inválidos', erros);
  return dados;
}

module.exports = { idDaRota, exigirValido };
