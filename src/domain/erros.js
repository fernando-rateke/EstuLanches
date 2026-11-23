'use strict';

/** Erro de negócio com status HTTP associado. */
class ErroApp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

module.exports = { ErroApp };
