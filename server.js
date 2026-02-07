require('dotenv').config();
const express = require('express');
const { createClient } = require('@libsql/client');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Conexão Turso
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

// Middleware para verificar IP real (útil no Render)
const getIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
};

// Rota: Verificar Chave
app.post('/api/verify', async (req, res) => {
    const { key } = req.body;
    const userIP = getIP(req);

    try {
        const result = await db.execute({
            sql: "SELECT * FROM keys WHERE key_code = ?",
            args: [key]
        });

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Chave inválida." });
        }

        const keyData = result.rows[0];

        // 1. Verificar se a chave já foi usada por outro IP
        if (keyData.used_by_ip && keyData.used_by_ip !== userIP) {
            return res.status(403).json({ error: "Esta chave está vinculada a outro IP." });
        }

        // 2. Vincular IP e marcar tempo de início se for o primeiro uso
        if (!keyData.used_by_ip) {
            await db.execute({
                sql: "UPDATE keys SET used_by_ip = ?, first_used_at = CURRENT_TIMESTAMP WHERE id = ?",
                args: [userIP, keyData.id]
            });
            // Atualiza objeto local
            keyData.first_used_at = new Date().toISOString();
        }

        // 3. Verificar expiração
        if (keyData.duration_hours !== -1 && keyData.first_used_at) {
            const firstUsed = new Date(keyData.first_used_at + "Z"); // Garante UTC
            const now = new Date();
            const hoursPassed = (now - firstUsed) / 36e5;
            
            if (hoursPassed > keyData.duration_hours) {
                return res.status(403).json({ error: "Chave expirada." });
            }
        }

        res.json({ success: true, message: "Acesso concedido." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro interno." });
    }
});

// --- ÁREA DO DESENVOLVEDOR ---

// Middleware de Auth Admin
const adminAuth = (req, res, next) => {
    const token = req.headers['admin-token'];
    if (token !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: "Acesso negado." });
    }
    next();
};

// Listar Chaves
app.get('/api/admin/keys', adminAuth, async (req, res) => {
    const result = await db.execute("SELECT * FROM keys ORDER BY created_at DESC");
    res.json(result.rows);
});

// Criar Chave
app.post('/api/admin/keys', adminAuth, async (req, res) => {
    const { name, duration } = req.body;
    // Gera chave aleatória tipo "ATLAS-XXXX-XXXX"
    const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
    const keyCode = `ATLAS-${randomPart}`;

    try {
        await db.execute({
            sql: "INSERT INTO keys (key_code, name, duration_hours) VALUES (?, ?, ?)",
            args: [keyCode, name, duration]
        });
        res.json({ success: true, key: keyCode });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));