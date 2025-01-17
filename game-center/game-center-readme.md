# Game Center System Documentation

## Overview
The Game Center is a modular gaming platform built with React, TypeScript, and Supabase. It consists of two main components:
1. Game Portal - Where users play games
2. Admin Panel - Where administrators manage game settings

## System Architecture

### Database Structure
- `games` table: Stores game metadata
  - `id`: Unique identifier
  - `name`: Display name
  - `slug`: URL-friendly identifier
  - `active`: Game availability status
  - `last_accessed`: Timestamp of last settings update

- `game_settings` table: Stores configurable game parameters
  - `game_id`: Reference to games table
  - `key`: Setting identifier
  - `value`: JSON object containing:
    - `type`: "number" | "color"
    - `value`: Current value
    - `min`: Minimum value (for numbers)
    - `max`: Maximum value (for numbers)
    - `step`: Increment size (for numbers)
  - `description`: Setting description
  - `version`: Setting version for change tracking

- `high_scores` table: Stores player achievements
  - `user_id`: Player identifier
  - `score`: Numeric score
  - `username`: Player display name

### Security
- Row Level Security (RLS) enabled on all tables
- Public read access for games and settings
- Authenticated write access for high scores
- Admin-only access for game management

## Adding a New Game

### 1. Database Setup
Create a new migration file in `supabase/migrations/` with:
```sql
-- Add game entry
INSERT INTO games (name, slug) 
VALUES ('Game Name', 'game-slug');

-- Add game settings
INSERT INTO game_settings (game_id, key, value, description)
SELECT 
  games.id,
  settings.key,
  settings.value::jsonb,
  settings.description
FROM games
CROSS JOIN (
  VALUES 
    (
      'settingKey',
      '{"type": "number", "value": 1, "min": 0, "max": 10, "step": 1}',
      'Setting description'
    )
  ) AS settings(key, value, description)
WHERE games.slug = 'game-slug';
```

### 2. Game Component Structure
Create a new directory in `src/games/your-game/` with:
```
your-game/
├── Game.tsx            # Main game component
├── components/         # Game-specific components
│   ├── Player.tsx
│   └── ...
└── types.ts           # Game-specific types
```

### 3. Game Component Requirements
Your main Game component must:
1. Load settings from Supabase
2. Implement game loop using requestAnimationFrame
3. Handle user input
4. Manage game state
5. Support high scores
6. Use Tailwind CSS for styling

Example structure:
```typescript
export function YourGame() {
  // Settings state
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  
  // Game state
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  
  // Load settings
  useEffect(() => {
    loadSettings();
  }, []);

  // Game loop
  useEffect(() => {
    if (gameStarted && !gameOver) {
      const gameLoop = () => {
        // Update game state
        requestAnimationFrame(gameLoop);
      };
      requestAnimationFrame(gameLoop);
    }
  }, [gameStarted, gameOver]);

  return (
    <div className="game-container">
      {/* Game UI */}
    </div>
  );
}
```

### 4. Register in App.tsx
Add your game to the game selection screen in `src/App.tsx`:
```typescript
<button
  onClick={() => setCurrentGame('your-game')}
  className="game-button"
>
  <h2>Your Game</h2>
  <p>Game description</p>
</button>
```

### 5. Settings Requirements
Each setting must include:
- Descriptive key name
- Appropriate type (number/color)
- Reasonable min/max values for numbers
- Clear description
- Default value

### 6. Best Practices
1. Use TypeScript for type safety
2. Implement proper cleanup in useEffect hooks
3. Use constants for default values
4. Handle window resize events
5. Implement proper error handling
6. Use Tailwind CSS for responsive design
7. Follow existing game patterns for consistency

### 7. Testing
Before deployment:
1. Verify settings load correctly
2. Test game mechanics
3. Verify high score submission
4. Test responsive design
5. Check error handling
6. Verify cleanup on unmount

## Example Game Settings
```typescript
const DEFAULT_SETTINGS = {
  playerSpeed: {
    type: 'number',
    value: 5,
    min: 1,
    max: 10,
    step: 0.5
  },
  backgroundColor: {
    type: 'color',
    value: '#4ade80'
  }
};
```

## Deployment
The system automatically deploys through Netlify:
1. Main game portal: `/`
2. Admin panel: `/admin`
3. Individual games: