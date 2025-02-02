import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import styles from '../styles/Home.module.css';

export default function Home() {
  const socketRef = useRef(null);
  const [screen, setScreen] = useState('lobby');
  const [gameId, setGameId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState([]);
  const [board, setBoard] = useState(Array(9).fill(''));
  const [currentPlayer, setCurrentPlayer] = useState('');
  const [chat, setChat] = useState([]);
  const [mySymbol, setMySymbol] = useState('');
  const [gameHistory, setGameHistory] = useState([]);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [notifications, setNotifications] = useState([]);


  const formatISTDate = (dateString) => {
    const options = {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };
    return new Date(dateString).toLocaleString('en-IN', options);
  };

  const showNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  useEffect(() => {
    socketRef.current = io({
      path: '/api/socket',
      transports: ['websocket']
    });

    socketRef.current.on('game-update', (update) => {
      switch (update.type) {
        case 'players':
          setPlayers(update.players);
          if (update.currentPlayer) setCurrentPlayer(update.currentPlayer);
          break;

        case 'move':
          setBoard(update.board);
          setCurrentPlayer(update.currentPlayer);
          break;

        case 'chat':
          setChat(update.chat);
          break;

        case 'status':
          setScreen(update.status === 'playing' ? 'game' : 'lobby');
          break;

        case 'game-over':
          setBoard(update.board);
          showNotification(
            update.winner === 'draw' ? 'Game Drawn!' : `Winner: ${update.winner === mySymbol ? 'You Won!' : 'Opponent Won!'}`,
            update.winner === 'draw' ? 'info' : 'success'
          );
          setScreen('lobby');
          break;

        case 'player-left':
          setPlayers(update.players);
          showNotification('A player has left the game', 'error');
          setScreen('lobby');
          break;
      }
    });

    return () => socketRef.current?.disconnect();
  }, []);


  // Fetch game history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/games');
        const data = await res.json();
        setGameHistory(data.slice(0, 20));
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [screen]);




  const handleCreateGame = async () => {
    setIsCreatingGame(true);
    try {
      const res = await fetch('/api/games', { method: 'POST' });
      const { id } = await res.json();
      setGameId(id);
      showNotification(`Game created! ID: ${id}`, 'success');
    } catch (error) {
      showNotification('Failed to create game', 'error');
    } finally {
      setIsCreatingGame(false);
    }
  };




  const handleJoinGame = async (e) => {
    e.preventDefault();
    if (!playerName || !gameId) return;

    socketRef.current.emit('join-game', gameId, playerName, (response) => {
      if (response.error) {
        showNotification(response.error, 'error');
        return;
      }
      setMySymbol(response.symbol);
      setPlayers(response.players);
      setBoard(response.board);
      setChat(response.chat);
      setCurrentPlayer(response.currentPlayer);
      setScreen('game');
      showNotification('Successfully joined game!', 'success');
    });
  };



  const handleMove = (index) => {
    if (mySymbol === currentPlayer && board[index] === '') {
      socketRef.current.emit('make-move', { gameId, index });
    }
  };



  const handleMessage = (e) => {
    e.preventDefault();
    const message = e.target.message.value;
    if (message) {
      socketRef.current.emit('send-message', { gameId, message });
      e.target.reset();
    }
  };




  return (
    <div className={styles.container}>

      <Head>
        <title>TicTacToe - A Multiplayer Online Game</title>
      </Head>

      {/* Notifications */}
      <div className={styles.notifications}>
        {notifications.map(({ id, message, type }) => (
          <div key={id} className={`${styles.notification} ${styles[type]}`}>
            {message}
          </div>
        ))}
      </div>

      <div className={styles.mainContent}>
        {screen === 'lobby' ? (
          <div className={styles.lobby}>
            <button
              className={styles.createButton}
              onClick={handleCreateGame}
              disabled={isCreatingGame}
            >
              {isCreatingGame ? 'Creating Game...' : 'Create New Game'}
            </button>

            <div className={styles.divider}>
              <span>OR</span>
            </div>

            <form className={styles.joinForm} onSubmit={handleJoinGame}>
              <input
                type="text"
                placeholder="Your Name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Game ID"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                required
              />
              <button className={styles.joinButton} type="submit">
                Join Game
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.gameContainer}>
            <div className={styles.playerInfo}>
              <h3 className={styles.infoTitle}>Players</h3>
              <div className={styles.playersList}>
                {players.map((player, i) => (
                  <div key={i} className={styles.playerItem}>
                    <span className={styles.playerName}>
                      {player.name}
                      <span className={styles.playerSymbol}>({player.symbol})</span>
                    </span>
                    {player.symbol === mySymbol &&
                      <span className={styles.youBadge}>You</span>}
                  </div>
                ))}
              </div>
              <div className={styles.currentTurn}>
                {currentPlayer === mySymbol ? (
                  <span className={styles.yourTurn}>🎮 Your Turn!</span>
                ) : (
                  <span className={styles.waitingTurn}>⏳ Waiting for opponent...</span>
                )}
              </div>
            </div>


            <div className={styles.board}>
              {board.map((cell, index) => (
                <button
                  key={index}
                  className={`${styles.cell} ${cell ? styles[cell] : ''}`}
                  onClick={() => handleMove(index)}
                  disabled={cell !== '' || currentPlayer !== mySymbol}
                >
                  {cell || ''} {/* Explicit empty string for empty cells */}
                </button>
              ))}
            </div>

            <div className={styles.chatSection}>
              <div className={styles.chatMessages}>
                {chat.map((msg, i) => (
                  <div key={i} className={styles.message}>
                    <span className={styles.messageSender}>{msg.player}: </span>
                    <span className={styles.messageText}>{msg.message}</span>
                  </div>
                ))}
              </div>
              <form className={styles.chatForm} onSubmit={handleMessage}>
                <input
                  type="text"
                  name="message"
                  placeholder="Type your message..."
                  className={styles.chatInput}
                  required
                />
                <button type="submit" className={styles.chatButton}>
                  Send
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div className={styles.history}>
        <h3 className={styles.historyTitle}>Last 20 Games</h3>
        <div className={styles.historyList}>
          {gameHistory.length === 0 ? (
            <div className={styles.noGames}>No games played yet</div>
          ) : (
            gameHistory.map((game) => (
              <div key={game.id} className={styles.historyCard}>
                <div className={styles.gameHeader}>
                  <span className={styles.gameDate}>
                    {formatISTDate(game.createdAt)}
                  </span>
                  <span className={`${styles.gameStatus} ${styles[game.status]}`}>
                    {game.status}
                  </span>
                </div>
                <div className={styles.gameDetails}>
                  <div className={styles.players}>
                    {game.players?.map((player, i) => (
                      <span key={i} className={styles.playerTag}>
                        {player} {i === 0 ? '(X)' : '(O)'}
                      </span>
                    ))}
                  </div>
                  {game.winner && (
                    <div className={styles.gameResult}>
                      {game.winner === 'draw' ? (
                        <span className={styles.draw}>Draw</span>
                      ) : (
                        <>
                          Winner: <span className={styles.winner}>{game.winner}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}