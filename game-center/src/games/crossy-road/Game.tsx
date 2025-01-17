import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import Character from './components/Character';
import Car from './components/Car';
import Obstacle from './components/Obstacle';
import Controls from './components/Controls';

const DEFAULT_SETTINGS = {
  characterSize: 30,
  characterColor: '#fde047',
  carSize: 40,
  carColor: '#ef4444',
  baseCarSpeed: 2,
  maxCarSpeed: 10,
  carSpawnRate: 0.02,
  levelSpeedIncrease: 0.05,
  levelSpawnIncrease: 0.1,
  grassColor: '#4ade80',
  roadColor: '#374151',
  finishLineColor: '#fbbf24'
};

export function CrossyRoad() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const animationFrameRef = useRef<number>();
  const lastSpawnTimeRef = useRef<number>(0);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data: settingsData } = await supabase
        .from('game_settings')
        .select(`
          key,
          value,
          games!inner(slug)
        `)
        .eq('games.slug', 'crossy-road');

      if (settingsData) {
        const newSettings = { ...DEFAULT_SETTINGS };
        settingsData.forEach(setting => {
          const value = typeof setting.value === 'string' 
            ? JSON.parse(setting.value) 
            : setting.value;
          newSettings[setting.key] = value.value;
        });
        setSettings(newSettings);
        initGame(newSettings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      initGame(DEFAULT_SETTINGS);
    }
  }

  const initGame = useCallback((settings: typeof DEFAULT_SETTINGS) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight * 0.7;

    const newCharacter = new Character(
      canvas.width / 2 - settings.characterSize / 2,
      canvas.height - settings.characterSize - 10,
      settings
    );

    setCharacter(newCharacter);
    setCars([]);
    setScore(0);
    setLevel(1);
    setGameOver(false);
    generateObstacles(canvas.width, canvas.height);
  }, []);

  const generateObstacles = useCallback((width: number, height: number) => {
    const newObstacles: Obstacle[] = [];
    const laneHeight = 60;
    const numLanes = Math.floor((height - 100) / laneHeight);
    
    // Add 2-3 obstacles per lane
    for (let lane = 0; lane < numLanes; lane++) {
      const y = 50 + lane * laneHeight;
      const numObstacles = 2 + Math.floor(Math.random() * 2);
      
      for (let i = 0; i < numObstacles; i++) {
        const x = Math.random() * (width - 40); // 40 is obstacle size
        const type = Math.random() < 0.5 ? 'rock' : 'tree';
        newObstacles.push(new Obstacle(x, y, 40, type));
      }
    }
    
    setObstacles(newObstacles);
  }, []);

  const moveCharacter = useCallback((dx: number, dy: number) => {
    if (!character || !canvasRef.current || gameOver) return;

    const canvas = canvasRef.current;
    const oldY = character.y;
    
    // Calculate new position
    const newX = character.x + dx * character.size;
    const newY = character.y + dy * character.size;
    
    // Check for obstacle collisions
    const willCollide = obstacles.some(obstacle => {
      return (
        newX < obstacle.x + obstacle.size &&
        newX + character.size > obstacle.x &&
        newY < obstacle.y + obstacle.size &&
        newY + character.size > obstacle.y
      );
    });
    
    // Only move if no collision
    if (!willCollide) {
      character.move(dx, dy, canvas.width, canvas.height);
    }

    // Check if reached finish line
    if (dy < 0 && oldY > 50 && character.y <= 50) {
      setLevel(l => l + 1);
      setScore(s => s + 100);
      // Create new character at starting position
      const newCharacter = new Character(
        character.x,
        canvas.height - settings.characterSize - 10,
        settings
      );
      setCharacter(newCharacter);
    } else if (dy < 0 && character.y > 50) {
      // Score points for moving up
      setScore(s => s + 10);
      // Update character position state
      setCharacter(new Character(character.x, character.y, settings));
    }
  }, [character, gameOver, settings]);

  const spawnCar = useCallback(() => {
    if (!canvasRef.current) return;

    // Increase spawn chance based on level
    const baseSpawnChance = settings.carSpawnRate * (1 + level * settings.levelSpawnIncrease);
    
    // Add additional spawn chance every 5 levels
    const bonusSpawnChance = Math.floor(level / 5) * 0.01;
    
    const totalSpawnChance = Math.min(baseSpawnChance + bonusSpawnChance, 0.2);

    const now = performance.now();
    const spawnInterval = 1500 / (1 + level * settings.levelSpawnIncrease);
    if (now - lastSpawnTimeRef.current < spawnInterval) return;
    
    lastSpawnTimeRef.current = now;

    const canvas = canvasRef.current;
    const laneHeight = 60;
    const numLanes = Math.floor((canvas.height - 100) / laneHeight);

    // Chance to spawn multiple cars in different lanes
    const maxCarsToSpawn = Math.min(1 + Math.floor(level / 3), 3);
    const carsToSpawn = Math.random() < totalSpawnChance ? 
      Math.ceil(Math.random() * maxCarsToSpawn) : 1;

    const newCars = [];
    const usedLanes = new Set();

    for (let i = 0; i < carsToSpawn; i++) {
      let lane;
      do {
        lane = Math.floor(Math.random() * numLanes);
      } while (usedLanes.has(lane));
      
      usedLanes.add(lane);
      const y = 50 + lane * laneHeight + laneHeight / 4;
      const direction = Math.random() < 0.5 ? 1 : -1;
      
      // Increase base speed with level
      const baseSpeed = settings.baseCarSpeed + Math.random() * 3;
      const levelMultiplier = 1 + level * settings.levelSpeedIncrease;
      const speed = Math.min(baseSpeed * levelMultiplier, settings.maxCarSpeed);
      
      newCars.push(new Car(y, speed, direction, settings));
    }
    
    setCars(cars => [...cars, ...newCars]);
  }, [level, settings]);

  const checkCollisions = useCallback(() => {
    if (!character) return;

    const charBox = {
      left: character.x,
      right: character.x + character.size,
      top: character.y,
      bottom: character.y + character.size
    };

    for (const car of cars) {
      const carBox = {
        left: car.x,
        right: car.x + car.width,
        top: car.y,
        bottom: car.y + car.height
      };

      if (character.isAlive && 
          charBox.right > carBox.left &&
          charBox.left < carBox.right &&
          charBox.bottom > carBox.top &&
          charBox.top < carBox.bottom) {
        setGameOver(true);
        character.isAlive = false;
        return true;
      }
    }
    return false;
  }, [cars, character]);

  const gameLoop = useCallback(() => {
    if (!canvasRef.current || !character || gameOver) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = settings.grassColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw roads
    ctx.fillStyle = settings.roadColor;
    const laneHeight = 60;
    for (let y = 50; y < canvas.height - 50; y += laneHeight) {
      ctx.fillRect(0, y, canvas.width, laneHeight/2);
      
      // Draw finish line
      if (y === 50) {
        ctx.fillStyle = settings.finishLineColor;
        for (let x = 0; x < canvas.width; x += 40) {
          ctx.fillRect(x, y - 10, 20, 10);
        }
        ctx.fillStyle = settings.roadColor;
      }
    }

    // Draw obstacles
    obstacles.forEach(obstacle => obstacle.draw(ctx));

    // Update and draw cars
    const updatedCars = cars.filter(car => {
      car.update();
      car.draw(ctx);
      return !car.isOffScreen();
    });
    
    setCars(updatedCars);

    // Try to spawn a new car
    spawnCar();

    // Draw character
    character.draw(ctx);

    // Check collisions
    if (!checkCollisions()) {
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    }
  }, [character, gameOver, level, settings, spawnCar, checkCollisions]);

  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight * 0.7;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!gameOver) {
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameLoop, gameOver]);

  return (
    <div className="min-h-screen bg-green-500 flex flex-col items-center">
      <div className="w-full text-center py-4 bg-green-600">
        <h1 className="text-4xl font-bold text-white mb-2">Crossy Road</h1>
        <div className="text-xl text-white">Level: {level} | Score: {score}</div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '70vh' }}
      />

      {gameOver ? (
        <div className="mt-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Game Over!</h2>
          <button 
            className="px-6 py-2 bg-white text-green-500 rounded-lg shadow-lg hover:bg-gray-100 transition-colors"
            onClick={() => initGame(settings)}
          >
            Play Again
          </button>
        </div>
      ) : (
        <Controls onMove={moveCharacter} />
      )}
    </div>
  );
}