'use strict';

const { hashCodigo } = require('../seguranca/sessao');

/** Lê o código de sessão do cabeçalho "Authorization: Bearer <código>". */
function lerCodigo(req) {
  const [tipo, codigo] = (req.get('authorization') || '').split(' ');
  return tipo === 'Bearer' && codigo ? codigo : null;
}

/**
 * Exige um usuário logado. Procura a sessão no banco (pelo hash do código)
 * e coloca os dados do usuário em req.usuario para as próximas etapas.
 */
function exigirLogin(pool) {
  return async (req, res, next) => {
    const codigo = lerCodigo(req);
    if (!codigo) return res.status(401).json({ erro: 'faça login para continuar' });

    const tokenHash = hashCodigo(codigo);
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.matricula, u.perfil
         FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token_hash = $1 AND s.expira_em > NOW()`,
      [tokenHash],
    );
    if (!rows[0]) return res.status(401).json({ erro: 'sessão inválida ou expirada, entre novamente' });

    req.usuario = rows[0];
    req.sessaoHash = tokenHash;
    return next();
  };
}

/** Exige um perfil específico (usar depois de exigirLogin). Ex.: exigirPerfil('cantina') */
function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'você não tem permissão para isso' });
    }
    return next();
  };
}

module.exports = { exigirLogin, exigirPerfil, lerCodigo };
