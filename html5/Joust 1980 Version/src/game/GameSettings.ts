export class GameSettings {
  // Canvas dimensions
  static readonly CANVAS_WIDTH = 800;
  static readonly CANVAS_HEIGHT = 600;

  // Player settings
  static readonly PLAYER = {
    WIDTH: 60,
    HEIGHT: 60,
    SPEED: 4,
    GRAVITY: 0.2,
    FLAP_FORCE: -6,
    TERMINAL_VELOCITY: 8,
    INVULNERABILITY_TIME: 2000,
    COLORS: {
      NORMAL: '#00CED1',
      INVULNERABLE: '#FFD700',
      RIDER: '#FFE4B5',
      LANCE: '#FF4500'
    }
  };

  // Enemy settings
  static readonly ENEMY = {
    WIDTH: 60,
    HEIGHT: 60,
    GRAVITY: 0.2,
    BASE_SPEED: 2,
    JUMP_DELAY: {
      MIN: 500,
      MAX: 1500
    }
  };

  // Platform settings
  static readonly PLATFORM = {
    HEIGHT: 20,
    COLORS: {
      BASE: '#8B4513',
      CENTER: '#FFFFFF',
      DOTS: '#FFD700'
    }
  };

  // Score settings
  static readonly SCORE = {
    INITIAL_LIVES: 3,
    EXTRA_LIFE_POINTS: 20000,
    DEATH_PENALTY: -50,
    FONT: 'bold 28px monospace',
    COLOR: '#FFD700',
    Y_POSITION: 50,
    X_POSITION: 200,
    PTERODACTYL_SPAWN_TIME: 30000 // 30 seconds before pterodactyl appears
  };

  // Animation settings
  static readonly ANIMATION = {
    WING_SPEED: 100,
    WING_AMPLITUDE: 3,
    LEG_SPEED: 150,
    LEG_AMPLITUDE: 2
  };

  // Platform positions
  static getPlatformConfig(width: number, height: number) {
    return [
      { x: 0, y: height - 20, width: width },
      { x: 50, y: height - 160, width: 200 },
      { x: width - 250, y: height - 160, width: 200 },
      { x: width/2 - 100, y: height - 290, width: 200 },
      { x: 0, y: height - 420, width: 100 },
      { x: width - 100, y: height - 420, width: 100 }
    ];
  }

  // Initial enemy positions
  static getInitialEnemies(width: number) {
    return [
      { x: 100, y: 50, type: 'shadowlord' as const },
      { x: width - 300, y: 50, type: 'hunter' as const },
      { x: width - 100, y: 50, type: 'bounder' as const }
    ];
  }
}