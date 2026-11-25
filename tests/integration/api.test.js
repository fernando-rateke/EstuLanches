'use strict';

/**
 * Testes de INTEGRAÇÃO: sobem a aplicação Express de verdade e usam um
 * PostgreSQL real (variáveis PG*). Rodam dentro do Docker com:
 *   docker compose --profile test run --rm test
 */
process.env.LOG_SILENT = 'true';

const request = require('supertest');
const { criarPool } = require('../../src/db');
const { migrar } = require('../../src/migrate');
const { criarApp } = require('../../src/app');
const { carregarConfig } = require('../../src/config');
const { hashSenha } = require('../../src/seguranca/senha');

const SENHA_CANTINA = 'CantinaTeste2026';
const configBase = {
  ...process.env, CANTINA_SENHA: SENHA_CANTINA,
  RATE_LIMIT_MAX: '10000', RATE_LIMIT_PEDIDOS_MAX: '10000', RATE_LIMIT_LOGIN_MAX: '10000',
};

let pool;
let app;

beforeAll(async () => {
  pool = criarPool();
  await migrar(pool, { seed: false });
  app = criarApp({ pool, config: carregarConfig(configBase) });
});

beforeEach(async () => {
  await pool.query('TRUNCATE sessoes, itens_pedido, pedidos, produtos, usuarios RESTART IDENTITY CASCADE');
  await pool.query(
    "INSERT INTO usuarios (nome, matricula, senha_hash, perfil) VALUES ('Equipe da Cantina', 'cantina', $1, 'cantina')",
    [await hashSenha(SENHA_CANTINA)],
  );
});

afterAll(async () => {
  await pool.end();
});

// ---------- ajudantes ----------
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function entrarCantina() {
  const res = await request(app).post('/api/auth/login').send({ matricula: 'cantina', senha: SENHA_CANTINA }).expect(200);
  return bearer(res.body.token);
}

async function novoAluno(matricula = '2026a01', nome = 'Ana Lima') {
  const res = await request(app).post('/api/auth/cadastro').send({ nome, matricula, senha: 'Lanche2026' }).expect(201);
  return bearer(res.body.token);
}

async function criarProduto(cantina, dados = {}) {
  const res = await request(app).post('/api/produtos').set(cantina)
    .send({ nome: 'X-Salada', categoria: 'lanche', preco_centavos: 1200, ...dados }).expect(201);
  return res.body;
}

function fazerPedido(aluno, itens, extra = {}) {
  return request(app).post('/api/pedidos').set(aluno).send({ itens, ...extra });
}

// ---------- testes ----------
describe('saúde e cabeçalhos', () => {
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
    expect((await request(app).get('/').expect(200)).text).toContain('EstuLanches');
  });

  test('migrações ficam registradas na tabela schema_migrations', async () => {
    const { rows } = await pool.query('SELECT versao FROM schema_migrations ORDER BY versao');
    expect(rows.map((r) => r.versao)).toEqual(['001_usuarios_e_sessoes.sql', '002_cardapio.sql', '003_pedidos.sql']);
  });

  test('JSON inválido -> 400 sem stack trace', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{ruim').expect(400);
    expect(res.body).toEqual({ erro: 'JSON inválido' });
  });

  test('rota inexistente -> 404', async () => {
    await request(app).get('/api/nada').expect(404);
  });
});

describe('contas e login', () => {
  test('cadastro cria aluno, já devolve sessão e nunca devolve a senha', async () => {
    const res = await request(app).post('/api/auth/cadastro')
      .send({ nome: 'Ana Lima', matricula: '2026A01', senha: 'Lanche2026' }).expect(201);
    expect(res.body.usuario).toEqual({ id: 2, nome: 'Ana Lima', matricula: '2026a01', perfil: 'aluno' });
    expect(res.body.token).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/senha|scrypt/);

    const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = 2');
    expect(rows[0].senha_hash).toMatch(/^scrypt\$/);
  });

  test('não dá para se cadastrar como cantina', async () => {
    const res = await request(app).post('/api/auth/cadastro')
      .send({ nome: 'Espertinho', matricula: 'hacker1', senha: 'Lanche2026', perfil: 'cantina' }).expect(201);
    expect(res.body.usuario.perfil).toBe('aluno');
  });

  test('matrícula repetida -> 409', async () => {
    await novoAluno('2026a01');
    await request(app).post('/api/auth/cadastro').send({ nome: 'Outra', matricula: '2026A01', senha: 'Lanche2026' }).expect(409);
  });

  test('cadastro inválido -> 400 com detalhes', async () => {
    const res = await request(app).post('/api/auth/cadastro').send({ nome: 'A', matricula: 'x', senha: '123' }).expect(400);
    expect(res.body.detalhes.length).toBe(3);
  });

  test('login com senha errada ou matrícula inexistente -> mesma mensagem 401', async () => {
    await novoAluno('2026a01');
    const a = await request(app).post('/api/auth/login').send({ matricula: '2026a01', senha: 'Errada2026' }).expect(401);
    const b = await request(app).post('/api/auth/login').send({ matricula: 'naoexiste', senha: 'Errada2026' }).expect(401);
    expect(a.body).toEqual(b.body);
  });

  test('GET /eu mostra quem está logado; sem login -> 401', async () => {
    const aluno = await novoAluno();
    expect((await request(app).get('/api/auth/eu').set(aluno).expect(200)).body.nome).toBe('Ana Lima');
    await request(app).get('/api/auth/eu').expect(401);
    await request(app).get('/api/auth/eu').set(bearer('codigo-inventado')).expect(401);
  });

  test('logout desliga a sessão na hora', async () => {
    const aluno = await novoAluno();
    await request(app).post('/api/auth/logout').set(aluno).expect(204);
    await request(app).get('/api/auth/eu').set(aluno).expect(401);
  });

  test('sessão vencida não funciona', async () => {
    const aluno = await novoAluno();
    await pool.query("UPDATE sessoes SET expira_em = NOW() - INTERVAL '1 minute'");
    await request(app).get('/api/auth/eu').set(aluno).expect(401);
  });

  test('banco guarda só o hash do código de sessão', async () => {
    const aluno = await novoAluno();
    const codigo = aluno.Authorization.split(' ')[1];
    const { rows } = await pool.query('SELECT token_hash FROM sessoes');
    expect(rows[0].token_hash).toHaveLength(64);
    expect(rows[0].token_hash).not.toBe(codigo);
  });
});

describe('permissões', () => {
  test('sem login não se gerencia nada', async () => {
    await request(app).post('/api/produtos').send({ nome: 'X', categoria: 'lanche', preco_centavos: 1 }).expect(401);
    await request(app).get('/api/pedidos').expect(401);
    await request(app).post('/api/pedidos').send({ itens: [] }).expect(401);
  });

  test('aluno não acessa a área da cantina -> 403', async () => {
    const aluno = await novoAluno();
    await request(app).post('/api/produtos').set(aluno).send({ nome: 'Xis', categoria: 'lanche', preco_centavos: 1 }).expect(403);
    await request(app).get('/api/pedidos').set(aluno).expect(403);
    await request(app).patch('/api/pedidos/1/status').set(aluno).send({ status: 'pronto' }).expect(403);
  });

  test('aluno NÃO vê pedido de outro aluno', async () => {
    const cantina = await entrarCantina();
    const p = await criarProduto(cantina);
    const ana = await novoAluno('ana01', 'Ana');
    const bia = await novoAluno('bia01', 'Bia');
    const pedido = (await fazerPedido(ana, [{ produto_id: p.id, quantidade: 1 }]).expect(201)).body;

    await request(app).get(`/api/pedidos/${pedido.id}`).set(bia).expect(404);
    expect((await request(app).get('/api/pedidos/meus').set(bia)).body).toEqual([]);
    await request(app).get(`/api/pedidos/${pedido.id}`).set(ana).expect(200);
    await request(app).get(`/api/pedidos/${pedido.id}`).set(cantina).expect(200);
  });

  test('tentativa de SQL injection no id é rejeitada', async () => {
    await request(app).get('/api/produtos/1;DROP TABLE produtos').expect(400);
    const { rows } = await pool.query("SELECT to_regclass('produtos') AS t");
    expect(rows[0].t).toBe('produtos');
  });
});

describe('cardápio', () => {
  test('cantina cria, edita e remove produto; público vê o cardápio', async () => {
    const cantina = await entrarCantina();
    const p = await criarProduto(cantina, { descricao: 'Pão e hambúrguer' });
    expect((await request(app).get('/api/produtos').expect(200)).body).toHaveLength(1);

    const editado = await request(app).patch(`/api/produtos/${p.id}`).set(cantina).send({ preco_centavos: 1300 }).expect(200);
    expect(editado.body.preco_centavos).toBe(1300);

    await request(app).delete(`/api/produtos/${p.id}`).set(cantina).expect(204);
    await request(app).get(`/api/produtos/${p.id}`).expect(404);
  });

  test('produto indisponível some do cardápio público, mas a cantina continua vendo', async () => {
    const cantina = await entrarCantina();
    const p = await criarProduto(cantina);
    await request(app).patch(`/api/produtos/${p.id}`).set(cantina).send({ disponivel: false }).expect(200);
    expect((await request(app).get('/api/produtos')).body).toHaveLength(0);
    expect((await request(app).get('/api/produtos/todos').set(cantina)).body).toHaveLength(1);
  });

  test('não remove produto que já está em pedido -> 409', async () => {
    const cantina = await entrarCantina();
    const p = await criarProduto(cantina);
    await fazerPedido(await novoAluno(), [{ produto_id: p.id, quantidade: 1 }]).expect(201);
    await request(app).delete(`/api/produtos/${p.id}`).set(cantina).expect(409);
  });
});

describe('pedidos', () => {
  test('fluxo completo: aluno pede -> cantina prepara -> pronto -> entregue', async () => {
    const cantina = await entrarCantina();
    const lanche = await criarProduto(cantina);
    const suco = await criarProduto(cantina, { nome: 'Suco', categoria: 'bebida', preco_centavos: 600 });
    const aluno = await novoAluno();

    const criado = await fazerPedido(aluno, [
      { produto_id: lanche.id, quantidade: 2 }, { produto_id: suco.id, quantidade: 1 },
    ], { observacao: 'sem cebola' }).expect(201);
    expect(criado.body).toMatchObject({ status: 'recebido', total_centavos: 3000, cliente_nome: 'Ana Lima', observacao: 'sem cebola' });

    for (const status of ['preparando', 'pronto', 'entregue']) {
      const r = await request(app).patch(`/api/pedidos/${criado.body.id}/status`).set(cantina).send({ status }).expect(200);
      expect(r.body.status).toBe(status);
    }
    const meus = await request(app).get('/api/pedidos/meus').set(aluno).expect(200);
    expect(meus.body[0].status).toBe('entregue');
  });

  test('cantina não faz pedido em nome de aluno -> 403', async () => {
    const cantina = await entrarCantina();
    const p = await criarProduto(cantina);
    await fazerPedido(cantina, [{ produto_id: p.id, quantidade: 1 }]).expect(403);
  });

  test('o total é calculado no servidor (ignora preço e nome enviados)', async () => {
    const p = await criarProduto(await entrarCantina());
    const res = await fazerPedido(await novoAluno(), [{ produto_id: p.id, quantidade: 1, preco_unitario_centavos: 1 }],
      { total_centavos: 1, cliente_nome: 'Outro' }).expect(201);
    expect(res.body.total_centavos).toBe(1200);
    expect(res.body.cliente_nome).toBe('Ana Lima');
  });

  test('preço do pedido fica congelado mesmo se o cardápio mudar', async () => {
    const cantina = await entrarCantina();
    const p = await criarProduto(cantina);
    const aluno = await novoAluno();
    const { body } = await fazerPedido(aluno, [{ produto_id: p.id, quantidade: 1 }]);
    await request(app).patch(`/api/produtos/${p.id}`).set(cantina).send({ preco_centavos: 9999 });
    const res = await request(app).get(`/api/pedidos/${body.id}`).set(aluno);
    expect(res.body.total_centavos).toBe(1200);
    expect(res.body.itens[0].preco_unitario_centavos).toBe(1200);
  });

  test('produto indisponível ou inexistente -> 422 e nada é gravado', async () => {
    const p = await criarProduto(await entrarCantina(), { disponivel: false });
    const aluno = await novoAluno();
    await fazerPedido(aluno, [{ produto_id: p.id, quantidade: 1 }]).expect(422);
    await fazerPedido(aluno, [{ produto_id: 999, quantidade: 1 }]).expect(422);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM pedidos');
    expect(rows[0].n).toBe(0); // transação desfeita: nenhum pedido "pela metade"
  });

  test('aluno cancela enquanto "recebido"; depois que a cantina começa, não', async () => {
    const cantina = await entrarCantina();
    const p = await criarProduto(cantina);
    const aluno = await novoAluno();
    const um = (await fazerPedido(aluno, [{ produto_id: p.id, quantidade: 1 }])).body;
    const dois = (await fazerPedido(aluno, [{ produto_id: p.id, quantidade: 1 }])).body;

    expect((await request(app).post(`/api/pedidos/${um.id}/cancelar`).set(aluno).expect(200)).body.status).toBe('cancelado');
    await request(app).patch(`/api/pedidos/${dois.id}/status`).set(cantina).send({ status: 'preparando' }).expect(200);
    await request(app).post(`/api/pedidos/${dois.id}/cancelar`).set(aluno).expect(409);
    // outro aluno não cancela pedido alheio
    await request(app).post(`/api/pedidos/${dois.id}/cancelar`).set(await novoAluno('bia01', 'Bia')).expect(404);
  });

  test('bloqueia transição de status inválida', async () => {
    const cantina = await entrarCantina();
    const p = await criarProduto(cantina);
    const { body } = await fazerPedido(await novoAluno(), [{ produto_id: p.id, quantidade: 1 }]);
    await request(app).patch(`/api/pedidos/${body.id}/status`).set(cantina).send({ status: 'entregue' }).expect(409);
    await request(app).patch(`/api/pedidos/${body.id}/status`).set(cantina).send({ status: 'voando' }).expect(400);
  });

  test('cantina lista e filtra a fila por status', async () => {
    const cantina = await entrarCantina();
    const p = await criarProduto(cantina);
    for (const [m, nome] of [['ana01', 'Ana'], ['bia01', 'Bia'], ['caio01', 'Caio']]) {
      await fazerPedido(await novoAluno(m, nome), [{ produto_id: p.id, quantidade: 1 }]).expect(201);
    }
    await request(app).patch('/api/pedidos/2/status').set(cantina).send({ status: 'preparando' });

    expect((await request(app).get('/api/pedidos').set(cantina).expect(200)).body).toHaveLength(3);
    const preparando = await request(app).get('/api/pedidos?status=preparando').set(cantina).expect(200);
    expect(preparando.body.map((x) => x.cliente_nome)).toEqual(['Bia']);
    await request(app).get('/api/pedidos?status=xyz').set(cantina).expect(400);
  });
});

describe('limite de requisições (rate limit)', () => {
  test('bloqueia tentativas repetidas de login com 429 (força bruta)', async () => {
    const appLimitado = criarApp({ pool, config: carregarConfig({ ...configBase, RATE_LIMIT_LOGIN_MAX: '3' }) });
    for (let i = 0; i < 3; i++) {
      await request(appLimitado).post('/api/auth/login').send({ matricula: 'cantina', senha: 'chute123' }).expect(401);
    }
    await request(appLimitado).post('/api/auth/login').send({ matricula: 'cantina', senha: SENHA_CANTINA }).expect(429);
  });

  test('bloqueia excesso de pedidos com 429', async () => {
    const appLimitado = criarApp({ pool, config: carregarConfig({ ...configBase, RATE_LIMIT_PEDIDOS_MAX: '2' }) });
    const p = await criarProduto(await entrarCantina());
    const aluno = await novoAluno();
    const pedir = () => request(appLimitado).post('/api/pedidos').set(aluno).send({ itens: [{ produto_id: p.id, quantidade: 1 }] });
    await pedir().expect(201);
    await pedir().expect(201);
    await pedir().expect(429);
  });
});
