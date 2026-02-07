// ... (código de partículas igual ao anterior) ...
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
        // MUDANÇA: Cor Ciano (R:0, G:240, B:255)
        ctx.fillStyle = 'rgba(0, 240, 255, 0.4)'; 
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

// --- LÓGICA DO SITE ---

const loginScreen = document.getElementById('login-screen');
const downloadScreen = document.getElementById('download-screen');
const msgBox = document.getElementById('login-msg');

// 1. Verificar Modo Dev (URL: ?dev=SENHA)
const urlParams = new URLSearchParams(window.location.search);
const devToken = urlParams.get('dev');

if (devToken) {
    document.getElementById('dev-panel').classList.add('active');
    loadKeys();
}

// 2. Verificar Chave (Login)
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
        
        // Verifica se é JSON antes de fazer parse
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Erro de servidor (Resposta não é JSON).");
        }

        const data = await res.json();

        if (res.ok) {
            loginScreen.classList.remove('active');
            downloadScreen.classList.add('active');
            localStorage.setItem('atlas_key', key);
        } else {
            msgBox.style.color = '#ff2a6d';
            msgBox.innerText = data.error || 'Erro desconhecido';
        }
    } catch (e) {
        console.error(e);
        msgBox.style.color = '#ff2a6d';
        msgBox.innerText = 'Erro de conexão ou servidor offline.';
    }
}

// Auto-login se já tiver chave no navegador
if (localStorage.getItem('atlas_key')) {
    document.getElementById('access-key').value = localStorage.getItem('atlas_key');
}

// 3. Iniciar Download
function startDownload() {
    // Certifique-se de que o arquivo está em public/assets/AtlasAI Setup.exe
    window.location.href = '/assets/AtlasAI_Setup.exe';
}

// 4. Funções de Admin
async function loadKeys() {
    try {
        const res = await fetch('/api/admin/keys', {
            headers: { 'admin-token': devToken }
        });
        
        if (!res.ok) {
            // Se der erro 500, não tenta ler JSON para não travar o console
            console.error("Erro na API:", res.status);
            return; 
        }

        const keys = await res.json();
        const tbody = document.querySelector('#keys-table tbody');
        if(!tbody) return; // Segurança
        
        tbody.innerHTML = '';
        
        keys.forEach(k => {
            const row = `<tr>
                <td><span class="key-display">${k.key_code}</span></td>
                <td>${k.name || '-'}</td>
                <td>${k.duration_hours === -1 ? 'Ilimitado' : k.duration_hours + 'h'}</td>
                <td>${k.used_by_ip ? k.used_by_ip : '<span style="color:#00ff9d">Livre</span>'}</td>
                <td>
                    <button onclick="copyToClipboard('${k.key_code}')" class="btn-copy"><i class="fas fa-copy"></i></button>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    } catch (e) {
        console.error("Erro admin:", e);
    }
}

async function generateKey() {
    const name = document.getElementById('new-key-name').value;
    const duration = document.getElementById('new-key-duration').value;
    const btn = document.querySelector('.btn-generate');

    if(!name) return alert("Digite um nome para identificar a chave");

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/admin/keys', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'admin-token': devToken 
            },
            body: JSON.stringify({ name, duration })
        });
        
        const data = await res.json();

        if (res.ok) {
            await loadKeys();
            document.getElementById('new-key-name').value = '';
            alert(`Chave criada: ${data.key}`);
        } else {
            alert("Erro ao criar chave: " + JSON.stringify(data));
        }
    } catch (e) {
        alert("Erro de conexão ao criar chave.");
    } finally {
        btn.innerHTML = '<i class="fas fa-plus"></i> Gerar Chave';
        btn.disabled = false;
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert("Chave copiada: " + text);
    });
}

function toggleDevPanel() {
    document.getElementById('dev-panel').classList.toggle('active');
}