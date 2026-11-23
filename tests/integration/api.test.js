'use strict';

/**
 * Testes de integração: sobem a aplicação Express de verdade e usam um
 * PostgreSQL real (variáveis PG*). Rode com:
 *   docker compose --profile test run --rm test
 */
process.env.LOG_SILENT = 'true';

const request = require('supertest');
const { criarPool } = require('../../src/db');
const { migrar } = require('../../src/migrate');
const { criarApp } = require('../../src/app');
const { carregarConfig } = require('../../src/config');

const TOKEN = 'token-de-integracao-123456';
const auth = { Authorization: `Bearer ${TOKEN}` };

let pool;
let app;

beforeAll(async () => {
  pool = criarPool();
  await migrar(pool, { seed: false });
  const config = carregarConfig({ ...process.env, ADMIN_TOKEN: TOKEN, RATE_LIMIT_MAX: '10000', RATE_LIMIT_PEDIDOS_MAX: '10000' });
  app = criarApp({ pool, config });
});

beforeEach(async () => {
  await pool.query('TRUNCATE itens_pedido, pedidos, produtos RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

async function criarProduto(dados = {}) {
  const res = await request(app).post('/api/produtos').set(auth)
    .send({ nome: 'X-Salada', categoria: 'lanche', preco_centavos: 1200, ...dados }).expect(201);
  return res.body;
}

describe('saúde e segurança', () => {
  test('GET /health responde ok com banco conectado', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', banco: 'ok' });
  });

  test('envia cabeçalhos de segurança (helmet) e esconde X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('serve o frontend', async () => {
    const res = await request(app).get('/').expect(200);
    expect(res.text).toContain('EstuLanches');
  });

  test('rotas da cantina exigem token', async () => {
    await request(app).post('/api/produtos').send({ nome: 'X', categoria: 'lanche', preco_centavos: 1 }).expect(401);
    await request(app).get('/api/pedidos').expect(401);
    await request(app).patch('/api/pedidos/1/status').send({ status: 'pronto' }).expect(401);
  });

  test('JSON inválido retorna 400 sem stack trace', async () => {
    const res = await request(app).post('/api/pedidos').set('Content-Type', 'application/json').send('{ruim').expect(400);
    expect(res.body).toEqual({ erro: 'JSON inválido' });
  });

  test('tentativa de SQL injection no id é rejeitada', async () => {
    await request(app).get("/api/produtos/1;DROP TABLE produtos").expect(400);
    const { rows } = await pool.query("SELECT to_regclass('produtos') AS t");
    expect(rows[0].t).toBe('produtos');
  });

  test('rota inexistente retorna 404', async () => {
    await request(app).get('/api/nada').expect(404);
  });
});

describe('cardápio (produtos)', () => {
  test('cria, lista, edita e remove produto', async () => {
    const p = await criarProduto({ descricao: 'Pão e hambúrguer' });
    expect(p).toMatchObject({ id: 1, nome: 'X-Salada', preco_centavos: 1200, disponivel: true });

    let lista = await request(app).get('/api/produtos').expect(200);
    expect(lista.body).toHaveLength(1);

    const editado = await request(app).patch(`/api/produtos/${p.id}`).set(auth).send({ preco_centavos: 1300 }).expect(200);
    expect(editado.body.preco_centavos).toBe(1300);

    await request(app).delete(`/api/produtos/${p.id}`).set(auth).expect(204);
    await request(app).get(`/api/produtos/${p.id}`).expect(404);
  });

  test('produto indisponível some do cardápio público, mas aparece para a cantina', async () => {
    const p = await criarProduto();
    await request(app).patch(`/api/produtos/${p.id}`).set(auth).send({ disponivel: false }).expect(200);
    expect((await request(app).get('/api/produtos')).body).toHaveLength(0);
    expect((await request(app).get('/api/produtos/todos').set(auth)).body).toHaveLength(1);
  });

  test('valida os dados do produto', async () => {
    const res = await request(app).post('/api/produtos').set(auth).send({ nome: 'A', categoria: 'pizza' }).expect(400);
    expect(res.body.detalhes.length).toBeGreaterThanOrEqual(3);
  });

  test('não permite remover produto que já está em pedido (409)', async () => {
    const p = await criarProduto();
    await request(app).post('/api/pedidos').send({ cliente_nome: 'Ana', itens: [{ produto_id: p.id, quantidade: 1 }] }).expect(201);
    await request(app).delete(`/api/produtos/${p.id}`).set(auth).expect(409);
  });
});

describe('pedidos', () => {
  test('fluxo completo: aluno pede -> cantina prepara -> pronto -> entregue', async () => {
    const lanche = await criarProduto();
    const suco = await criarProduto({ nome: 'Suco', categoria: 'bebida', preco_centavos: 600 });

    const criado = await request(app).post('/api/pedidos').send({
      cliente_nome: 'João', observacao: 'sem cebola',
      itens: [{ produto_id: lanche.id, quantidade: 2 }, { produto_id: suco.id, quantidade: 1 }],
    }).expect(201);
    expect(criado.body).toMatchObject({ id: 1, status: 'recebido', total_centavos: 3000, observacao: 'sem cebola' });
    expect(criado.body.itens).toHaveLength(2);

    for (const status of ['preparando', 'pronto', 'entregue']) {
      const r = await request(app).patch('/api/pedidos/1/status').set(auth).send({ status }).expect(200);
      expect(r.body.status).toBe(status);
    }

    const consulta = await request(app).get('/api/pedidos/1').expect(200);
    expect(consulta.body.status).toBe('entregue');
  });

  test('o total é calculado no servidor (ignora preço enviado pelo cliente)', async () => {
    const p = await criarProduto();
    const res = await request(app).post('/api/pedidos').send({
      cliente_nome: 'Malicioso', total_centavos: 1,
      itens: [{ produto_id: p.id, quantidade: 1, preco_unitario_centavos: 1 }],
    }).expect(201);
    expect(res.body.total_centavos).toBe(1200);
  });

  test('preço do pedido fica congelado mesmo se o cardápio mudar', async () => {
    const p = await criarProduto();
    await request(app).post('/api/pedidos').send({ cliente_nome: 'Ana', itens: [{ produto_id: p.id, quantidade: 1 }] });
    await request(app).patch(`/api/produtos/${p.id}`).set(auth).send({ preco_centavos: 9999 });
    const res = await request(app).get('/api/pedidos/1');
    expect(res.body.total_centavos).toBe(1200);
    expect(res.body.itens[0].preco_unitario_centavos).toBe(1200);
  });

  test('não aceita produto indisponível nem inexistente', async () => {
    const p = await criarProduto({ disponivel: false });
    await request(app).post('/api/pedidos').send({ cliente_nome: 'Ana', itens: [{ produto_id: p.id, quantidade: 1 }] }).expect(422);
    await request(app).post('/api/pedidos').send({ cliente_nome: 'Ana', itens: [{ produto_id: 999, quantidade: 1 }] }).expect(422);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM pedidos');
    expect(rows[0].n).toBe(0); // transação desfeita: nenhum pedido "pela metade"
  });

  test('bloqueia transição de status inválida (409)', async () => {
    const p = await criarProduto();
    await request(app).post('/api/pedidos').send({ cliente_nome: 'Ana', itens: [{ produto_id: p.id, quantidade: 1 }] });
    await request(app).patch('/api/pedidos/1/status').set(auth).send({ status: 'entregue' }).expect(409);
    await request(app).patch('/api/pedidos/1/status').set(auth).send({ status: 'voando' }).expect(400);
  });

  test('cantina lista e filtra a fila por status', async () => {
    const p = await criarProduto();
    for (const nome of ['Ana', 'Bia', 'Caio']) {
      await request(app).post('/api/pedidos').send({ cliente_nome: nome, itens: [{ produto_id: p.id, quantidade: 1 }] });
    }
    await request(app).patch('/api/pedidos/2/status').set(auth).send({ status: 'preparando' });

    const todos = await request(app).get('/api/pedidos').set(auth).expect(200);
    expect(todos.body).toHaveLength(3);
    const preparando = await request(app).get('/api/pedidos?status=preparando').set(auth).expect(200);
    expect(preparando.body.map((x) => x.cliente_nome)).toEqual(['Bia']);
    await request(app).get('/api/pedidos?status=xyz').set(auth).expect(400);
  });

  test('pedido inexistente retorna 404', async () => {
    await request(app).get('/api/pedidos/12345').expect(404);
  });
});

describe('limite de requisições (rate limit)', () => {
  test('bloqueia excesso de pedidos com 429', async () => {
    const config = carregarConfig({ ...process.env, ADMIN_TOKEN: TOKEN, RATE_LIMIT_PEDIDOS_MAX: '2' });
    const appLimitado = criarApp({ pool, config });
    const p = await criarProduto();
    const corpo = { cliente_nome: 'Ana', itens: [{ produto_id: p.id, quantidade: 1 }] };
    await request(appLimitado).post('/api/pedidos').send(corpo).expect(201);
    await request(appLimitado).post('/api/pedidos').send(corpo).expect(201);
    await request(appLimitado).post('/api/pedidos').send(corpo).expect(429);
  });
});
