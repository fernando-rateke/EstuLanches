'use strict';

// Frontend do EstuLanches (JavaScript puro, sem frameworks).
// Segurança: todo texto vindo da API é inserido com textContent (nunca innerHTML),
// o que impede injeção de HTML/JS (XSS).

const $ = (sel) => document.querySelector(sel);
const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const CATEGORIAS = { lanche: 'Lanches', salgado: 'Salgados', refeicao: 'Refeições', bebida: 'Bebidas', doce: 'Doces' };
const PROXIMOS = { recebido: ['preparando', 'cancelado'], preparando: ['pronto', 'cancelado'], pronto: ['entregue'] };

const carrinho = new Map(); // produto_id -> { produto, quantidade }
let token = sessionStorage.getItem('estulanches_token') || '';

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('data-')) e.setAttribute(k, v);
    else e[k] = v;
  }
  filhos.flat().forEach((f) => f != null && e.append(f));
  return e;
}

async function api(caminho, { metodo = 'GET', corpo, admin = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (admin) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const dados = resp.status === 204 ? null : await resp.json().catch(() => null);
  if (!resp.ok) {
    const detalhes = dados && dados.detalhes ? `: ${dados.detalhes.join('; ')}` : '';
    const erro = new Error(((dados && dados.erro) || `erro ${resp.status}`) + detalhes);
    erro.status = resp.status;
    throw erro;
  }
  return dados;
}

function mensagem(seletor, texto, tipo = 'ok') {
  const m = $(seletor);
  m.textContent = texto;
  m.className = `msg ${tipo}`;
}

// ---------- Abas ----------
document.querySelectorAll('.aba').forEach((botao) =>
  botao.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b === botao));
    document.querySelectorAll('.painel').forEach((p) => p.classList.add('oculto'));
    $(`#aba-${botao.dataset.aba}`).classList.remove('oculto');
    if (botao.dataset.aba === 'cantina' && token) entrarCantina();
  }),
);

// ---------- Cardápio e carrinho (aluno) ----------
async function carregarCardapio() {
  const lista = $('#lista-produtos');
  try {
    const produtos = await api('/api/produtos');
    lista.replaceChildren();
    let categoriaAtual = '';
    for (const p of produtos) {
      if (p.categoria !== categoriaAtual) {
        categoriaAtual = p.categoria;
        lista.append(el('h3', { class: 'categoria', text: CATEGORIAS[p.categoria] || p.categoria }));
      }
      const botao = el('button', { class: 'btn primario mini', text: 'Adicionar' });
      botao.addEventListener('click', () => adicionar(p));
      lista.append(
        el('div', { class: 'produto' },
          el('span', { class: 'nome', text: p.nome }),
          el('span', { class: 'desc', text: p.descricao }),
          el('div', { class: 'rodape-card' }, el('span', { class: 'preco', text: reais(p.preco_centavos) }), botao),
        ),
      );
    }
    if (!produtos.length) lista.append(el('p', { text: 'Nenhum produto disponível no momento.' }));
  } catch (e) {
    lista.replaceChildren(el('p', { class: 'msg erro', text: `Não foi possível carregar o cardápio (${e.message}).` }));
  }
}

function adicionar(produto) {
  const item = carrinho.get(produto.id) || { produto, quantidade: 0 };
  if (item.quantidade >= 20) return;
  item.quantidade += 1;
  carrinho.set(produto.id, item);
  desenharCarrinho();
}

function remover(id) {
  const item = carrinho.get(id);
  if (!item) return;
  item.quantidade -= 1;
  if (item.quantidade <= 0) carrinho.delete(id);
  desenharCarrinho();
}

function desenharCarrinho() {
  const ul = $('#itens-carrinho');
  ul.replaceChildren();
  let total = 0;
  for (const { produto, quantidade } of carrinho.values()) {
    total += produto.preco_centavos * quantidade;
    const menos = el('button', { class: 'btn mini', text: '−', title: 'Remover um' });
    menos.addEventListener('click', () => remover(produto.id));
    ul.append(el('li', {}, el('span', { text: `${quantidade}× ${produto.nome}` }),
      el('span', {}, reais(produto.preco_centavos * quantidade), ' ', menos)));
  }
  if (!carrinho.size) ul.append(el('li', { class: 'vazio', text: 'Nenhum item ainda.' }));
  $('#total-carrinho').textContent = reais(total);
}

$('#form-pedido').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!carrinho.size) return mensagem('#msg-pedido', 'Adicione pelo menos um item.', 'erro');
  try {
    const pedido = await api('/api/pedidos', {
      metodo: 'POST',
      corpo: {
        cliente_nome: $('#cliente-nome').value,
        observacao: $('#observacao').value,
        itens: [...carrinho.values()].map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
      },
    });
    carrinho.clear();
    desenharCarrinho();
    $('#observacao').value = '';
    mensagem('#msg-pedido', `Pedido nº ${pedido.id} recebido! Total ${reais(pedido.total_centavos)}. Guarde o número.`);
    $('#numero-pedido').value = pedido.id;
  } catch (e) {
    mensagem('#msg-pedido', e.message, 'erro');
  }
});

// ---------- Acompanhar pedido (aluno) ----------
function cartaoPedido(p, acoes = []) {
  return el('div', { class: 'pedido' },
    el('h3', {}, el('span', { text: `#${p.id} · ${p.cliente_nome}` }), el('span', { class: `selo ${p.status}`, text: p.status })),
    el('ul', {}, p.itens.map((i) => el('li', { text: `${i.quantidade}× ${i.nome} (${reais(i.preco_unitario_centavos)})` }))),
    p.observacao ? el('p', { class: 'obs', text: `Obs.: ${p.observacao}` }) : null,
    el('p', {}, el('strong', { text: reais(p.total_centavos) }), ' · ',
      el('span', { class: 'obs', text: new Date(p.criado_em).toLocaleTimeString('pt-BR') })),
    acoes.length ? el('div', { class: 'acoes' }, acoes) : null,
  );
}

$('#form-acompanhar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const alvo = $('#resultado-pedido');
  try {
    const p = await api(`/api/pedidos/${encodeURIComponent($('#numero-pedido').value)}`);
    alvo.replaceChildren(cartaoPedido(p));
  } catch (e) {
    alvo.replaceChildren(el('p', { class: 'msg erro', text: e.message }));
  }
});

// ---------- Cantina (admin) ----------
$('#form-login').addEventListener('submit', (ev) => {
  ev.preventDefault();
  token = $('#token').value;
  $('#token').value = '';
  entrarCantina();
});

$('#btn-sair').addEventListener('click', () => {
  token = '';
  sessionStorage.removeItem('estulanches_token');
  $('#area-cantina').classList.add('oculto');
  $('#form-login').classList.remove('oculto');
});

$('#btn-atualizar').addEventListener('click', () => carregarFila());
$('#filtro-status').addEventListener('change', () => carregarFila());

async function entrarCantina() {
  try {
    await carregarFila();
    sessionStorage.setItem('estulanches_token', token);
    $('#form-login').classList.add('oculto');
    $('#area-cantina').classList.remove('oculto');
    mensagem('#msg-cantina', '');
    carregarProdutosAdmin();
  } catch (e) {
    token = '';
    sessionStorage.removeItem('estulanches_token');
    mensagem('#msg-cantina', e.status === 401 ? 'Token inválido.' : e.message, 'erro');
  }
}

async function carregarFila() {
  const status = $('#filtro-status').value;
  const pedidos = await api(`/api/pedidos${status ? `?status=${status}` : ''}`, { admin: true });
  const fila = $('#fila-pedidos');
  fila.replaceChildren();
  for (const p of pedidos) {
    const acoes = (PROXIMOS[p.status] || []).map((novo) => {
      const b = el('button', { class: novo === 'cancelado' ? 'btn mini' : 'btn primario mini', text: `→ ${novo}` });
      b.addEventListener('click', async () => {
        try {
          await api(`/api/pedidos/${p.id}/status`, { metodo: 'PATCH', corpo: { status: novo }, admin: true });
          carregarFila();
        } catch (e) { mensagem('#msg-cantina', e.message, 'erro'); }
      });
      return b;
    });
    fila.append(cartaoPedido(p, acoes));
  }
  if (!pedidos.length) fila.append(el('p', { class: 'obs', text: 'Nenhum pedido.' }));
}

async function carregarProdutosAdmin() {
  const produtos = await api('/api/produtos/todos', { admin: true });
  const tbody = $('#tabela-produtos');
  tbody.replaceChildren();
  for (const p of produtos) {
    const chk = el('input', { type: 'checkbox', checked: p.disponivel, title: 'Disponível no cardápio' });
    chk.addEventListener('change', async () => {
      try {
        await api(`/api/produtos/${p.id}`, { metodo: 'PATCH', corpo: { disponivel: chk.checked }, admin: true });
        carregarCardapio();
      } catch (e) { chk.checked = !chk.checked; mensagem('#msg-cantina', e.message, 'erro'); }
    });
    tbody.append(el('tr', {}, el('td', { text: p.nome }), el('td', { text: CATEGORIAS[p.categoria] }),
      el('td', { text: reais(p.preco_centavos) }), el('td', {}, chk)));
  }
}

$('#form-produto').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await api('/api/produtos', {
      metodo: 'POST',
      admin: true,
      corpo: {
        nome: $('#p-nome').value,
        descricao: $('#p-descricao').value,
        categoria: $('#p-categoria').value,
        preco_centavos: Math.round(Number($('#p-preco').value) * 100),
      },
    });
    ev.target.reset();
    mensagem('#msg-cantina', 'Produto adicionado.');
    carregarProdutosAdmin();
    carregarCardapio();
  } catch (e) { mensagem('#msg-cantina', e.message, 'erro'); }
});

// ---------- Início ----------
fetch('/health').then((r) => r.json()).then((h) => { $('#versao').textContent = `v${h.versao}`; }).catch(() => {});
carregarCardapio();
desenharCarrinho();
