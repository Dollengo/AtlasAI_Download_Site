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
}

const db = createClient({
    url: dbUrl,
    authToken: dbToken,
});

// Middleware para pegar IP
const getIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
};

// --- ROTA: Verificar Chave ---
app.post('/api/verify', async (req, res) => {
    const { key } = req.body;
    const userIP = getIP(req);

    console.log(`Tentativa de login: Chave [${key}] - IP [${userIP}]`);

    try {
        const result = await db.execute({
            sql: "SELECT * FROM keys WHERE key_code = ?",
            args: [key]
        });

        if (result.rows.length === 0) {
            console.log("Chave não encontrada no banco.");
            return res.status(401).json({ error: "Chave inválida ou inexistente." });
        }

        const keyData = result.rows[0];

        // 1. Verificar IP (se já foi usada)
        if (keyData.used_by_ip && keyData.used_by_ip !== userIP) {
            console.log(`IP Bloqueado. Original: ${keyData.used_by_ip}, Tentativa: ${userIP}`);
            return res.status(403).json({ error: "Chave vinculada a outro dispositivo." });
        }

        // 2. Vincular IP se for nova
        if (!keyData.used_by_ip) {
            await db.execute({
                sql: "UPDATE keys SET used_by_ip = ?, first_used_at = datetime('now') WHERE id = ?",
                args: [userIP, keyData.id]
            });
        }

        // 3. Verificar tempo (expiração)
        // Se duration_hours for diferente de -1, checa o tempo
        if (keyData.duration_hours !== -1 && keyData.first_used_at) {
            // Turso retorna datas como string UTC ou numérico dependendo da configuração.
            // Vamos assumir string ISO gerada pelo datetime('now')
            const firstUsed = new Date(keyData.first_used_at + "Z"); // Força UTC
            const now = new Date();
            const hoursPassed = (now - firstUsed) / 36e5;

            if (hoursPassed > keyData.duration_hours) {
                console.log("Chave expirada.");
                return res.status(403).json({ error: "Esta chave expirou." });
            }
        }

        res.json({ success: true });

    } catch (error) {
        console.error("ERRO NO VERIFY:", error);
        res.status(500).json({ error: "Erro interno no servidor. Verifique os logs." });
    }
});

// --- ROTA: Admin Auth Check ---
const adminAuth = (req, res, next) => {
    const token = req.headers['admin-token'];
    if (token !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: "Acesso negado." });
    }
    next();
};

// --- ROTA: Listar Chaves ---
app.get('/api/admin/keys', adminAuth, async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM keys ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (error) {
        console.error("Erro ao listar:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- ROTA: Criar Chave ---
app.post('/api/admin/keys', adminAuth, async (req, res) => {
    const { name, duration } = req.body;
    
    // Gera chave aleatória
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase() + 
                       "-" + 
                       Math.random().toString(36).substring(2, 6).toUpperCase();
    const keyCode = `ATLAS-${randomPart}`;

    // Garante que duration seja número
    const durationInt = parseInt(duration);

    console.log(`Criando chave: ${keyCode} para ${name} (${durationInt}h)`);

    try {
        await db.execute({
            sql: "INSERT INTO keys (key_code, name, duration_hours, created_at) VALUES (?, ?, ?, datetime('now'))",
            args: [keyCode, name, durationInt]
        });
        res.json({ success: true, key: keyCode });
    } catch (error) {
        console.error("ERRO AO CRIAR CHAVE:", error);
        res.status(500).json({ error: "Erro ao salvar no banco. Verifique logs." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));