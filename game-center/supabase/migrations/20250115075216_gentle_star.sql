/*
  # Add Enhanced Game Settings

  1. New Settings
    - `maxCarsPerSpawn`: Maximum number of cars that can spawn at once
    - `bonusSpawnChancePerLevel`: Additional spawn chance added every 5 levels
    - `maxSpawnChance`: Maximum total spawn chance cap
    - `baseSpawnInterval`: Base interval between car spawns in milliseconds

  2. Description
    Adds new settings to support enhanced game difficulty features:
    - Multiple car spawning
    - Level-based difficulty scaling
    - Spawn rate control
*/

-- Add new settings for Crossy Road
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
      'maxCarsPerSpawn',
      '{"type": "number", "value": 3, "min": 1, "max": 5, "step": 1}',
      'Maximum number of cars that can spawn simultaneously'
    ),
    (
      'bonusSpawnChancePerLevel',
      '{"type": "number", "value": 0.01, "min": 0, "max": 0.05, "step": 0.005}',
      'Additional spawn chance added every 5 levels'
    ),
    (
      'maxSpawnChance',
      '{"type": "number", "value": 0.2, "min": 0.1, "max": 0.5, "step": 0.05}',
      'Maximum total spawn chance cap'
    ),
    (
      'baseSpawnInterval',
      '{"type": "number", "value": 1500, "min": 500, "max": 3000, "step": 100}',
      'Base interval between car spawns in milliseconds'
    )
  ) AS settings(key, value, description)
WHERE games.slug = 'crossy-road'
AND NOT EXISTS (
  SELECT 1 FROM game_settings gs 
  WHERE gs.game_id = games.id 
  AND gs.key = settings.key
);