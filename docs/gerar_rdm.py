import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer

out = sys.argv[1]
doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=14*mm, rightMargin=14*mm, topMargin=11*mm, bottomMargin=10*mm,
                        title="RDM - EstuLanches v1.0.0", author="Fernando Rateke Neto")
LAR = colors.HexColor("#d9480f"); CINZA = colors.HexColor("#f3ede7"); BORDA = colors.HexColor("#d8cabd")
t = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=14, textColor=LAR, leading=17)
sub = ParagraphStyle("s", fontName="Helvetica", fontSize=8.5, textColor=colors.HexColor("#6b5f57"), leading=11)
h = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.white, leading=12)
n = ParagraphStyle("n", fontName="Helvetica", fontSize=8, leading=10)
b = ParagraphStyle("b", parent=n, fontName="Helvetica-Bold")
W = A4[0] - 28*mm

def secao(titulo):
    tb = Table([[Paragraph(titulo, h)]], colWidths=[W])
    tb.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), LAR), ("TOPPADDING",(0,0),(-1,-1),2.5), ("BOTTOMPADDING",(0,0),(-1,-1),2.5)]))
    return tb

def grade(linhas, larguras, cabecalho=False):
    dados = [[Paragraph(str(c), b if (cabecalho and i == 0) else n) for c in l] for i, l in enumerate(linhas)]
    tb = Table(dados, colWidths=[W*x for x in larguras])
    st = [("GRID",(0,0),(-1,-1),0.4,BORDA), ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
          ("TOPPADDING",(0,0),(-1,-1),1.6), ("BOTTOMPADDING",(0,0),(-1,-1),1.6)]
    if cabecalho: st.append(("BACKGROUND",(0,0),(-1,0),CINZA))
    tb.setStyle(TableStyle(st)); return tb

def kv(pares):
    linhas = []
    for i in range(0, len(pares), 2):
        a = pares[i]; c = pares[i+1] if i+1 < len(pares) else ("", "")
        linhas.append([Paragraph(a[0], b), Paragraph(a[1], n), Paragraph(c[0], b), Paragraph(c[1], n)])
    tb = Table(linhas, colWidths=[W*.17, W*.33, W*.17, W*.33])
    tb.setStyle(TableStyle([("GRID",(0,0),(-1,-1),0.4,BORDA), ("BACKGROUND",(0,0),(0,-1),CINZA), ("BACKGROUND",(2,0),(2,-1),CINZA),
                            ("VALIGN",(0,0),(-1,-1),"MIDDLE"), ("TOPPADDING",(0,0),(-1,-1),1.6), ("BOTTOMPADDING",(0,0),(-1,-1),1.6)]))
    return tb

E = [Spacer(1,1)]
E.append(Paragraph("Ficha Simplificada de Registro de Mudança (RDM)", t))
E.append(Paragraph("Sistema EstuLanches · Gestão de cardápio e pedidos da cantina escolar · RDM nº 2026-001", sub))
E.append(Spacer(1, 4))

E += [secao("1. Identificação da mudança"), kv([
    ("Responsável", "Fernando Rateke Neto (Técnico de Implantação)"), ("Tipo", "Normal · Implantação inicial em produção"),
    ("Versão implantada", "<b>1.0.0</b> · imagem <font face='Courier'>estulanches:1.0.0</font>"), ("Ambiente", "Produção · Docker Engine 29.10 + Compose v5.7"),
    ("Data", "25/11/2026"), ("Horário (BRT, UTC−3)", "Início 10:21:52 · Fim 10:22:04 (12 s)"),
    ("Componentes", "app: Node.js 22 (alpine) + Express 5<br/>db: PostgreSQL 16 (alpine)"), ("Risco / Impacto", "Baixo · sistema novo, sem usuários afetados"),
]), Spacer(1, 4)]

E += [secao("2. Parâmetros alterados / configurados"), grade([
    ["Parâmetro", "Valor", "Motivo"],
    ["Porta publicada (APP_PORT)", "8080 (host) → 3000 (container)", "Acesso ao sistema; app roda como usuário sem privilégio"],
    ["Porta do banco 5432", "Não publicada (rede interna <i>backend</i>)", "Banco inacessível de fora dos containers"],
    ["NODE_ENV / TZ", "production / America/Sao_Paulo", "Modo produção e horário local nos logs"],
    ["POSTGRES_DB / POSTGRES_USER", "estulanches / estulanches", "Banco e usuário da aplicação"],
    ["POSTGRES_PASSWORD, CANTINA_SENHA", "Definidos no .env (aleatórios, não registrados aqui)", "Segredos fora do código e do Git"],
    ["CANTINA_LOGIN / SESSAO_HORAS", "cantina / 8 h (um turno escolar)", "Conta da equipe criada na 1ª subida; login expira sozinho"],
    ["Migrações do banco", "001_usuarios_e_sessoes, 002_cardapio, 003_pedidos", "Aplicadas automaticamente e registradas em schema_migrations"],
    ["DB_POOL_MAX", "10 conexões", "Limitar conexões por réplica"],
    ["RATE_LIMIT_MAX / _PEDIDOS / _LOGIN", "300 req/15 min · 20 pedidos/min · 10 logins/15 min por IP", "Proteção contra abuso e força bruta"],
    ["Limites de recursos", "app 0,5 CPU / 256 MB · db 1 CPU / 512 MB", "Evitar que um serviço derrube o host"],
    ["Hardening do container app", "read_only, cap_drop ALL, no-new-privileges, init", "Reduzir superfície de ataque"],
    ["Volume / restart / logs", "db_data persistente · unless-stopped · json-file 10 MB×3", "Persistência, auto-recuperação, rotação de log"],
], [.29, .37, .34], cabecalho=True), Spacer(1, 4)]

E += [secao("3. Resultado dos testes de validação"), grade([
    ["Verificação", "Comando / evidência", "Resultado"],
    ["Testes unitários (Jest)", "regras de pedido, cadastro, senhas, sessões, permissões", "<b>70/70 aprovados</b>"],
    ["Testes de integração (Jest + Supertest + PostgreSQL)", "docker compose --profile test run --rm test", "<b>32/32 aprovados</b>"],
    ["Cobertura de código", "jest --coverage", "92,4% linhas · 88,4% ramos"],
    ["Estado dos serviços", "docker compose ps", "app <b>Up (healthy)</b> 0.0.0.0:8080→3000 · db <b>Up (healthy)</b>"],
    ["Logs de inicialização", "docker compose logs app db", "Sem erros críticos (0 ERROR/FATAL/PANIC)¹"],
    ["Healthcheck", "GET /health", "200 {status: ok, versao: 1.0.0, banco: ok}"],
    ["Fluxo funcional (smoke)", "cardápio → pedido → status pela cantina", "OK · total calculado no servidor (R$ 30,00)"],
    ["Contas e permissões", "sem login · aluno na área da cantina · logout", "401 · 403 · sessão invalidada (401)"],
    ["Segurança do ambiente", "senhas no banco · porta 5432 · FS · usuário", "só hash scrypt · fechada · somente leitura · uid 1000"],
    ["Interface web", "navegador: cadastro, pedido, cancelamento, cantina", "OK · sem erros de JavaScript"],
], [.30, .38, .32], cabecalho=True),
Paragraph("¹ Único aviso do PostgreSQL: <i>LOG: could not create IPv6 socket</i> — informativo (host sem IPv6); o banco escuta normalmente em IPv4.", sub),
Spacer(1, 4)]

E += [secao("4. Plano de retorno (rollback)"), Paragraph(
    "Em caso de falha: <font face='Courier'>docker compose down</font> (o volume <i>db_data</i> é preservado) e subir a imagem anterior com "
    "<font face='Courier'>APP_VERSION=&lt;versão anterior&gt; docker compose up -d</font>. Backup do banco antes de cada mudança: "
    "<font face='Courier'>docker compose exec db pg_dump -U estulanches estulanches &gt; backup.sql</font>. Por ser a primeira versão, o rollback equivale a desligar o serviço.", n),
    Spacer(1, 4)]

st = Table([[Paragraph("<b>5. STATUS FINAL DA IMPLANTAÇÃO:</b>", ParagraphStyle("x", parent=n, fontSize=10)),
             Paragraph("<b>CONCLUÍDA COM SUCESSO</b> — sistema em operação", ParagraphStyle("y", parent=n, fontSize=10, textColor=colors.HexColor("#2b8a3e")))]],
           colWidths=[W*.42, W*.58])
st.setStyle(TableStyle([("BOX",(0,0),(-1,-1),1,colors.HexColor("#2b8a3e")), ("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#ebfbee")),
                        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5)]))
E += [st, Spacer(1, 12)]

ass = Table([[Paragraph("_______________________________________<br/>Fernando Rateke Neto · Técnico de Implantação", n),
              Paragraph("_______________________________________<br/>Aprovação / Professor(a) responsável", n)]], colWidths=[W/2, W/2])
E.append(ass)
doc.build(E)
