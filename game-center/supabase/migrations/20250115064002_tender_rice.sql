/*
  # Add Flappy Bird high scores table

  1. New Tables
    - `high_scores`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `score` (integer)
      - `created_at` (timestamp)
      - `username` (text)

  2. Security
    - Enable RLS on `high_scores` table
    - Add policies for reading and inserting high scores
*/

-- Create high scores table
CREATE TABLE IF NOT EXISTS high_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  score integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  username text NOT NULL
);

-- Enable RLS
ALTER TABLE high_scores ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can read high scores"
  ON high_scores
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert high scores"
  ON high_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add Flappy Bird settings
INSERT INTO game_settings (game_id, key, value, description)
SELECT 
  games.id,
  settings.key,
  settings.value::jsonb,
  settings.description
FROM games
CROSS JOIN (
  VALUES 
    ('pipeSpeed', '{"type": "number", "value": 3, "min": 1, "max": 10, "step": 0.5}'::text, 'Speed of the pipes'),
    ('pipeSpawnRate', '{"type": "number", "value": 1500, "min": 1000, "max": 3000, "step": 100}'::text, 'Time between pipe spawns (ms)'),
    ('gapSize', '{"type": "number", "value": 250, "min": 150, "max": 400, "step": 10}'::text, 'Size of the gap between pipes'),
    ('gravity', '{"type": "number", "value": 0.6, "min": 0.3, "max": 1.0, "step": 0.1}'::text, 'Gravity strength'),
    ('jumpForce', '{"type": "number", "value": -9, "min": -15, "max": -5, "step": 0.5}'::text, 'Jump force (negative for upward)')
  ) AS settings(key, value, description)
WHERE games.slug = 'flappy-bird';