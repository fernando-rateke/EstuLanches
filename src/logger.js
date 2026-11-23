'use strict';

/**
 * Logger mínimo em JSON (uma linha por evento) escrito em stdout/stderr.
 * Em containers o log vai para a saída padrão e o Docker o coleta
 * (docker compose logs), sem arquivos de log dentro do container.
 */
function escrever(nivel, msg, extra = {}) {
  if (process.env.LOG_SILENT === 'true') return;
  const linha = JSON.stringify({ ts: new Date().toISOString(), nivel, msg, ...extra });
  if (nivel === 'error') process.stderr.write(linha + '\n');
  else process.stdout.write(linha + '\n');
}

module.exports = {
  info: (msg, extra) => escrever('info', msg, extra),
  warn: (msg, extra) => escrever('warn', msg, extra),
  error: (msg, extra) => escrever('error', msg, extra),
};
