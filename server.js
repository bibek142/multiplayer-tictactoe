const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');


const prisma = new PrismaClient();
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const activeGames = new Map();
const winCombos = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];


// Add origin validation middleware
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.NEXT_PUBLIC_SITE_URL]
  : [
    process.env.NEXT_PUBLIC_SITE_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];


let httpServer;

app.prepare().then(() => {
  httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });



  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["websocket"],
    path: "/socket.io/", // Explicit WebSocket path
    pingInterval: 25000,
    pingTimeout: 60000
  });

  // Add connection validation
  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (allowedOrigins.includes(origin)) {
      return next();
    }
    return next(new Error('Origin not allowed'));
  });



  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id} via ${socket.conn.transport.name}`);

    socket.conn.on("upgrade", () => {
      console.log(`⬆️ Transport upgraded to: ${socket.conn.transport.name}`);
    });

    socket.conn.on("close", (reason) => {
      console.log(`❌ Connection closed: ${reason}`);
    });

    // Keep existing socket.io handlers from pages/api/socket.js
    // [PASTE ALL YOUR SOCKET.IO LOGIC HERE]

    // Game creation handler
    socket.on('create-game', async (callback) => {
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

        callback({ success: true, gameId: newGame.id });
      } catch (error) {
        callback({ error: 'Game creation failed' });
      }
    });



    socket.on('join-game', async (gameId, playerName, callback) => {
      try {
        // 1. Check if game exists in database
        const dbGame = await prisma.game.findUnique({
          where: { id: gameId },
          select: { status: true }
        });

        if (!dbGame) {
          return callback({ error: 'Invalid game ID' });
        }

        // 2. Check/initialize active game state
        let game = activeGames.get(gameId);
        if (!game) {
          game = {
            players: new Map(),
            board: Array(9).fill(''),
            currentPlayer: 'X',
            chat: [],
            status: dbGame.status
          };
          activeGames.set(gameId, game);
        }

        // 3. Validate game capacity
        if (game.players.size >= 2) {
          return callback({ error: 'Game full' });
        }

        // 4. Assign player symbol
        const symbol = game.players.size === 0 ? 'X' : 'O';
        game.players.set(socket.id, {
          name: playerName,
          symbol,
          joinedAt: new Date()
        });

        // 5. Join game room
        socket.join(gameId);

        // 6. Send initial game state to joining player
        callback({
          symbol,
          board: game.board,
          players: Array.from(game.players.values()),
          chat: game.chat.slice(-50),
          currentPlayer: game.currentPlayer,
          status: game.status
        });

        // 7. Broadcast updated player list
        io.to(gameId).emit('game-update', {
          type: 'players',
          players: Array.from(game.players.values()),
          currentPlayer: game.currentPlayer
        });

        // 8. Start game if 2 players
        if (game.players.size === 2 && game.status === 'waiting') {
          game.status = 'playing';
          io.to(gameId).emit('game-update', {
            type: 'status',
            status: 'playing'
          });

          // Update database status
          await prisma.game.update({
            where: { id: gameId },
            data: { status: 'playing' }
          });
        }

      } catch (error) {
        console.error('Join error:', error);
        callback({
          error: 'Join failed',
          message: error.message
        });
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



    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

  });



  function checkWinner(board) {
    return winCombos.some(combo =>
      combo.every(i => board[i] !== '' && board[i] === board[combo[0]])
    );
  }

  const port = process.env.PORT || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`> Server ready on port ${port}`);
  });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');

  if (httpServer) {
    httpServer.close(() => {
      console.log('HTTP server closed');
      prisma.$disconnect()
        .then(() => process.exit(0))
        .catch((err) => {
          console.error('Prisma disconnect error:', err);
          process.exit(1);
        });
    });
  } else {
    process.exit(0);
  }
});