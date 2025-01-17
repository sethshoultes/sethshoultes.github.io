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

class Character {
  constructor(x, y, settings) {
    this.x = x;
    this.y = y;
    this.size = settings.characterSize;
    this.isAlive = true;
    this.settings = settings;
  }

  draw(ctx) {
    ctx.fillStyle = this.settings.characterColor;
    ctx.fillRect(this.x, this.y, this.size, this.size);
    
    // Draw chicken face
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(this.x + 20, this.y + 5, 8, 8); // Comb
    ctx.fillStyle = '#000';
    ctx.fillRect(this.x + 5, this.y + 10, 4, 4); // Eye
  }

  move(dx, dy, gameWidth, gameHeight) {
    const newX = this.x + dx * this.size;
    const newY = this.y + dy * this.size;

    if (newX >= 0 && newX + this.size <= gameWidth) {
      this.x = newX;
    }
    if (newY >= 0 && newY + this.size <= gameHeight) {
      this.y = newY;
    }
  }
}

class Car {
  constructor(y, speed, direction, settings) {
    this.y = y;
    this.speed = speed;
    this.direction = direction;
    this.size = settings.carSize;
    this.x = direction > 0 ? -this.size : window.innerWidth;
    this.settings = settings;
  }

  update() {
    this.x += this.speed * this.direction;
  }

  draw(ctx) {
    ctx.fillStyle = this.settings.carColor;
    ctx.fillRect(this.x, this.y, this.size, this.size/2);
  }

  isOffScreen() {
    return this.direction > 0 ? 
      this.x > window.innerWidth : 
      this.x + this.size < 0;
  }
}

export class Game {
  constructor(gameCenter) {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.settings = { ...DEFAULT_SETTINGS };
    this.level = 1;
    this.score = 0;
    this.gameOver = false;
    this.gameCenter = gameCenter;
    
    this.setupCanvas();
    this.setupControls();
    this.reset();
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const settings = await this.gameCenter.getGameSettings('crossy-road');
      const newSettings = {};
      settings.forEach(setting => {
        const value = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
        newSettings[setting.key] = value.value;
      });
      
      this.updateSettings(newSettings);
      // Recreate character with new settings
      if (this.character) {
        this.character = new Character(
          this.character.x,
          this.character.y,
          this.settings
        );
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  setupCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight * 0.7;
    
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight * 0.7;
    });
  }

  setupControls() {
    // Touch controls
    document.getElementById('upButton').addEventListener('click', () => this.moveCharacter(0, -1));
    document.getElementById('downButton').addEventListener('click', () => this.moveCharacter(0, 1));
    document.getElementById('leftButton').addEventListener('click', () => this.moveCharacter(-1, 0));
    document.getElementById('rightButton').addEventListener('click', () => this.moveCharacter(1, 0));

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if (this.gameOver) return;
      
      switch(e.key) {
        case 'ArrowUp':
          this.moveCharacter(0, -1);
          break;
        case 'ArrowDown':
          this.moveCharacter(0, 1);
          break;
        case 'ArrowLeft':
          this.moveCharacter(-1, 0);
          break;
        case 'ArrowRight':
          this.moveCharacter(1, 0);
          break;
      }
    });

    // Restart button
    document.getElementById('restartButton').addEventListener('click', () => {
      this.reset();
      document.getElementById('gameOver').classList.add('hidden');
    });
  }

  reset() {
    this.character = new Character(
      this.canvas.width / 2 - 15,
      this.canvas.height - 50,
      this.settings
    );
    this.cars = [];
    this.score = 0;
    this.level = 1;
    this.gameOver = false;
    this.updateScore();
  }

  moveCharacter(dx, dy) {
    if (this.gameOver) return;
    
    const oldY = this.character.y;
    this.character.move(dx, dy, this.canvas.width, this.canvas.height);
    
    if (dy < 0) { // Moving up
      this.score++;
      this.updateScore();
      
      // Check if reached top
      if (this.character.y <= 50 && oldY > 50) {
        this.levelUp();
      }
    }
  }

  levelUp() {
    if (this.level < 999) {
      this.level++;
      // Reset character position
      this.character.y = this.canvas.height - 50;
    }
  }

  updateScore() {
    document.getElementById('score').textContent = `Level: ${this.level} | Score: ${this.score}`;
  }

  updateSettings(newSettings) {
    this.settings = {
      ...this.settings,
      ...newSettings
    };
  }

  spawnCar() {
    // Increase spawn rate with level
    if (Math.random() < this.settings.carSpawnRate * (1 + this.level * this.settings.levelSpawnIncrease)) {
      const laneHeight = 60;
      const numLanes = Math.floor((this.canvas.height - 100) / laneHeight);
      const lane = Math.floor(Math.random() * numLanes);
      const y = 50 + lane * laneHeight;
      const direction = Math.random() < 0.5 ? 1 : -1;
      // Increase speed with level
      const baseSpeed = this.settings.baseCarSpeed + Math.random() * 3;
      const levelMultiplier = 1 + this.level * this.settings.levelSpeedIncrease;
      const speed = Math.min(baseSpeed * levelMultiplier, this.settings.maxCarSpeed);
      
      this.cars.push(new Car(y, speed, direction, this.settings));
    }
  }

  checkCollisions() {
    for (const car of this.cars) {
      if (this.character.isAlive &&
          this.character.x < car.x + car.size &&
          this.character.x + this.character.size > car.x &&
          this.character.y < car.y + car.size/2 &&
          this.character.y + this.character.size > car.y) {
        this.endGame();
      }
    }
  }

  endGame() {
    this.gameOver = true;
    this.character.isAlive = false;
    document.getElementById('gameOver').classList.remove('hidden');
  }

  update() {
    this.spawnCar();
    
    this.cars = this.cars.filter(car => !car.isOffScreen());
    this.cars.forEach(car => car.update());
    
    this.checkCollisions();
  }

  draw() {
    this.ctx.fillStyle = this.settings.grassColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw roads
    this.ctx.fillStyle = this.settings.roadColor;
    const laneHeight = 60;
    for (let y = 50; y < this.canvas.height - 50; y += laneHeight) {
      this.ctx.fillRect(0, y, this.canvas.width, laneHeight/2);
      
      // Draw finish line at the top
      if (y === 50) {
        this.ctx.fillStyle = this.settings.finishLineColor;
        for (let x = 0; x < this.canvas.width; x += 40) {
          this.ctx.fillRect(x, y - 10, 20, 10);
        }
        this.ctx.fillStyle = this.settings.roadColor;
      }
    }

    this.cars.forEach(car => car.draw(this.ctx));
    this.character.draw(this.ctx);
  }

  gameLoop = () => {
    this.update();
    this.draw();
    requestAnimationFrame(this.gameLoop);
  }

  start() {
    this.gameLoop();
  }
}