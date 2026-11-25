'use strict';

const { hashSenha, conferirSenha } = require('../../src/seguranca/senha');
const { gerarCodigo, hashCodigo } = require('../../src/seguranca/sessao');
const { exigirLogin, exigirPerfil, lerCodigo } = require('../../src/middleware/auth');
const { carregarConfig, validarConfig } = require('../../src/config');

// Monta um "res" de mentira para testar middlewares sem subir servidor
function resFalso() {
  const res = { statusCode: 200, corpo: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.corpo = b; return res; };
  return res;
}
const reqFalso = (authorization, extra = {}) => ({ get: () => authorization, ...extra });

describe('senhas (scrypt)', () => {
  test('nunca guarda a senha em texto', async () => {
    const h = await hashSenha('Lanche2026');
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(h).not.toContain('Lanche2026');
  });

  test('confere a senha certa e recusa a errada', async () => {
    const h = await hashSenha('Lanche2026');
    expect(await conferirSenha('Lanche2026', h)).toBe(true);
    expect(await conferirSenha('lanche2026', h)).toBe(false);
  });

  test('mesma senha gera hashes diferentes (sal aleatório)', async () => {
    expect(await hashSenha('Lanche2026')).not.toBe(await hashSenha('Lanche2026'));
  });

  test.each([[''], ['texto-qualquer'], ['scrypt$abc'], [null], ['scrypt$00$00']])(
    'hash guardado inválido (%p) nunca é aceito', async (guardado) => {
      expect(await conferirSenha('qualquer', guardado)).toBe(false);
    },
  );
});

describe('código de sessão', () => {
  test('é aleatório e longo', () => {
    const a = gerarCodigo();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).not.toBe(gerarCodigo());
  });

  test('o banco guarda só o SHA-256 (64 hex), sempre igual para o mesmo código', () => {
    const c = gerarCodigo();
    expect(hashCodigo(c)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCodigo(c)).toBe(hashCodigo(c));
    expect(hashCodigo(c)).not.toContain(c);
  });
});

describe('middleware exigirLogin', () => {
  test.each([
    ['sem cabeçalho', ''],
    ['esquema errado', 'Basic abc'],
    ['só "Bearer"', 'Bearer'],
  ])('%s -> 401 sem consultar o banco', async (_, cabecalho) => {
    const pool = { query: jest.fn() };
    const res = resFalso();
    const next = jest.fn();
    await exigirLogin(pool)(reqFalso(cabecalho), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('sessão inexistente ou vencida -> 401', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const res = resFalso();
    await exigirLogin(pool)(reqFalso('Bearer codigo-qualquer'), res, jest.fn());
    expect(res.statusCode).toBe(401);
    // a consulta usa o HASH do código, nunca o código em si
    expect(pool.query.mock.calls[0][1]).toEqual([hashCodigo('codigo-qualquer')]);
  });

  test('sessão válida -> preenche req.usuario e segue', async () => {
    const usuario = { id: 7, nome: 'Ana', matricula: '2026a01', perfil: 'aluno' };
    const pool = { query: jest.fn().mockResolvedValue({ rows: [usuario] }) };
    const req = reqFalso('Bearer abc123');
    const next = jest.fn();
    await exigirLogin(pool)(req, resFalso(), next);
    expect(next).toHaveBeenCalled();
    expect(req.usuario).toEqual(usuario);
  });

  test('lerCodigo extrai o código do cabeçalho', () => {
    expect(lerCodigo(reqFalso('Bearer xyz'))).toBe('xyz');
    expect(lerCodigo(reqFalso(undefined))).toBeNull();
  });
});

describe('middleware exigirPerfil', () => {
  test('aluno tentando área da cantina -> 403', () => {
    const res = resFalso();
    const next = jest.fn();
    exigirPerfil('cantina')({ usuario: { perfil: 'aluno' } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('perfil certo -> segue', () => {
    const next = jest.fn();
    exigirPerfil('cantina')({ usuario: { perfil: 'cantina' } }, resFalso(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('config', () => {
  test('lê variáveis de ambiente com valores padrão', () => {
    const c = carregarConfig({ PORT: '8081', APP_VERSION: '9.9.9' });
    expect(c.porta).toBe(8081);
    expect(c.versao).toBe('9.9.9');
    expect(c.cantina.login).toBe('cantina');
    expect(c.sessaoHoras).toBe(8);
  });

  test('em produção exige senha forte para a cantina', () => {
    expect(validarConfig(carregarConfig({ NODE_ENV: 'production', CANTINA_SENHA: 'curta' }))).toHaveLength(1);
    expect(validarConfig(carregarConfig({ NODE_ENV: 'production', CANTINA_SENHA: 'SenhaBemLonga2026' }))).toEqual([]);
  });

  test('recusa duração de sessão absurda', () => {
    expect(validarConfig(carregarConfig({ SESSAO_HORAS: '100' }))).toHaveLength(1);
  });
});
