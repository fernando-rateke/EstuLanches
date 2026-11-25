'use strict';

// =====================================================================
// Frontend do EstuLanches (JavaScript puro, sem frameworks)
//
// Segurança:
//  - todo texto vindo da API entra na tela com textContent (nunca innerHTML),
//    então ninguém consegue injetar HTML/JS (XSS);
//  - o código de sessão fica no sessionStorage: some ao fechar a aba.
// =====================================================================

const $ = (sel) => document.querySelector(sel);
const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const CATEGORIAS = { lanche: 'Lanches', salgado: 'Salgados', refeicao: 'Refeições', bebida: 'Bebidas', doce: 'Doces' };
const PROXIMOS = { recebido: ['preparando', 'cancelado'], preparando: ['pronto', 'cancelado'], pronto: ['entregue'] };
const CHAVE = 'estulanches_sessao';

const estado = {
  token: sessionStorage.getItem(CHAVE) || '',
  usuario: null,          // { id, nome, matricula, perfil }
  carrinho: new Map(),    // produto_id -> { produto, quantidade }
  timer: null,            // atualização automática
};

// ---------- utilitários ----------
function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e[k] = v;
  }
  filhos.flat().forEach((f) => f != null && e.append(f));
  return e;
}

async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (estado.token) headers.Authorization = `Bearer ${estado.token}`;
  const resp = await fetch(caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const dados = resp.status === 204 ? null : await resp.json().catch(() => null);
  if (resp.status === 401 && estado.usuario) sairLocal(); // sessão expirou
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

// ---------- abas ----------
function abrirAba(nome) {
  document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
  document.querySelectorAll('.painel').forEach((p) => p.classList.toggle('oculto', p.id !== `aba-${nome}`));
  clearInterval(estado.timer);
  if (nome === 'meus') { carregarMeus(); estado.timer = setInterval(carregarMeus, 15000); }
  if (nome === 'cantina') { carregarFila(); carregarProdutosAdmin(); estado.timer = setInterval(carregarFila, 15000); }
}
document.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

// ---------- sessão ----------
function aplicarUsuario() {
  const u = estado.usuario;
  const perfil = u ? u.perfil : 'visitante';
  document.querySelectorAll('.so-aluno').forEach((e) => e.classList.toggle('oculto', perfil !== 'aluno'));
  document.querySelectorAll('.so-cantina').forEach((e) => e.classList.toggle('oculto', perfil !== 'cantina'));
  document.querySelectorAll('.so-visitante').forEach((e) => e.classList.toggle('oculto', perfil !== 'visitante'));
  $('#quem').classList.toggle('oculto', !u);
  if (u) {
    $('#quem-nome').textContent = u.nome;
    $('#quem-perfil').textContent = u.perfil;
    $('#quem-perfil').className = `selo ${u.perfil}`;
  }
  $('#form-pedido').classList.toggle('oculto', perfil === 'cantina');
  $('#btn-pedir').textContent = perfil === 'aluno' ? 'Fazer pedido' : 'Entre para pedir';
}

function guardarSessao({ token, usuario }) {
  estado.token = token;
  estado.usuario = usuario;
  sessionStorage.setItem(CHAVE, token);
  aplicarUsuario();
  abrirAba(usuario.perfil === 'cantina' ? 'cantina' : 'cardapio');
}

function sairLocal() {
  estado.token = '';
  estado.usuario = null;
  sessionStorage.removeItem(CHAVE);
  aplicarUsuario();
  abrirAba('cardapio');
}

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const r = await api('/api/auth/login', { metodo: 'POST', corpo: { matricula: $('#l-matricula').value, senha: $('#l-senha').value } });
    ev.target.reset();
    mensagem('#msg-login', '');
    guardarSessao(r);
  } catch (e) { mensagem('#msg-login', e.message, 'erro'); }
});

$('#form-cadastro').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const r = await api('/api/auth/cadastro', {
      metodo: 'POST',
      corpo: { nome: $('#c-nome').value, matricula: $('#c-matricula').value, senha: $('#c-senha').value },
    });
    ev.target.reset();
    mensagem('#msg-cadastro', '');
    guardarSessao(r);
  } catch (e) { mensagem('#msg-cadastro', e.message, 'erro'); }
});

$('#btn-sair').addEventListener('click', async () => {
  await api('/api/auth/logout', { metodo: 'POST' }).catch(() => {});
  sairLocal();
});

// ---------- cardápio e carrinho ----------
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
      botao.addEventListener('click', () => mudarQuantidade(p, +1));
      lista.append(el('div', { class: 'produto' },
        el('span', { class: 'nome', text: p.nome }),
        el('span', { class: 'desc', text: p.descricao }),
        el('div', { class: 'rodape-card' }, el('span', { class: 'preco', text: reais(p.preco_centavos) }), botao)));
    }
    if (!produtos.length) lista.append(el('p', { text: 'Nenhum produto disponível no momento.' }));
  } catch (e) {
    lista.replaceChildren(el('p', { class: 'msg erro', text: `Não foi possível carregar o cardápio (${e.message}).` }));
  }
}

function mudarQuantidade(produto, delta) {
  const item = estado.carrinho.get(produto.id) || { produto, quantidade: 0 };
  item.quantidade = Math.min(20, item.quantidade + delta);
  if (item.quantidade <= 0) estado.carrinho.delete(produto.id);
  else estado.carrinho.set(produto.id, item);
  desenharCarrinho();
}

function desenharCarrinho() {
  const ul = $('#itens-carrinho');
  ul.replaceChildren();
  let total = 0;
  for (const { produto, quantidade } of estado.carrinho.values()) {
    total += produto.preco_centavos * quantidade;
    const menos = el('button', { class: 'btn mini', text: '−', title: 'Remover um' });
    menos.addEventListener('click', () => mudarQuantidade(produto, -1));
    ul.append(el('li', {}, el('span', { text: `${quantidade}× ${produto.nome}` }),
      el('span', {}, reais(produto.preco_centavos * quantidade), ' ', menos)));
  }
  if (!estado.carrinho.size) ul.append(el('li', { class: 'vazio', text: 'Nenhum item ainda.' }));
  $('#total-carrinho').textContent = reais(total);
}

$('#form-pedido').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!estado.usuario) return abrirAba('entrar');
  if (!estado.carrinho.size) return mensagem('#msg-pedido', 'Adicione pelo menos um item.', 'erro');
  try {
    const pedido = await api('/api/pedidos', {
      metodo: 'POST',
      corpo: {
        observacao: $('#observacao').value,
        itens: [...estado.carrinho.values()].map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
      },
    });
    estado.carrinho.clear();
    desenharCarrinho();
    $('#observacao').value = '';
    mensagem('#msg-pedido', `Pedido nº ${pedido.id} enviado! Total ${reais(pedido.total_centavos)}. Acompanhe em "Meus pedidos".`);
  } catch (e) { mensagem('#msg-pedido', e.message, 'erro'); }
});

// ---------- cartão de pedido (usado pelo aluno e pela cantina) ----------
function cartaoPedido(p, acoes = []) {
  return el('div', { class: 'pedido' },
    el('h3', {}, el('span', { text: `#${p.id} · ${p.cliente_nome}` }), el('span', { class: `selo ${p.status}`, text: p.status })),
    el('ul', {}, p.itens.map((i) => el('li', { text: `${i.quantidade}× ${i.nome} (${reais(i.preco_unitario_centavos)})` }))),
    p.observacao ? el('p', { class: 'obs', text: `Obs.: ${p.observacao}` }) : null,
    el('p', {}, el('strong', { text: reais(p.total_centavos) }), ' · ',
      el('span', { class: 'obs', text: new Date(p.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) })),
    acoes.length ? el('div', { class: 'acoes' }, acoes) : null);
}

function botao(texto, classe, acao, msg) {
  const b = el('button', { class: classe, text: texto });
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await acao(); } catch (e) { mensagem(msg, e.message, 'erro'); b.disabled = false; }
  });
  return b;
}

// ---------- aluno: meus pedidos ----------
async function carregarMeus() {
  if (!estado.usuario) return;
  try {
    const pedidos = await api('/api/pedidos/meus');
    const lista = $('#lista-meus');
    lista.replaceChildren();
    for (const p of pedidos) {
      const acoes = p.status === 'recebido'
        ? [botao('Cancelar pedido', 'btn mini', async () => {
          await api(`/api/pedidos/${p.id}/cancelar`, { metodo: 'POST' });
          carregarMeus();
        }, '#msg-meus')]
        : [];
      lista.append(cartaoPedido(p, acoes));
    }
    if (!pedidos.length) lista.append(el('p', { class: 'obs', text: 'Você ainda não fez pedidos.' }));
  } catch (e) { mensagem('#msg-meus', e.message, 'erro'); }
}

// ---------- cantina: fila e cardápio ----------
$('#btn-atualizar').addEventListener('click', () => carregarFila());
$('#filtro-status').addEventListener('change', () => carregarFila());

async function carregarFila() {
  if (!estado.usuario || estado.usuario.perfil !== 'cantina') return;
  try {
    const status = $('#filtro-status').value;
    const pedidos = await api(`/api/pedidos${status ? `?status=${status}` : ''}`);
    const fila = $('#fila-pedidos');
    fila.replaceChildren();
    for (const p of pedidos) {
      const acoes = (PROXIMOS[p.status] || []).map((novo) => botao(`→ ${novo}`,
        novo === 'cancelado' ? 'btn mini' : 'btn primario mini', async () => {
          await api(`/api/pedidos/${p.id}/status`, { metodo: 'PATCH', corpo: { status: novo } });
          carregarFila();
        }, '#msg-cantina'));
      fila.append(cartaoPedido(p, acoes));
    }
    if (!pedidos.length) fila.append(el('p', { class: 'obs', text: 'Nenhum pedido.' }));
  } catch (e) { mensagem('#msg-cantina', e.message, 'erro'); }
}

async function carregarProdutosAdmin() {
  if (!estado.usuario || estado.usuario.perfil !== 'cantina') return;
  const produtos = await api('/api/produtos/todos');
  const tbody = $('#tabela-produtos');
  tbody.replaceChildren();
  for (const p of produtos) {
    const chk = el('input', { type: 'checkbox', checked: p.disponivel, title: 'Disponível no cardápio' });
    chk.addEventListener('change', async () => {
      try {
        await api(`/api/produtos/${p.id}`, { metodo: 'PATCH', corpo: { disponivel: chk.checked } });
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

// ---------- início ----------
async function iniciar() {
  fetch('/health').then((r) => r.json()).then((h) => { $('#versao').textContent = `v${h.versao}`; }).catch(() => {});
  if (estado.token) {
    try { estado.usuario = await api('/api/auth/eu'); } catch { sairLocal(); }
  }
  aplicarUsuario();
  desenharCarrinho();
  carregarCardapio();
}
iniciar();
