'use strict';

const express = require('express');
const request = require('supertest');
const { exigirAdmin } = require('../../src/middleware/auth');
const { carregarConfig, validarConfig } = require('../../src/config');

describe('exigirAdmin', () => {
  const app = express();
  app.get('/privado', exigirAdmin('token-secreto-de-teste'), (req, res) => res.json({ ok: true }));

  test('permite com o token correto', async () => {
    await request(app).get('/privado').set('Authorization', 'Bearer token-secreto-de-teste').expect(200);
  });

  test.each([
    ['sem cabeçalho', undefined],
    ['token errado', 'Bearer outro-token'],
    ['esquema errado', 'Basic token-secreto-de-teste'],
    ['só o esquema', 'Bearer'],
  ])('bloqueia %s com 401', async (_, cabecalho) => {
    const req = request(app).get('/privado');
    if (cabecalho) req.set('Authorization', cabecalho);
    await req.expect(401);
  });

  test('bloqueia tudo se o token não foi configurado', async () => {
    const semToken = express();
    semToken.get('/x', exigirAdmin(''), (req, res) => res.end());
    await request(semToken).get('/x').set('Authorization', 'Bearer ').expect(401);
  });
});

describe('config', () => {
  test('lê variáveis de ambiente com valores padrão', () => {
    const c = carregarConfig({ PORT: '8081', APP_VERSION: '9.9.9' });
    expect(c.porta).toBe(8081);
    expect(c.versao).toBe('9.9.9');
    expect(c.rateLimit.maxPedidos).toBe(20);
  });

  test('em produção exige ADMIN_TOKEN forte', () => {
    expect(validarConfig(carregarConfig({ NODE_ENV: 'production', ADMIN_TOKEN: 'curto' }))).toHaveLength(1);
    expect(validarConfig(carregarConfig({ NODE_ENV: 'production', ADMIN_TOKEN: 'a'.repeat(32) }))).toEqual([]);
  });
});
