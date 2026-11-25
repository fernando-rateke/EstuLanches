-- 001: contas de acesso (alunos e equipe da cantina) e sessões de login

CREATE TABLE usuarios (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  -- matrícula escolar do aluno (ou um login como "cantina" para a equipe)
  matricula   VARCHAR(20)  NOT NULL UNIQUE,
  -- nunca a senha em texto: "scrypt$<sal>$<hash>"
  senha_hash  VARCHAR(200) NOT NULL,
  perfil      VARCHAR(10)  NOT NULL DEFAULT 'aluno' CHECK (perfil IN ('aluno', 'cantina')),
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Cada login gera uma sessão. O navegador recebe um código aleatório e o banco
-- guarda só o HASH desse código. Sair (logout) apaga a linha -> acesso cortado na hora.
CREATE TABLE sessoes (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  CHAR(64)    NOT NULL UNIQUE,
  expira_em   TIMESTAMPTZ NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessoes_expira ON sessoes (expira_em);
