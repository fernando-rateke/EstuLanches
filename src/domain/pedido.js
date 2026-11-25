'use strict';

const { ErroApp } = require('./erros');

const STATUS = ['recebido', 'preparando', 'pronto', 'entregue', 'cancelado'];
const MAX_ITENS = 20;
const MAX_QUANTIDADE = 20;

/**
 * Fluxo do pedido na cantina. Cada status só pode ir para os listados.
 *   recebido -> preparando -> pronto -> entregue
 *   recebido/preparando -> cancelado
 */
const TRANSICOES = {
  recebido: ['preparando', 'cancelado'],
  preparando: ['pronto', 'cancelado'],
  pronto: ['entregue'],
  entregue: [],
  cancelado: [],
};

function podeTransitar(atual, novo) {
  return (TRANSICOES[atual] || []).includes(novo);
}

/** O aluno só pode desistir enquanto a cozinha ainda não começou a preparar. */
function alunoPodeCancelar(status) {
  return status === 'recebido';
}

/**
 * Valida o corpo de criação de pedido. Itens repetidos são somados.
 * O nome do aluno NÃO vem do formulário: vem da conta logada.
 */
function validarPedido(entrada) {
  const erros = [];
  const e = entrada && typeof entrada === 'object' ? entrada : {};

  let observacao = '';
  if (e.observacao !== undefined) {
    if (typeof e.observacao !== 'string' || e.observacao.length > 255) {
      erros.push('observacao deve ter no máximo 255 caracteres');
    } else observacao = e.observacao.trim();
  }

  const agrupados = new Map();
  if (!Array.isArray(e.itens) || e.itens.length === 0) {
    erros.push('itens deve ser uma lista com pelo menos 1 item');
  } else if (e.itens.length > MAX_ITENS) {
    erros.push(`pedido pode ter no máximo ${MAX_ITENS} itens`);
  } else {
    e.itens.forEach((item, i) => {
      const id = item && item.produto_id;
      const qtd = item && item.quantidade;
      if (!Number.isInteger(id) || id <= 0) erros.push(`itens[${i}].produto_id inválido`);
      else if (!Number.isInteger(qtd) || qtd < 1 || qtd > MAX_QUANTIDADE) {
        erros.push(`itens[${i}].quantidade deve ser inteiro entre 1 e ${MAX_QUANTIDADE}`);
      } else agrupados.set(id, (agrupados.get(id) || 0) + qtd);
    });
    for (const [id, qtd] of agrupados) {
      if (qtd > MAX_QUANTIDADE) erros.push(`quantidade total do produto ${id} excede ${MAX_QUANTIDADE}`);
    }
  }

  const itens = [...agrupados].map(([produto_id, quantidade]) => ({ produto_id, quantidade }));
  return { erros, dados: { observacao, itens } };
}

/**
 * Calcula o total do pedido em centavos, usando o preço atual do cardápio.
 * Valores monetários são inteiros (centavos) para evitar erros de ponto
 * flutuante (ex.: 0.1 + 0.2 !== 0.3).
 * @param itens    [{ produto_id, quantidade }]
 * @param produtos Map produto_id -> { preco_centavos, disponivel, nome }
 */
function calcularTotal(itens, produtos) {
  let total = 0;
  const linhas = itens.map(({ produto_id, quantidade }) => {
    const produto = produtos.get(produto_id);
    if (!produto) throw new ErroApp(422, `produto ${produto_id} não existe`);
    if (!produto.disponivel) throw new ErroApp(422, `produto "${produto.nome}" está indisponível`);
    total += produto.preco_centavos * quantidade;
    return { produto_id, quantidade, preco_unitario_centavos: produto.preco_centavos };
  });
  return { total_centavos: total, linhas };
}

function formatarReais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = {
  STATUS,
  TRANSICOES,
  MAX_ITENS,
  MAX_QUANTIDADE,
  podeTransitar,
  alunoPodeCancelar,
  validarPedido,
  calcularTotal,
  formatarReais,
};
