import prisma from '../../lib/prisma';

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET':
        // Get last 20 games
        const games = await prisma.game.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20
        });
        return res.status(200).json(games);

      case 'POST':
        // Create new game
        const newGame = await prisma.game.create({
          data: {
            players: [],
            moves: [],
            chat: [],
            status: 'waiting'
          }
        });
        return res.status(201).json(newGame);

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
  } catch (error) {
    console.error('API Error:', error);
    const statusCode = error.code === 'P2002' ? 409 : 500;
    return res.status(statusCode).json({ 
      error: 'Server error',
      message: error.message
    });
  }
}