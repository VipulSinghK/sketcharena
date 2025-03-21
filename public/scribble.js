const socket = io({
    reconnectionDelayMax: 10000,
    transports: ['websocket']
});

const welcomeScreen = document.querySelector('.welcome-screen');
const usernameSection = document.querySelector('.username-section');
const gameOptions = document.querySelector('.game-options');
const usernameInput = document.getElementById('username');
const submitUsernameBtn = document.getElementById('submit-username-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomIdInput = document.getElementById('room-id-input');
const gameContainer = document.querySelector('.game-container');
const usernameDisplay = document.getElementById('username-display');
const roomCodeDisplay = document.getElementById('room-code');
const playersList = document.getElementById('players-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const wordDisplay = document.getElementById('word-display');
const timerDisplay = document.getElementById('timer');
const canvas = document.getElementById('drawing-board');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const colorOptions = document.querySelectorAll('.color-option');
const brushSizeInput = document.getElementById('brush-size');
const clearBtn = document.getElementById('clear-btn');
const roundMessage = document.getElementById('round-message');
const wordReveal = document.getElementById('word-reveal');
const scoresUpdate = document.getElementById('scores-update');
const roundTransition = document.querySelector('.round-transition');

const adminControlsContainer = document.createElement('div');
adminControlsContainer.className = 'admin-controls';
const startGameBtn = document.createElement('button');
startGameBtn.id = 'start-game-btn';
startGameBtn.textContent = 'Start Game';
startGameBtn.classList.add('game-button');
startGameBtn.style.display = 'none';
adminControlsContainer.appendChild(startGameBtn);

let currentColor = '#000000';
let currentBrushSize = 5;
let isDrawing = false;
let isDrawer = false;
let isAdmin = false;
let currentRoom = null;
let username = '';
let lastX = 0;
let lastY = 0;
let canvasData = null;

function setupCanvas() {
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer || !canvas) return;
    const width = Math.max(canvasContainer.offsetWidth || 300, 1); // Mobile-friendly fallback
    const height = Math.max(canvasContainer.offsetHeight || 300, 1);
    canvas.width = width;
    canvas.height = height;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!canvas.dataset.initialized) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        canvas.dataset.initialized = 'true';
    }
}

function saveCanvas() {
    if (canvas.width > 0 && canvas.height > 0) {
        canvasData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
}

function restoreCanvas() {
    if (canvasData && canvas.width > 0 && canvas.height > 0) {
        ctx.putImageData(canvasData, 0, 0);
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function init() {
    if (!document.querySelector('.canvas-container') || !canvas) {
        setTimeout(init, 100); // Retry if DOM isn't ready
        return;
    }
    setupEventListeners();
    window.addEventListener('resize', debounce(() => {
        const canvasContainer = document.querySelector('.canvas-container');
        const newWidth = Math.max(canvasContainer.offsetWidth || 300, 1); // Match setupCanvas fallback
        const newHeight = Math.max(canvasContainer.offsetHeight || 300, 1);
        if (newWidth !== canvas.width || newHeight !== canvas.height) {
            saveCanvas();
            canvas.width = newWidth;
            canvas.height = newHeight;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            restoreCanvas();
        }
    }, 200));
    const header = document.querySelector('.header');
    if (header) header.appendChild(adminControlsContainer);
}

function sendDrawPoint(x0, y0, x1, y1) {
    const drawId = Date.now() + Math.random().toString(36).substring(2, 5);
    socket.emit('draw', {
        drawId: drawId,
        points: [{ x0, y0, x1, y1 }],
        color: currentColor,
        size: currentBrushSize
    });
}

function setupEventListeners() {
    if (!submitUsernameBtn) return;
    submitUsernameBtn.addEventListener('click', submitUsername);
    createRoomBtn.addEventListener('click', createRoom);
    joinRoomBtn.addEventListener('click', joinRoom);
    startGameBtn.addEventListener('click', startGame);

    if (!canvas) return;
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', stopDrawing);

    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            currentColor = option.dataset.color;
        });
    });

    brushSizeInput.addEventListener('input', () => {
        currentBrushSize = brushSizeInput.value;
    });

    clearBtn.addEventListener('click', clearCanvas);
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', event => {
        if (event.key === 'Enter') sendMessage();
    });

    if (colorOptions.length > 0) colorOptions[0].classList.add('selected');
}

function submitUsername() {
    const enteredUsername = usernameInput.value.trim();
    if (!enteredUsername) {
        alert('Please enter a username');
        return;
    }
    username = enteredUsername;
    usernameSection.classList.add('hidden');
    gameOptions.classList.remove('hidden');
    usernameDisplay.textContent = username;
}

function createRoom() {
    socket.emit('create-room', { username });
}

function joinRoom() {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert('Please enter a room code');
        return;
    }
    socket.emit('join-room', { username, roomId });
}

function startGame() {
    if (isAdmin) {
        socket.emit('start-game');
        startGameBtn.style.display = 'none';
    }
}

function kickPlayer(playerId) {
    if (isAdmin) socket.emit('kick-player', { playerId });
}

function startDrawing(e) {
    if (!isDrawer) return;
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    sendDrawPoint(lastX / canvas.width, lastY / canvas.height, lastX / canvas.width, lastY / canvas.height);
}

function draw(e) {
    if (!isDrawing || !isDrawer) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentBrushSize;
    ctx.lineTo(x, y);
    ctx.stroke();

    sendDrawPoint(lastX / canvas.width, lastY / canvas.height, x / canvas.width, y / canvas.height);

    lastX = x;
    lastY = y;
}

function handleTouchStart(e) {
    if (!isDrawer) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    isDrawing = true;
    lastX = touch.clientX - rect.left;
    lastY = touch.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    sendDrawPoint(lastX / canvas.width, lastY / canvas.height, lastX / canvas.width, lastY / canvas.height);
}

function handleTouchMove(e) {
    if (!isDrawing || !isDrawer) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentBrushSize;
    ctx.lineTo(x, y);
    ctx.stroke();

    sendDrawPoint(lastX / canvas.width, lastY / canvas.height, x / canvas.width, y / canvas.height);

    lastX = x;
    lastY = y;
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
    }
}

function clearCanvas() {
    if (!isDrawer) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clear-canvas');
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    socket.emit('chat-message', { message });
    chatInput.value = '';
}

function updatePlayersList(players) {
    playersList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        const playerNameSpan = document.createElement('span');
        playerNameSpan.className = 'player-name';
        playerNameSpan.textContent = player.username;

        if (player.isAdmin) {
            const adminIndicator = document.createElement('span');
            adminIndicator.className = 'admin-indicator';
            adminIndicator.textContent = ' 👑';
            playerNameSpan.appendChild(adminIndicator);
        }

        if (player.isDrawing) {
            const drawingIndicator = document.createElement('span');
            drawingIndicator.className = 'player-drawing';
            drawingIndicator.textContent = ' (Drawing)';
            playerNameSpan.appendChild(drawingIndicator);
        }

        const playerScoreSpan = document.createElement('span');
        playerScoreSpan.className = 'player-score';
        playerScoreSpan.textContent = player.score;

        if (isAdmin && player.id !== socket.id) {
            const kickButton = document.createElement('button');
            kickButton.className = 'kick-button';
            kickButton.textContent = '✕';
            kickButton.title = 'Kick player';
            kickButton.onclick = () => kickPlayer(player.id);
            li.appendChild(kickButton);
        }

        li.appendChild(playerNameSpan);
        li.appendChild(playerScoreSpan);
        playersList.appendChild(li);
    });
}

function addChatMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    if (data.system) {
        messageDiv.innerHTML = `<span class="system-message">${data.message}</span>`;
    } else if (data.correct) {
        messageDiv.innerHTML = `<span class="username">${data.username}</span>: <span class="correct-guess">${data.message}</span>`;
    } else {
        messageDiv.innerHTML = `<span class="username">${data.username}</span>: ${data.message}`;
    }
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

socket.on('connect', () => {});

socket.on('room-created', data => {
    currentRoom = data.roomId;
    isAdmin = data.isAdmin;
    roomCodeDisplay.textContent = `Room Code: ${data.roomId}`;
    welcomeScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    setupCanvas(); // Initialize canvas when container is visible
    if (isAdmin) startGameBtn.style.display = 'block';
});

socket.on('room-joined', data => {
    currentRoom = data.roomId;
    isAdmin = data.isAdmin;
    roomCodeDisplay.textContent = `Room Code: ${data.roomId}`;
    welcomeScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    setupCanvas(); // Initialize canvas when container is visible
    updatePlayersList(data.players);
    if (isAdmin && data.players.length >= 2) startGameBtn.style.display = 'block';
});

socket.on('join-error', data => alert(data.message));
socket.on('error', data => alert(data.message));
socket.on('update-players', data => updatePlayersList(data.players));
socket.on('chat-message', data => addChatMessage(data));
socket.on('can-start-game', data => {
    if (isAdmin && data) startGameBtn.style.display = 'block';
});

socket.on('round-start', data => {
    roundMessage.textContent = `Round ${data.round} of ${data.totalRounds}`;
    roundMessage.classList.remove('hidden');
    setTimeout(() => roundMessage.classList.add('hidden'), 3000);
});

socket.on('game-state', data => {
    isDrawer = data.drawer && data.drawer.id === socket.id;
    wordDisplay.textContent = isDrawer ? data.word : data.hint;
    timerDisplay.textContent = `Time Left: ${data.timeLeft}s`;
    canvas.classList.toggle('disabled', !isDrawer);
});

socket.on('draw', data => {
    if (!isDrawer) {
        data.points.forEach(point => {
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.size;
            ctx.beginPath();
            ctx.moveTo(point.x0 * canvas.width, point.y0 * canvas.height);
            ctx.lineTo(point.x1 * canvas.width, point.y1 * canvas.height);
            ctx.stroke();
        });
    }
});

socket.on('clear-canvas', () => {
    if (!isDrawer) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});

socket.on('round-end', data => {
    wordReveal.textContent = `The word was: ${data.word}`;
    wordReveal.classList.remove('hidden');
    scoresUpdate.innerHTML = data.scores.map(score => 
        `<div>${score.username}: ${score.score} (+${score.gained})</div>`
    ).join('');
    scoresUpdate.classList.remove('hidden');
    setTimeout(() => {
        wordReveal.classList.add('hidden');
        scoresUpdate.classList.add('hidden');
    }, 5000);
});

socket.on('game-end', data => {
    roundTransition.innerHTML = `
        <h2>Game Over!</h2>
        <p>Winner: ${data.winner.username} with ${data.winner.score} points</p>
        <ul>${data.scores.map(score => `<li>${score.username}: ${score.score}</li>`).join('')}</ul>
    `;
    roundTransition.classList.remove('hidden');
    setTimeout(() => roundTransition.classList.add('hidden'), 10000);
});

socket.on('room-reset', () => {
    wordDisplay.textContent = '';
    timerDisplay.textContent = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    roundMessage.classList.add('hidden');
    wordReveal.classList.add('hidden');
    scoresUpdate.classList.add('hidden');
    roundTransition.classList.add('hidden');
    startGameBtn.style.display = isAdmin ? 'block' : 'none';
});

socket.on('kicked', data => {
    alert(data.message);
    window.location.reload();
});

socket.on('admin-assigned', data => {
    isAdmin = data.isAdmin;
    if (isAdmin) startGameBtn.style.display = 'block';
});

document.addEventListener('DOMContentLoaded', init);