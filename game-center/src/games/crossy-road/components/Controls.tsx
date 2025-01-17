import * as React from 'react';
import { useEffect } from 'react';

interface ControlsProps {
  onMove: (dx: number, dy: number) => void;
}

export default function Controls({ onMove }: ControlsProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch(e.key) {
        case 'ArrowUp':
          onMove(0, -1);
          break;
        case 'ArrowDown':
          onMove(0, 1);
          break;
        case 'ArrowLeft':
          onMove(-1, 0);
          break;
        case 'ArrowRight':
          onMove(1, 0);
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMove]);

  return (
    <div className="grid grid-cols-3 gap-2 p-4">
      <div />
      <button
        className="bg-white rounded-lg shadow-lg p-4 active:scale-95 transition-transform"
        onClick={() => onMove(0, -1)}
      >
        ↑
      </button>
      <div />
      <button
        className="bg-white rounded-lg shadow-lg p-4 active:scale-95 transition-transform"
        onClick={() => onMove(-1, 0)}
      >
        ←
      </button>
      <button
        className="bg-white rounded-lg shadow-lg p-4 active:scale-95 transition-transform"
        onClick={() => onMove(0, 1)}
      >
        ↓
      </button>
      <button
        className="bg-white rounded-lg shadow-lg p-4 active:scale-95 transition-transform"
        onClick={() => onMove(1, 0)}
      >
        →
      </button>
    </div>
  );
}