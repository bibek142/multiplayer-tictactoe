import prisma from '../../lib/prisma';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const newGame = await prisma.game.create({
      data: {
        players: [],
        moves: [],
        chat: [],
        status: 'waiting'
      }
    });
    res.status(200).json(newGame);
  } else {
    const games = await prisma.game.findMany();
    res.status(200).json(games);
  }
}