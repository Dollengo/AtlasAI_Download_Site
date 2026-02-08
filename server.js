/* SALVE COMO: index.js ou server.js */
require('dotenv').config();
const express = require('express');
const { createClient } = require('@libsql/client/web'); 
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Garante que o CSS/JS sejam carregados

// --- CONFIGURAÇÃO DE SEGURANÇA ---
// Se não tiver senha no .env, usa "admin123" como padrão para não dar erro
const ADMIN_PASSWORD = process.env.ADMIN_TOKEN || "admin123";

// Configuração do Banco
const dbUrl = process.env.TURSO_DATABASE_URL;
const dbToken = process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbToken) {
    console.warn("⚠️ AVISO: Banco de dados não configurado no .env");
}

const db = createClient({
    url: dbUrl || "file:local.db", // Fallback para evitar crash
    authToken: dbToken || "",
});

// Inicializa tabela
async function initDB() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_code TEXT UNIQUE NOT NULL,
                name TEXT,
                duration_hours INTEGER DEFAULT 24,
                used_by_ip TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                first_used_at DATETIME
            )
        `);
        console.log("✅ Banco de dados conectado.");
    } catch (error) {
        console.error("❌ Erro no Banco:", error);
    }
}
initDB();

// Middleware de Autenticação Admin
const adminAuth = (req, res, next) => {
    const token = req.headers['admin-token'];
    
    // Debug para você ver no terminal o que está acontecendo
    console.log(`Tentativa de Admin - Token recebido: "${token}" | Token esperado: "${ADMIN_PASSWORD}"`);

    if (!token || token !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: "Acesso negado. Senha incorreta." });
    }
    next();
};

// --- ROTAS ---

// Listar Chaves (Protegido)
app.get('/api/admin/keys', adminAuth, async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM keys ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao buscar chaves" });
    }
});

// Criar Chave (Protegido)
app.post('/api/admin/keys', adminAuth, async (req, res) => {
    const { name, duration } = req.body;
    
    // Gera chave aleatória ATLAS-XXXX-XXXX
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase() + 
                       "-" + 
                       Math.random().toString(36).substring(2, 6).toUpperCase();
    const keyCode = `ATLAS-${randomPart}`;

    try {
        await db.execute({
            sql: "INSERT INTO keys (key_code, name, duration_hours, created_at) VALUES (?, ?, ?, datetime('now'))",
            args: [keyCode, name, parseInt(duration)]
        });
        res.json({ success: true, key: keyCode });
    } catch (error) {
        res.status(500).json({ error: "Erro ao criar chave." });
    }
});

// Verificar Chave (Público)
app.post('/api/verify', async (req, res) => {
    const { key } = req.body;
    // Lógica simplificada de IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    try {
        const result = await db.execute({
            sql: "SELECT * FROM keys WHERE key_code = ?",
            args: [key]
        });

        if (result.rows.length === 0) return res.status(401).json({ error: "Chave inválida." });
        
        const data = result.rows[0];

        // Se já foi usada por outro IP
        if (data.used_by_ip && data.used_by_ip !== ip) {
            return res.status(403).json({ error: "Chave já vinculada a outro dispositivo." });
        }

        // Se é o primeiro uso, registra o IP
        if (!data.used_by_ip) {
            await db.execute({
                sql: "UPDATE keys SET used_by_ip = ?, first_used_at = datetime('now') WHERE id = ?",
                args: [ip, data.id]
            });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Erro interno" });
    }
});

app.listen(3000, () => console.log("🚀 Servidor rodando na porta 3000"));