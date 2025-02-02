import Head from 'next/head';
import "@/styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta property="og:title" content="TicTacToe - A Multiplayer Online Game" />
        <meta property="og:description" content="Multiplayer Tic Tac Toe with a various chat features and game history system" />
      </Head>
      <Component {...pageProps} />;
    </>
  )
}
