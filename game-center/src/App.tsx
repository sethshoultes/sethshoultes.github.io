import * as React from 'react';
import { useState } from 'react';
import { GameCenter } from './admin/GameCenter';
import { CrossyRoad } from './games/crossy-road/Game';
import { FlappyBird } from './games/flappy-bird/Game';

function App() {
  const [currentGame, setCurrentGame] = useState<string | null>(null);
  
  // Check if we're on the admin path
  const isAdmin = window.location.pathname.startsWith('/admin');
  
  if (isAdmin) {
    return <GameCenter />;
  }
  
  // Game selection screen
  if (!currentGame) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Game Center</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
          <button
            onClick={() => setCurrentGame('crossy-road')}
            className="p-6 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Crossy Road</h2>
            <p className="text-gray-600">Help your character cross the busy road!</p>
          </button>
          <button
            onClick={() => setCurrentGame('flappy-bird')}
            className="p-6 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Flappy Bird</h2>
            <p className="text-gray-600">Navigate through pipes and set high scores!</p>
          </button>
        </div>
      </div>
    );
  }
  
  // Render the selected game
  return currentGame === 'crossy-road' ? <CrossyRoad /> : <FlappyBird />;
}

export default App;