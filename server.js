const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { generateRoomId, generateRandomWord, createWordHint } = require('./utils');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    pingTimeout: 30000,
    pingInterval: 5000,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

const ROUND_TIME = 60;
const ROUNDS_PER_GAME = 3;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    socket.on('create-room', (data) => {
        try {
            const roomId = generateRoomId();
            const username = data.username;

            if (!username || username.trim() === '') {
                socket.emit('error', { message: 'Username is required' });
                return;
            }

            rooms.set(roomId, {
                id: roomId,
                players: [{ 
                    id: socket.id, 
                    username, 
                    score: 0, 
                    isDrawing: false, 
                    isAdmin: true
                }],
                status: 'waiting',
                round: 0,
                totalRounds: ROUNDS_PER_GAME,
                currentWord: null,
                timeLeft: ROUND_TIME,
                timer: null,
                correctGuesses: new Set(),
                adminId: socket.id
            });

            socket.join(roomId);
            socket.username = username;
            socket.roomId = roomId;
            socket.isAdmin = true;

            socket.emit('room-created', { roomId, isAdmin: true });
            console.log(`Room created: ${roomId} by ${username} (admin)`);
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error', { message: 'Failed to create room' });
        }
    });

    socket.on('join-room', (data) => {
        try {
            const roomId = data.roomId;
            const username = data.username;

            if (!username || username.trim() === '') {
                socket.emit('error', { message: 'Username is required' });
                return;
            }

            if (!rooms.has(roomId)) {
                socket.emit('join-error', { message: 'Room not found' });
                return;
            }

            const room = rooms.get(roomId);

            if (room.players.length >= MAX_PLAYERS) {
                socket.emit('join-error', { message: `Room is full (max ${MAX_PLAYERS} players)` });
                return;
            }

            if (room.players.some(player => player.username === username)) {
                socket.emit('join-error', { message: 'Username already taken' });
                return;
            }

            socket.join(roomId);
            socket.username = username;
            socket.roomId = roomId;
            socket.isAdmin = false;

            room.players.push({ 
                id: socket.id, 
                username, 
                score: 0, 
                isDrawing: false,
                isAdmin: false
            });

            socket.emit('room-joined', { 
                roomId, 
                players: room.players,
                isAdmin: false,
                adminId: room.adminId
            });

            io.to(roomId).emit('update-players', { players: room.players });
            io.to(roomId).emit('chat-message', {
                system: true,
                message: `${username} joined the room`
            });

            console.log(`${username} joined room: ${roomId}`);

            if (room.players.length >= MIN_PLAYERS && room.status === 'waiting') {
                io.to(room.adminId).emit('can-start-game', true);
            }
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    socket.on('start-game', () => {
        const roomId = socket.roomId;
        if (!roomId || !rooms.has(roomId)) return;

        const room = rooms.get(roomId);
        
        if (socket.id !== room.adminId) {
            socket.emit('error', { message: 'Only the admin can start the game' });
            return;
        }

        if (room.players.length >= MIN_PLAYERS && room.status === 'waiting') {
            startGame(roomId);
        } else {
            socket.emit('error', { message: `Need at least ${MIN_PLAYERS} players to start` });
        }
    });

    socket.on('kick-player', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !rooms.has(roomId)) return;

        const room = rooms.get(roomId);
        
        if (socket.id !== room.adminId) {
            socket.emit('error', { message: 'Only the admin can kick players' });
            return;
        }

        const playerToKick = room.players.find(p => p.id === data.playerId);
        if (playerToKick) {
            io.to(playerToKick.id).emit('kicked', { 
                message: 'You have been kicked from the room' 
            });
            
            io.sockets.sockets.get(playerToKick.id)?.leave(roomId);
            
            const playerIndex = room.players.findIndex(p => p.id === playerToKick.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                
                io.to(roomId).emit('chat-message', {
                    system: true,
                    message: `${playerToKick.username} was kicked by admin from the room`
                });
                
                io.to(roomId).emit('update-players', { players: room.players });
            }
        }
    });

    socket.on('draw', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !rooms.has(roomId)) return;
    
        const room = rooms.get(roomId);
        if (room.status !== 'playing') return;
    
        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isDrawing) return;
    
        if (data && typeof data === 'object' && Array.isArray(data.points)) {
            console.log(`Draw event ID:${data.drawId} forwarded from ${socket.id} at ${Date.now()}`);
            socket.to(roomId).emit('draw', {
                drawId: data.drawId,
                points: data.points,
                color: data.color || '#000000',
                size: data.size || 5
            });
        } else {
            console.error('Invalid draw data:', data);
        }
    });

    socket.on('clear-canvas', () => {
        const roomId = socket.roomId;
        if (!roomId || !rooms.has(roomId)) return;

        const room = rooms.get(roomId);
        if (room.status !== 'playing') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isDrawing) return;

        socket.to(roomId).emit('clear-canvas');
    });

    socket.on('chat-message', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !rooms.has(roomId)) return;

        const room = rooms.get(roomId);
        const message = data.message.trim();

        if (room.status === 'playing' &&
            !room.correctGuesses.has(socket.id) &&
            room.currentWord &&
            message.toLowerCase() === room.currentWord.toLowerCase()) {

            room.correctGuesses.add(socket.id);

            const scoreGained = Math.ceil(room.timeLeft / 2);
            const player = room.players.find(p => p.id === socket.id);
            if (player) player.score += scoreGained;

            io.to(roomId).emit('chat-message', {
                username: socket.username,
                message: `Guessed the word "${room.currentWord}" correctly!`,
                correct: true
            });

            io.to(roomId).emit('update-players', { players: room.players });

            const nonDrawingPlayers = room.players.filter(p => !p.isDrawing);
            if (room.correctGuesses.size >= nonDrawingPlayers.length) {
                clearTimeout(room.timer);
                endRound(roomId);
            }

            return;
        }

        io.to(roomId).emit('chat-message', {
            username: socket.username,
            message
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        const roomId = socket.roomId;
        if (!roomId || !rooms.has(roomId)) return;

        const room = rooms.get(roomId);
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = room.players[playerIndex];
            room.players.splice(playerIndex, 1);

            io.to(roomId).emit('chat-message', {
                system: true,
                message: `${player.username} left the room`
            });

            if (player.isAdmin && room.players.length > 0) {
                const newAdmin = room.players[0];
                newAdmin.isAdmin = true;
                room.adminId = newAdmin.id;
                
                io.to(newAdmin.id).emit('admin-assigned', { isAdmin: true });
                io.to(roomId).emit('chat-message', {
                    system: true,
                    message: `${newAdmin.username} is now the room admin`
                });
            }

            io.to(roomId).emit('update-players', { players: room.players });

            if (player.isDrawing && room.status === 'playing') {
                clearTimeout(room.timer);
                endRound(roomId);
            }

            if (room.players.length < MIN_PLAYERS && room.status === 'playing') {
                clearTimeout(room.timer);
                room.status = 'waiting';
                io.to(roomId).emit('chat-message', {
                    system: true,
                    message: 'Game paused: Not enough players'
                });
            }
        }

        if (room.players.length === 0) {
            clearTimeout(room.timer);
            rooms.delete(roomId);
            console.log(`Room closed: ${roomId}`);
        }
    });
});

function startGame(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.status = 'playing';
    room.round = 0;

    room.players.forEach(player => {
        player.score = 0;
        player.isDrawing = false;
    });

    io.to(roomId).emit('update-players', { players: room.players });
    io.to(roomId).emit('chat-message', {
        system: true,
        message: 'Game starting...'
    });

    startRound(roomId);
}

function startRound(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.round++;
    room.correctGuesses = new Set();
    room.timeLeft = ROUND_TIME;

    const prevDrawerIndex = room.players.findIndex(p => p.isDrawing);
    let drawerIndex;

    if (prevDrawerIndex === -1) {
        drawerIndex = Math.floor(Math.random() * room.players.length);
    } else {
        drawerIndex = (prevDrawerIndex + 1) % room.players.length;
    }

    if (prevDrawerIndex !== -1) room.players[prevDrawerIndex].isDrawing = false;

    room.players[drawerIndex].isDrawing = true;
    const drawer = room.players[drawerIndex];

    room.currentWord = generateRandomWord();
    const hint = createWordHint(room.currentWord);

    io.to(roomId).emit('round-start', { round: room.round, totalRounds: room.totalRounds });
    io.to(roomId).emit('update-players', { players: room.players });

    io.to(drawer.id).emit('game-state', {
        drawer,
        word: room.currentWord,
        hint,
        timeLeft: room.timeLeft
    });

    room.players.forEach(player => {
        if (player.id !== drawer.id) {
            io.to(player.id).emit('game-state', {
                drawer,
                word: null,
                hint,
                timeLeft: room.timeLeft
            });
        }
    });

    startTimer(roomId);

    console.log(`Round ${room.round} started in room ${roomId}. Word: ${room.currentWord}`);
}

function startTimer(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const tick = () => {
        room.timeLeft--;
        const drawer = room.players.find(p => p.isDrawing);

        room.players.forEach(player => {
            io.to(player.id).emit('game-state', {
                drawer,
                word: player.isDrawing ? room.currentWord : null,
                hint: createWordHint(room.currentWord),
                timeLeft: room.timeLeft
            });
        });

        if (room.timeLeft <= 0) {
            clearTimeout(room.timer);
            endRound(roomId);
        } else {
            room.timer = setTimeout(tick, 1000);
        }
    };

    room.timer = setTimeout(tick, 1000);
}

function endRound(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const drawer = room.players.find(p => p.isDrawing);
    let drawerScore = 0;

    if (drawer) {
        const correctGuessesCount = room.correctGuesses.size;
        const nonDrawingPlayers = room.players.filter(p => !p.isDrawing).length;
        drawerScore = Math.floor((correctGuessesCount / nonDrawingPlayers) * 10);
        drawer.score += drawerScore;
    }

    const scores = room.players.map(player => ({
        username: player.username,
        score: player.score,
        gained: player.isDrawing ? drawerScore : (room.correctGuesses.has(player.id) ? Math.ceil(room.timeLeft / 2) : 0)
    }));

    io.to(roomId).emit('round-end', {
        word: room.currentWord,
        scores
    });

    io.to(roomId).emit('update-players', { players: room.players });

    if (room.round >= room.totalRounds) {
        endGame(roomId);
    } else {
        setTimeout(() => startRound(roomId), 5000);
    }
}

function endGame(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.status = 'finished';

    let winner = room.players[0];
    room.players.forEach(player => {
        if (player.score > winner.score) winner = player;
    });

    io.to(roomId).emit('game-end', {
        winner,
        scores: room.players.map(p => ({ username: p.username, score: p.score }))
    });

    room.status = 'waiting';
    io.to(room.adminId).emit('can-start-game', true);
    io.to(roomId).emit('chat-message', {
        system: true,
        message: 'The game has ended. The admin can start a new game.'
    });
}

app.get('/join/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    if (rooms.has(roomId)) {
        res.sendFile(path.join(__dirname, 'public', 'game.html'));
    } else {
        res.redirect('/?error=room-not-found');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', () => {
    console.log('Shutting down server...');
    rooms.forEach(room => clearTimeout(room.timer));
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});