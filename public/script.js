// CONFIGURAÇÃO DE PARTÍCULAS (AZUL CIANO)
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
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width || this.x < 0) this.speedX *= -1;
        if (this.y > canvas.height || this.y < 0) this.speedY *= -1;
    }
    draw() {
        // Cor das partículas: Ciano Neon
        ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticles() {
    particlesArray = [];
    for (let i = 0; i < 60; i++) particlesArray.push(new Particle());
    animateParticles();
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particlesArray.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animateParticles);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
});

initParticles();

// --- LÓGICA DO SISTEMA ---

const loginScreen = document.getElementById('login-screen');
const downloadScreen = document.getElementById('download-screen');
const msgBox = document.getElementById('login-msg');

// 1. LÓGICA DE TOKEN DO ADMIN (MELHORADA)
const urlParams = new URLSearchParams(window.location.search);
let devToken = urlParams.get('dev');

// Se tiver token na URL, salva no localStorage. Se não, tenta recuperar do localStorage.
if (devToken) {
    localStorage.setItem('admin_token', devToken);
} else {
    devToken = localStorage.getItem('admin_token');
}

// Se tivermos um token (da URL ou salvo), ativa o painel
if (devToken) {
    console.log("Modo Admin Ativo com token:", devToken);
    const panel = document.getElementById('dev-panel');
    if(panel) {
        panel.classList.add('active');
        // Pequeno delay para garantir que o DOM carregou
        setTimeout(loadKeys, 500); 
    }
}

// Verifica se já tem login salvo e se é válido
async function checkAutoLogin() {
    const savedKey = localStorage.getItem('atlas_key');
    if (savedKey) {
        // Opcional: Validar silenciosamente com o servidor
        // Por enquanto, apenas preenchemos o campo, mas NÃO pulamos a tela automaticamente
        // para dar o "feeling" de acesso restrito, ou pulamos se a chave for válida.
        
        // Se quiser pular direto (comportamento padrão):
        verifyKey(savedKey, true);
    }
}

// Função de Login
async function verifyKey(manualKey = null, isAuto = false) {
    const keyInput = document.getElementById('access-key');
    const key = manualKey || keyInput.value.trim();
    
    if (!key) return;

    if (!isAuto) {
        msgBox.style.color = '#00f0ff';
        msgBox.innerText = 'AUTHENTICATING...';
    }

    try {
        const res = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });

        // Verifica se a resposta é JSON válido
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server Error (Invalid JSON)");
        }
        
        const data = await res.json();

        if (res.ok) {
            // Sucesso!
            localStorage.setItem('atlas_key', key);
            
            // Troca de tela suave
            loginScreen.style.opacity = '0';
            setTimeout(() => {
                loginScreen.classList.remove('active');
                downloadScreen.classList.add('active');
            }, 500);
        } else {
            // Erro
            if (!isAuto) {
                msgBox.style.color = '#ff2a6d';
                msgBox.innerText = data.error || 'ACCESS DENIED';
                // Se o login automático falhou, limpa a chave
                if(isAuto) localStorage.removeItem('atlas_key');
            }
        }
    } catch (e) {
        console.error(e);
        if (!isAuto) {
            msgBox.style.color = '#ff2a6d';
            msgBox.innerText = 'CONNECTION FAILED';
        }
    }
}

// Iniciar Download
function startDownload() {
    window.location.href = '/assets/AtlasAI_Setup.exe';
}

// --- FUNÇÕES ADMIN ---

async function loadKeys() {
    console.log("Carregando chaves...");
    try {
        const res = await fetch('/api/admin/keys', {
            headers: { 'admin-token': devToken } // Envia o token salvo
        });
        
        if (res.status === 403) {
            console.error("Erro 403: Senha de Admin incorreta.");
            // Se a senha estiver errada, limpa do storage para não travar
            localStorage.removeItem('admin_token');
            alert("Sessão Admin expirada ou senha incorreta. Acesse via ?dev=NOVA_SENHA");
            return;
        }

        if (!res.ok) throw new Error("Erro na resposta do servidor");

        const keys = await res.json();
        const tbody = document.querySelector('#keys-table tbody');
        
        if(!tbody) return; 
        tbody.innerHTML = '';
        
        if (keys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma chave encontrada</td></tr>';
            return;
        }

        keys.forEach(k => {
            const row = `<tr>
                <td><span class="key-display">${k.key_code}</span></td>
                <td>${k.name || '-'}</td>
                <td>${k.duration_hours === -1 ? '∞' : k.duration_hours + 'h'}</td>
                <td style="font-size:0.8em">${k.used_by_ip ? k.used_by_ip : '<span style="color:#00f0ff">UNUSED</span>'}</td>
                <td>
                    <button onclick="copyToClipboard('${k.key_code}')" style="background:transparent; border:none; color:#fff; cursor:pointer;"><i class="fas fa-copy"></i></button>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    } catch (e) {
        console.error("Admin Error:", e);
    }
}

async function generateKey() {
    const name = document.getElementById('new-key-name').value;
    const duration = document.getElementById('new-key-duration').value;
    const btn = document.querySelector('.btn-generate');

    if(!name) return alert("Digite um nome para o cliente");

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
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
            await loadKeys(); // Recarrega a lista
            document.getElementById('new-key-name').value = '';
        } else {
            alert("Erro: " + (data.error || JSON.stringify(data)));
        }
    } catch (e) {
        alert("Erro de Conexão");
    } finally {
        btn.innerHTML = '<i class="fas fa-plus"></i> Generate Key';
        btn.disabled = false;
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    // Feedback visual simples
    const el = document.activeElement;
    const originalHtml = el.innerHTML;
    el.innerHTML = '<i class="fas fa-check" style="color:#00f0ff"></i>';
    setTimeout(() => el.innerHTML = originalHtml, 1000);
}

function toggleDevPanel() {
    const panel = document.getElementById('dev-panel');
    panel.classList.toggle('active');
}

// Função utilitária para logout (teste)
function logout() {
    localStorage.removeItem('atlas_key');
    window.location.reload();
}

// Inicia verificação ao carregar
checkAutoLogin();