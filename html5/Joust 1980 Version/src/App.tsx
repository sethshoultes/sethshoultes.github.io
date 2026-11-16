import React, { useEffect, useRef } from 'react';
import { Gamepad2 } from 'lucide-react';
import { useGame } from './hooks/useGame';

// sethshoultes.github.io#271: a phone has no arrow keys or Space, so these buttons send the same key events the game
// already listens for, pressed while a finger is down. Shown on touch screens only (index.css).
const TOUCH_KEYS = [
  { code: 'ArrowLeft', label: '◀', name: 'Move left' },
  { code: 'Space', label: 'Flap', name: 'Flap wings' },
  { code: 'ArrowRight', label: '▶', name: 'Move right' },
];

function sendKey(type: 'keydown' | 'keyup', code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code }));
}

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
        className="bg-black rounded-lg shadow-lg cursor-pointer w-full max-w-[800px] h-auto"
      />
      <div className="touch-controls mt-4 w-full max-w-[800px] gap-3">
        {TOUCH_KEYS.map((k) => (
          <button
            key={k.code}
            type="button"
            aria-label={k.name}
            className="flex-1 py-5 rounded-lg bg-yellow-500 text-black font-mono text-2xl font-bold select-none"
            onPointerDown={(e) => { e.preventDefault(); sendKey('keydown', k.code); }}
            onPointerUp={() => sendKey('keyup', k.code)}
            onPointerCancel={() => sendKey('keyup', k.code)}
            onPointerLeave={() => sendKey('keyup', k.code)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="mt-4 text-yellow-500 text-center font-mono">
        <p className="keys-hint text-lg">Left/Right Arrow Keys: Move • Space: Flap Wings</p>
      </div>
    </div>
  );
}

export default App;
