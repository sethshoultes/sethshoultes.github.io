import { useCallback, useState, useRef } from 'react';
import { Player } from '../game/Player';
import { Enemy } from '../game/Enemy';
import { Platform } from '../game/Platform';
import { Score } from '../game/Score';
import { GameSettings } from '../game/GameSettings';

export function useGame(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const [gameScore, setGameScore] = useState<Score>(new Score());
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [lastExtraLife, setLastExtraLife] = useState(0);
  const [lastPterodactylSpawn, setLastPterodactylSpawn] = useState(0);
  const gameLoopRef = useRef<number>();
  
  const startGame = useCallback(() => {
    if (isGameRunning) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clean up any existing game loop
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);

    const score = new Score();
    const player = new Player(canvas.width / 2, canvas.height / 2);
    const enemies = GameSettings.getInitialEnemies(canvas.width)
      .map(e => new Enemy(e.x, e.y, e.type));
    const platforms = GameSettings.getPlatformConfig(canvas.width, canvas.height)
      .map(p => new Platform(p.x, p.y, p.width));

    setLastExtraLife(0);
    setLastPterodactylSpawn(0);

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':
          player.moveLeft();
          break;
        case 'ArrowRight':
          player.moveRight();
          break;
        case 'Space':
          e.preventDefault();
          player.flap();
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'ArrowRight':
          player.stop();
          break;
        case 'Space':
          e.preventDefault();
          player.stopFlapping();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const render = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Check for extra life
      const currentScore = score.getScore();
      const extraLifeThreshold = Math.floor(currentScore / GameSettings.SCORE.EXTRA_LIFE_POINTS);
      const pterodactylThreshold = Math.floor(currentScore / GameSettings.SCORE.EXTRA_LIFE_POINTS);
      
      if (extraLifeThreshold > lastExtraLife) {
        score.addLife();
        setLastExtraLife(extraLifeThreshold);
      }
      
      // Spawn pterodactyl every 20,000 points if none exists
      if (pterodactylThreshold > lastPterodactylSpawn && !enemies.some(e => e.type === 'pterodactyl')) {
        enemies.push(new Enemy(
          Math.random() * canvas.width,
          50,
          'pterodactyl'
        ));
        setLastPterodactylSpawn(pterodactylThreshold);
      }

      platforms.forEach(platform => platform.draw(ctx));
      score.draw(ctx);
      
      player.update(platforms);
      player.draw(ctx);

      enemies.forEach(enemy => {
        enemy.update(platforms);
        enemy.draw(ctx);

        if (player.checkCollision(enemy)) {
          if (enemy.type === 'pterodactyl') {
            // Pterodactyl always dismounts unless hit in the mouth with lance
            const hitInMouth = (
              player.facingRight === enemy.facingRight && // Same direction
              Math.abs(player.y - enemy.y) < 10 && // Similar height
              (player.facingRight ? 
                player.x < enemy.x && player.x + player.width > enemy.x : // Right facing
                player.x > enemy.x && player.x - player.width < enemy.x)  // Left facing
            );
            
            if (hitInMouth) {
              score.addPoints(enemy.config.points);
              score.addKill();
              enemy.reset(canvas);
            } else {
              score.addPoints(GameSettings.SCORE.DEATH_PENALTY);
              score.loseLife();
              if (score.getLives() <= 0) {
                window.removeEventListener('keydown', handleKeyDown);
                window.removeEventListener('keyup', handleKeyUp);
                cancelAnimationFrame(gameLoopRef.current!);
                setIsGameRunning(false);
                return;
              }
              player.reset(canvas);
            }
          } else if (player.y < enemy.y) {
            score.addPoints(enemy.config.points);
            score.addKill();
            enemy.reset(canvas);
          } else if (!player.invulnerable) {
            score.addPoints(GameSettings.SCORE.DEATH_PENALTY);
            score.loseLife();
            if (score.getLives() <= 0) {
              window.removeEventListener('keydown', handleKeyDown);
              window.removeEventListener('keyup', handleKeyUp);
              cancelAnimationFrame(gameLoopRef.current!);
              setIsGameRunning(false);
              return;
            }
            player.reset(canvas);
          }
        }
      });

      setGameScore(score);
      gameLoopRef.current = requestAnimationFrame(render);
    };

    // Set up event listeners and start the game loop
    setIsGameRunning(true);
    render();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      setIsGameRunning(false);
    };
  }, [isGameRunning]);

  return {
    startGame,
    isGameRunning,
    score: gameScore.getScore(),
    lives: gameScore.getLives(),
    kills: gameScore.getKills()
  };
}