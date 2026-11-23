'use strict';

const CATEGORIAS = ['lanche', 'bebida', 'doce', 'salgado', 'refeicao'];
const PRECO_MAXIMO_CENTAVOS = 100000; // R$ 1.000,00

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : valor;
}

/**
 * Valida e normaliza os dados de um produto do cardápio.
 * Retorna { erros: string[], dados: object }.
 * Com parcial=true (edição), só valida os campos enviados.
 */
function validarProduto(entrada, { parcial = false } = {}) {
  const erros = [];
  const dados = {};
  const e = entrada && typeof entrada === 'object' ? entrada : {};

  if (!parcial || e.nome !== undefined) {
    const nome = texto(e.nome);
    if (typeof nome !== 'string' || nome.length < 2 || nome.length > 100) {
      erros.push('nome deve ter entre 2 e 100 caracteres');
    } else dados.nome = nome;
  }

  if (e.descricao !== undefined) {
    const descricao = texto(e.descricao);
    if (typeof descricao !== 'string' || descricao.length > 255) {
      erros.push('descricao deve ter no máximo 255 caracteres');
    } else dados.descricao = descricao;
  }

  if (!parcial || e.categoria !== undefined) {
    if (!CATEGORIAS.includes(e.categoria)) {
      erros.push(`categoria deve ser uma de: ${CATEGORIAS.join(', ')}`);
    } else dados.categoria = e.categoria;
  }

  if (!parcial || e.preco_centavos !== undefined) {
    const p = e.preco_centavos;
    if (!Number.isInteger(p) || p <= 0 || p > PRECO_MAXIMO_CENTAVOS) {
      erros.push(`preco_centavos deve ser inteiro entre 1 e ${PRECO_MAXIMO_CENTAVOS}`);
    } else dados.preco_centavos = p;
  }

  if (e.disponivel !== undefined) {
    if (typeof e.disponivel !== 'boolean') erros.push('disponivel deve ser true ou false');
    else dados.disponivel = e.disponivel;
  }

  if (parcial && erros.length === 0 && Object.keys(dados).length === 0) {
    erros.push('nenhum campo válido para atualizar');
  }

  return { erros, dados };
}

module.exports = { validarProduto, CATEGORIAS, PRECO_MAXIMO_CENTAVOS };
