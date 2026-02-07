require('dotenv').config();
const express = require('express');
const { createClient } = require('@libsql/client');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Configuração do Turso
const dbUrl = process.env.TURSO_DATABASE_URL;
const dbToken = process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbToken) {
    console.error("ERRO CRÍTICO: Variáveis TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN não definidas.");
    process.exit(1);
}

// Inicializa o cliente DB
const db = createClient({
    url: dbUrl,
    authToken: dbToken,
});

// Inicializa a tabela se não existir
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
        console.log("Banco de dados verificado/inicializado com sucesso.");
    } catch (error) {
        console.error("Erro ao conectar/inicializar banco:", error);
    }
}
initDB();

const getIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
};

// --- ROTA: Verificar Chave ---
app.post('/api/verify', async (req, res) => {
    const { key } = req.body;
    const userIP = getIP(req);

    console.log(`Login: [${key}] - IP [${userIP}]`);

    try {
        const result = await db.execute({
            sql: "SELECT * FROM keys WHERE key_code = ?",
            args: [key]
        });

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Chave inválida." });
        }

        const keyData = result.rows[0];

        // 1. Verificar IP
        if (keyData.used_by_ip && keyData.used_by_ip !== userIP) {
            return res.status(403).json({ error: "Chave já usada em outro PC." });
        }

        // 2. Vincular IP
        if (!keyData.used_by_ip) {
            await db.execute({
                sql: "UPDATE keys SET used_by_ip = ?, first_used_at = datetime('now') WHERE id = ?",
                args: [userIP, keyData.id]
            });
        }

        // 3. Verificar tempo
        if (keyData.duration_hours !== -1 && keyData.first_used_at) {
            const firstUsed = new Date(keyData.first_used_at + "Z"); // Força UTC se necessário
            const now = new Date();
            // Fallback se a data vier inválida (null ou formato errado)
            if(!isNaN(firstUsed.getTime())) {
                 const hoursPassed = (now - firstUsed) / 36e5;
                 if (hoursPassed > keyData.duration_hours) {
                     return res.status(403).json({ error: "Chave expirada." });
                 }
            }
        }

        res.json({ success: true });

    } catch (error) {
        console.error("ERRO NO VERIFY:", error);
        res.status(500).json({ error: "Erro interno. Tente novamente." });
    }
});

const adminAuth = (req, res, next) => {
    const token = req.headers['admin-token'];
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: "Acesso negado." });
    }
    next();
};

app.get('/api/admin/keys', adminAuth, async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM keys ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (error) {
        console.error("Erro admin list:", error);
        res.status(500).json({ error: "Erro ao buscar chaves" });
    }
});

app.post('/api/admin/keys', adminAuth, async (req, res) => {
    const { name, duration } = req.body;
    
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase() + 
                       "-" + 
                       Math.random().toString(36).substring(2, 6).toUpperCase();
    const keyCode = `ATLAS-${randomPart}`;
    const durationInt = parseInt(duration);

    try {
        await db.execute({
            sql: "INSERT INTO keys (key_code, name, duration_hours, created_at) VALUES (?, ?, ?, datetime('now'))",
            args: [keyCode, name, durationInt]
        });
        res.json({ success: true, key: keyCode });
    } catch (error) {
        console.error("ERRO AO CRIAR:", error);
        res.status(500).json({ error: "Erro ao criar chave no banco." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));