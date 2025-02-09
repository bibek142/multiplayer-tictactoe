import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

export default function handler(req, res) {
  const { socket_id, channel_name } = req.body;
  const auth = pusher.authenticate(socket_id, channel_name);
  res.send(auth);
}