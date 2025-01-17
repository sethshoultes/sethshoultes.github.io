/*
  # Game Center Schema Setup

  1. New Tables
    - `games`
      - `id` (uuid, primary key)
      - `name` (text) - Game name (e.g., "Crossy Road", "Flappy Bird")
      - `slug` (text) - URL-friendly name
      - `active` (boolean) - Whether the game is available
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `game_settings`
      - `id` (uuid, primary key)
      - `game_id` (uuid, foreign key)
      - `key` (text) - Setting name (e.g., "characterSize")
      - `value` (jsonb) - Setting value with type information
      - `description` (text) - Setting description
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated admin users
*/

-- Create games table
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create game_settings table
CREATE TABLE IF NOT EXISTS game_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES games(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(game_id, key)
);

-- Enable RLS
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read access to all users"
  ON games
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow write access to admin users"
  ON games
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' IN ('seth@smartwebutah.com')); -- Replace with actual admin emails

CREATE POLICY "Allow read access to all users"
  ON game_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow write access to admin users"
  ON game_settings
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' IN ('seth@smartwebutah.com')); -- Replace with actual admin emails

-- Insert initial games
INSERT INTO games (name, slug) VALUES
  ('Crossy Road', 'crossy-road'),
  ('Flappy Bird', 'flappy-bird');

-- Insert Crossy Road settings
INSERT INTO game_settings (game_id, key, value, description)
SELECT 
  games.id,
  settings.key,
  settings.value::jsonb,
  settings.description
FROM games
CROSS JOIN (
  VALUES 
    ('characterSize', '{"type": "number", "value": 30, "min": 20, "max": 50}'::text, 'Size of the player character'),
    ('characterColor', '{"type": "color", "value": "#fde047"}'::text, 'Color of the player character'),
    ('carSize', '{"type": "number", "value": 40, "min": 30, "max": 60}'::text, 'Size of the cars'),
    ('carColor', '{"type": "color", "value": "#ef4444"}'::text, 'Color of the cars'),
    ('baseCarSpeed', '{"type": "number", "value": 2, "min": 1, "max": 5, "step": 0.5}'::text, 'Base speed of cars'),
    ('maxCarSpeed', '{"type": "number", "value": 10, "min": 5, "max": 15}'::text, 'Maximum car speed'),
    ('carSpawnRate', '{"type": "number", "value": 0.02, "min": 0.01, "max": 0.1, "step": 0.01}'::text, 'Rate at which cars spawn'),
    ('levelSpeedIncrease', '{"type": "number", "value": 0.05, "min": 0, "max": 0.2, "step": 0.01}'::text, 'Speed increase per level'),
    ('levelSpawnIncrease', '{"type": "number", "value": 0.1, "min": 0, "max": 0.5, "step": 0.05}'::text, 'Spawn rate increase per level'),
    ('grassColor', '{"type": "color", "value": "#4ade80"}'::text, 'Color of the grass'),
    ('roadColor', '{"type": "color", "value": "#374151"}'::text, 'Color of the road'),
    ('finishLineColor', '{"type": "color", "value": "#fbbf24"}'::text, 'Color of the finish line')
  ) AS settings(key, value, description)
WHERE games.slug = 'crossy-road';