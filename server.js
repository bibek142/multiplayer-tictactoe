const express = require('express');
const next = require('next');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const activeGames = new Map();
const winCombos = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6] // Diagonals
];

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);

  const io = new Server(httpServer, {
    path: '/api/socket',
    cors: { origin: '*' }
  });

  // Game creation endpoint
  expressApp.post('/api/games', async (req, res) => {
    try {
      const newGame = await prisma.game.create({
        data: { status: 'waiting' }
      });

      activeGames.set(newGame.id, {
        players: new Map(),
        board: Array(9).fill(''),
        currentPlayer: 'X',
        chat: [],
        status: 'waiting'
      });

      res.status(201).json({ id: newGame.id });
    } catch (error) {
      res.status(500).json({ error: 'Game creation failed' });
    }
  });


  // Update the games endpoint
  expressApp.get('/api/games', async (req, res) => {
    try {
      const games = await prisma.game.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20 // Limit to 20 games
      });
      res.json(games);
    } catch (error) {
      res.status(500).json({ error: 'Failed to load history' });
    }
  });

  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    socket.on('join-game', async (gameId, playerName, callback) => {
      try {
        const game = activeGames.get(gameId);
        if (!game) return callback({ error: 'Invalid game ID' });
        if (game.players.size >= 2) return callback({ error: 'Game full' });

        const symbol = game.players.size === 0 ? 'X' : 'O';
        game.players.set(socket.id, { name: playerName, symbol });

        socket.join(gameId);

        // Send full game state to joining player
        callback({
          symbol,
          board: game.board,
          players: Array.from(game.players.values()),
          chat: game.chat,
          currentPlayer: game.currentPlayer
        });

        // Broadcast to all players in room
        io.to(gameId).emit('game-update', {
          type: 'players',
          players: Array.from(game.players.values()),
          currentPlayer: game.currentPlayer
        });

        if (game.players.size === 2) {
          game.status = 'playing';
          io.to(gameId).emit('game-update', {
            type: 'status',
            status: 'playing'
          });
        }

      } catch (error) {
        callback({ error: 'Join failed' });
      }
    });

    socket.on('make-move', async ({ gameId, index }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'playing') return;
    
      const player = game.players.get(socket.id);
      if (!player || player.symbol !== game.currentPlayer) return;
    
      // Check for empty string instead of null
      if (game.board[index] === '') {
        game.board[index] = player.symbol;
        game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
    
        const winner = checkWinner(game.board);
        const isDraw = !winner && game.board.every(cell => cell !== '');
    
        if (winner || isDraw) {
          game.status = 'finished';
          const result = winner ? player.symbol : 'draw';
    
          // Update database
          await prisma.game.update({
            where: { id: gameId },
            data: {
              status: 'finished',
              winner: result === 'draw' ? 'draw' : result,
              players: Array.from(game.players.values()).map(p => p.name),
              moves: game.board
            }
          });
    
          io.to(gameId).emit('game-update', {
            type: 'game-over',
            winner: result,
            board: game.board
          });
        } else {
          io.to(gameId).emit('game-update', {
            type: 'move',
            board: game.board,
            currentPlayer: game.currentPlayer
          });
        }
      }
    });

    // Replace previous chat message handling with
    socket.on('send-message', ({ gameId, message }) => {
      const game = activeGames.get(gameId);
      const player = game?.players.get(socket.id);

      if (player && message.trim()) {
        game.chat.push({
          player: player.name,
          message: message.trim(),
          timestamp: new Date()
        });

        io.to(gameId).emit('game-update', {
          type: 'chat',
          chat: game.chat.slice(-50) // Keep last 50 messages
        });
      }
    });

    socket.on('disconnect', () => {
      activeGames.forEach((game, gameId) => {
        if (game.players.delete(socket.id)) {
          io.to(gameId).emit('game-update', {
            type: 'players',
            players: Array.from(game.players.values())
          });
          if (game.players.size === 0) activeGames.delete(gameId);
        }
      });
    });
  });

  const checkWinner = (board) => {
    return winCombos.some(combo => 
      combo.every(i => board[i] !== '' && board[i] === board[combo[0]])
    );
  };

  expressApp.all('*', (req, res) => handle(req, res));
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => console.log(`> Ready on http://localhost:${PORT}`));
});