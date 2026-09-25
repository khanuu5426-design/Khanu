const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const levelCompleteScreen = document.getElementById('level-complete-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const nextLevelBtn = document.getElementById('next-level-btn');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const timerEl = document.getElementById('timer');
const livesEl = document.getElementById('lives');
const powerupsEl = document.getElementById('powerups');
const finalScoreEl = document.getElementById('final-score');
const levelScoreEl = document.getElementById('level-score');

let width, height;
let balloons = [];
let particles = [];
let powerUps = [];
let score = 0;
let level = 1;
let timeLeft = 60;
let lives = 3;
let gameRunning = false;
let animationId = null;
let doublePointsActive = false;
let doublePointsTimer = 0;
let spawnTimer = 0;
let lastTime = 0;

const BALLOON_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8B500', '#FF69B4'
];

const SPECIAL_BALLOON_TYPES = {
    BOMB: { color: '#2C3E50', symbol: '💣', chance: 0.05 },
    CLOCK: { color: '#E74C3C', symbol: '⏱️', chance: 0.04 },
    TARGET: { color: '#F39C12', symbol: '🎯', chance: 0.03 },
    HEART: { color: '#E91E63', symbol: '❤️', chance: 0.02 }
};

function resizeCanvas() {
    const container = document.getElementById('game-container');
    width = container.clientWidth;
    height = container.clientHeight - 60;
    canvas.width = width;
    canvas.height = height;
}

class Balloon {
    constructor(x, y, radius, color, speed, isSpecial = false, specialType = null) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.speed = speed;
        this.isSpecial = isSpecial;
        this.specialType = specialType;
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 0.02 + Math.random() * 0.03;
        this.popped = false;
        this.popAnimation = 0;
    }

    update() {
        if (this.popped) {
            this.popAnimation += 0.15;
            return this.popAnimation >= 1;
        }
        
        this.y -= this.speed;
        this.wobble += this.wobbleSpeed;
        this.x += Math.sin(this.wobble) * 1.5;
        
        return this.y + this.radius < 0;
    }

    draw() {
        if (this.popped) {
            const progress = this.popAnimation;
            const r = this.radius * (1 + progress);
            const alpha = 1 - progress;
            
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.globalAlpha = 1;
            return;
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        
        const gradient = ctx.createRadialGradient(
            -this.radius * 0.3, -this.radius * 0.3, 0,
            0, 0, this.radius
        );
        gradient.addColorStop(0, this.lightenColor(this.color, 40));
        gradient.addColorStop(0.5, this.color);
        gradient.addColorStop(1, this.darkenColor(this.color, 30));

        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius, this.radius * 1.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.2, this.radius * 0.15, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, this.radius * 1.2);
        ctx.lineTo(0, this.radius * 1.6);
        ctx.strokeStyle = this.darkenColor(this.color, 40);
        ctx.lineWidth = 2;
        ctx.stroke();

        if (this.isSpecial && this.specialType) {
            ctx.font = `${this.radius}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.specialType.symbol, 0, this.radius * 0.1);
        }

        ctx.restore();
    }

    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 + (R < 255 ? R : 255) * 0x10000 + (G < 255 ? G : 255) * 0x100 + (B < 255 ? B : 255)).toString(16).slice(1);
    }

    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return '#' + (0x1000000 + (R > 0 ? R : 0) * 0x10000 + (G > 0 ? G : 0) * 0x100 + (B > 0 ? B : 0)).toString(16).slice(1);
    }

    containsPoint(px, py) {
        const dx = px - this.x;
        const dy = py - this.y;
        return dx * dx + dy * dy <= this.radius * this.radius * 1.44;
    }

    pop() {
        this.popped = true;
        this.popAnimation = 0;
        createPopParticles(this.x, this.y, this.color, this.radius);
    }
}

class Particle {
    constructor(x, y, color, velocityX, velocityY, size, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = velocityX;
        this.vy = velocityY;
        this.size = size;
        this.life = life;
        this.maxLife = life;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1;
        this.vx *= 0.98;
        this.life--;
        this.size *= 0.98;
        return this.life > 0;
    }

    draw() {
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = 20;
        this.collected = false;
        this.bobOffset = Math.random() * Math.PI * 2;
        this.rotation = 0;
    }

    update() {
        this.y += 1;
        this.bobOffset += 0.05;
        this.x += Math.sin(this.bobOffset) * 0.5;
        this.rotation += 0.02;
        return this.y - this.radius < height;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, this.type.color);
        gradient.addColorStop(1, this.darkenColor(this.type.color, 30));

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = `${this.radius * 1.2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.type.symbol, 0, 2);

        ctx.restore();
    }

    containsPoint(px, py) {
        const dx = px - this.x;
        const dy = py - this.y;
        return dx * dx + dy * dy <= this.radius * this.radius;
    }

    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return '#' + (0x1000000 + (R > 0 ? R : 0) * 0x10000 + (G > 0 ? G : 0) * 0x100 + (B > 0 ? B : 0)).toString(16).slice(1);
    }
}

function createPopParticles(x, y, color, radius) {
    const count = 12 + Math.floor(radius / 5);
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
        const speed = 2 + Math.random() * 5;
        particles.push(new Particle(
            x, y, color,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            3 + Math.random() * 5,
            30 + Math.random() * 20
        ));
    }
}

function spawnBalloon() {
    const radius = 25 + Math.random() * 25 + level * 2;
    const x = radius + Math.random() * (width - radius * 2);
    const y = height + radius;
    const baseSpeed = 1.5 + level * 0.3 + Math.random() * 1.5;
    const color = BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];

    let isSpecial = false;
    let specialType = null;
    const rand = Math.random();
    let cumulative = 0;

    for (const [key, type] of Object.entries(SPECIAL_BALLOON_TYPES)) {
        cumulative += type.chance;
        if (rand < cumulative) {
            isSpecial = true;
            specialType = type;
            break;
        }
    }

    if (isSpecial) {
        const specialColor = specialType.color;
        balloons.push(new Balloon(x, y, radius, specialColor, baseSpeed * 0.8, true, specialType));
    } else {
        balloons.push(new Balloon(x, y, radius, color, baseSpeed));
    }
}

function activatePowerUp(type) {
    switch (type) {
        case SPECIAL_BALLOON_TYPES.BOMB:
            balloons.forEach(b => {
                if (!b.popped) {
                    b.pop();
                    const points = doublePointsActive ? 20 : 10;
                    score += points;
                }
            });
            showPowerUpMessage('BOMB! All balloons popped!');
            break;
        case SPECIAL_BALLOON_TYPES.CLOCK:
            timeLeft += 10;
            if (timeLeft > 60 + level * 5) timeLeft = 60 + level * 5;
            showPowerUpMessage('+10 Seconds!');
            break;
        case SPECIAL_BALLOON_TYPES.TARGET:
            doublePointsActive = true;
            doublePointsTimer = 10;
            showPowerUpMessage('DOUBLE POINTS x2 for 10s!');
            break;
        case SPECIAL_BALLOON_TYPES.HEART:
            lives = Math.min(5, lives + 1);
            updateUI();
            showPowerUpMessage('Extra Life!');
            break;
    }
}

function showPowerUpMessage(msg) {
    const msgEl = document.createElement('div');
    msgEl.textContent = msg;
    msgEl.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 28px;
        font-weight: bold;
        text-shadow: 2px 2px 4px black;
        pointer-events: none;
        z-index: 20;
        animation: fadeUp 1.5s forwards;
    `;
    document.getElementById('game-container').appendChild(msgEl);
    setTimeout(() => msgEl.remove(), 1500);
}

function updateUI() {
    scoreEl.textContent = `Score: ${score}`;
    levelEl.textContent = `Level: ${level}`;
    timerEl.textContent = `Time: ${Math.ceil(timeLeft)}`;
    livesEl.textContent = `Lives: ${'❤️'.repeat(lives)}`;
    
    const active = [];
    if (doublePointsActive) active.push('🎯 x2');
    powerupsEl.textContent = `Power-ups: ${active.join(' ')}`;
}

function gameLoop(timestamp) {
    if (!gameRunning) return;

    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    ctx.clearRect(0, 0, width, height);

    drawBackground();

    timeLeft -= deltaTime;
    if (timeLeft <= 0) {
        endGame();
        return;
    }

    if (doublePointsActive) {
        doublePointsTimer -= deltaTime;
        if (doublePointsTimer <= 0) {
            doublePointsActive = false;
        }
    }

    const spawnRate = Math.max(0.5, 1.5 - level * 0.1);
    spawnTimer += deltaTime;
    if (spawnTimer >= spawnRate) {
        const count = 1 + Math.floor(level / 3);
        for (let i = 0; i < count; i++) {
            setTimeout(() => spawnBalloon(), i * 200);
        }
        spawnTimer = 0;
    }

    balloons = balloons.filter(balloon => {
        const escaped = balloon.update();
        balloon.draw();
        if (escaped && !balloon.popped) {
            lives--;
            updateUI();
            if (lives <= 0) {
                endGame();
            }
            return false;
        }
        return !balloon.popped || balloon.popAnimation < 1;
    });

    particles = particles.filter(p => {
        const alive = p.update();
        p.draw();
        return alive;
    });

    powerUps = powerUps.filter(p => {
        const alive = p.update();
        p.draw();
        return alive && !p.collected;
    });

    updateUI();
    animationId = requestAnimationFrame(gameLoop);
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(0.5, '#98D8E8');
    gradient.addColorStop(1, '#B0E0E6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i < 20; i++) {
        const x = (i * 47 + timestamp * 0.01) % (width + 100) - 50;
        const y = (i * 31 + timestamp * 0.005) % (height + 100) - 50;
        ctx.beginPath();
        ctx.arc(x, y, 2 + Math.sin(timestamp * 0.001 + i) * 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function handleClick(e) {
    if (!gameRunning) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (let i = balloons.length - 1; i >= 0; i--) {
        const balloon = balloons[i];
        if (!balloon.popped && balloon.containsPoint(x, y)) {
            balloon.pop();
            let points = Math.max(10, Math.floor(50 - balloon.radius));
            if (balloon.isSpecial) {
                points *= 3;
                activatePowerUp(balloon.specialType);
            }
            if (doublePointsActive) points *= 2;
            score += points;
            updateUI();
            
            if (checkLevelComplete()) {
                levelComplete();
            }
            return;
        }
    }

    for (let i = powerUps.length - 1; i >= 0; i--) {
        const powerUp = powerUps[i];
        if (powerUp.containsPoint(x, y)) {
            powerUp.collected = true;
            activatePowerUp(powerUp.type);
            createPopParticles(powerUp.x, powerUp.y, powerUp.type.color, 20);
            return;
        }
    }
}

function checkLevelComplete() {
    return balloons.length === 0 && timeLeft > 0;
}

function levelComplete() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    
    const bonus = Math.floor(timeLeft * 10) + lives * 100;
    score += bonus;
    
    levelScoreEl.textContent = `Score: ${score} (Bonus: +${bonus})`;
    levelCompleteScreen.classList.remove('hidden');
}

function nextLevel() {
    level++;
    timeLeft = 60 + level * 5;
    balloons = [];
    particles = [];
    powerUps = [];
    spawnTimer = 0;
    doublePointsActive = false;
    doublePointsTimer = 0;
    
    levelCompleteScreen.classList.add('hidden');
    startGame();
}

function startGame() {
    score = 0;
    level = 1;
    timeLeft = 60;
    lives = 3;
    balloons = [];
    particles = [];
    powerUps = [];
    spawnTimer = 0;
    doublePointsActive = false;
    doublePointsTimer = 0;
    gameRunning = true;
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    levelCompleteScreen.classList.add('hidden');
    
    updateUI();
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    finalScoreEl.textContent = `Final Score: ${score}`;
    gameOverScreen.classList.remove('hidden');
}

function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length > 0) {
            handleClick({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
        }
    }, { passive: false });
    
    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);
    nextLevelBtn.addEventListener('click', nextLevel);
}

init();