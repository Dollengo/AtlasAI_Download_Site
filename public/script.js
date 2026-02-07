// Partículas (Copiado simplificado do Atlas)
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
let particlesArray = [];

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2;
        this.speedX = Math.random() * 1 - 0.5;
        this.speedY = Math.random() * 1 - 0.5;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width || this.x < 0) this.speedX *= -1;
        if (this.y > canvas.height || this.y < 0) this.speedY *= -1;
    }
    draw() {
        ctx.fillStyle = 'rgba(0, 242, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticles() {
    for (let i = 0; i < 50; i++) particlesArray.push(new Particle());
    animateParticles();
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particlesArray.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animateParticles);
}

initParticles();

// Lógica do Site
const loginScreen = document.getElementById('login-screen');
const downloadScreen = document.getElementById('download-screen');
const msgBox = document.getElementById('login-msg');

// 1. Verificar URL para Modo Dev
const urlParams = new URLSearchParams(window.location.search);
const devToken = urlParams.get('dev');

if (devToken) {
    // Se tiver token na URL, tenta carregar painel
    document.getElementById('dev-panel').classList.add('active');
    loadKeys();
}

// 2. Login
async function verifyKey() {
    const key = document.getElementById('access-key').value.trim();
    if (!key) return;

    msgBox.style.color = '#fff';
    msgBox.innerText = 'Verificando...';

    try {
        const res = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
        
        const data = await res.json();

        if (res.ok) {
            loginScreen.classList.remove('active');
            downloadScreen.classList.add('active');
            localStorage.setItem('atlas_key', key);
        } else {
            msgBox.style.color = '#ff2a6d';
            msgBox.innerText = data.error;
        }
    } catch (e) {
        msgBox.innerText = 'Erro de conexão.';
    }
}

// Auto-login se já tiver chave salva
if (localStorage.getItem('atlas_key')) {
    document.getElementById('access-key').value = localStorage.getItem('atlas_key');
    // verifyKey(); // Opcional: auto entrar
}

// 3. Download
function startDownload() {
    // Link direto para o arquivo EXE (exemplo)
    window.location.href = '/assets/AtlasAI Setup.exe';
}

// 4. Funções de Admin
async function loadKeys() {
    try {
        const res = await fetch('/api/admin/keys', {
            headers: { 'admin-token': devToken } // Aquele token do .env
        });
        const keys = await res.json();
        
        const tbody = document.querySelector('#keys-table tbody');
        tbody.innerHTML = '';
        
        keys.forEach(k => {
            const row = `<tr>
                <td><code style="color:var(--primary)">${k.key_code}</code></td>
                <td>${k.name || '-'}</td>
                <td>${k.duration_hours === -1 ? '∞' : k.duration_hours + 'h'}</td>
                <td>${k.used_by_ip || '<span style="opacity:0.5">Não usado</span>'}</td>
                <td>${checkStatus(k)}</td>
            </tr>`;
            tbody.innerHTML += row;
        });
    } catch (e) {
        console.error("Erro admin:", e);
    }
}

function checkStatus(key) {
    if (!key.first_used_at) return '<span style="color:#00ff9d">Novo</span>';
    // Adicione lógica de expirado aqui se quiser visualmente
    return '<span style="color:orange">Ativo</span>';
}

async function generateKey() {
    const name = document.getElementById('new-key-name').value;
    const duration = document.getElementById('new-key-duration').value;

    const res = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'admin-token': devToken 
        },
        body: JSON.stringify({ name, duration })
    });
    
    if (res.ok) loadKeys();
}

function toggleDevPanel() {
    document.getElementById('dev-panel').classList.toggle('active');
}