import React, { useEffect, useRef } from 'react';
import { Gamepad2 } from 'lucide-react';
import { useGame } from './hooks/useGame';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { startGame, isGameRunning } = useGame(canvasRef);

  useEffect(() => {
    startGame();
  }, [startGame]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <canvas
        ref={canvasRef}
        width={800}
        height={600} 
        className="bg-black rounded-lg shadow-lg cursor-pointer"
      />
      <div className="mt-4 text-yellow-500 text-center font-mono">
        <p className="text-lg">Left/Right Arrow Keys: Move • Space: Flap Wings</p>
      </div>
    </div>
  );
}

export default App;