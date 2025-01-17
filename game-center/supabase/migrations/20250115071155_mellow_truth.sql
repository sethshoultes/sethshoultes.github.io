/*
  # Game Center Core Tables

  1. New Tables
    - Preserves existing structure but adds new indexes and constraints
    - Adds additional metadata fields for better tracking

  2. Security
    - Maintains existing RLS policies
    - Adds new policies for cross-origin access
*/

-- Add indexes to improve query performance
CREATE INDEX IF NOT EXISTS idx_games_slug ON games(slug);
CREATE INDEX IF NOT EXISTS idx_game_settings_game_id ON game_settings(game_id);

-- Add last_accessed timestamp to track game usage
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS last_accessed timestamptz;

-- Add version tracking for settings
ALTER TABLE game_settings
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- Create function to update last_accessed
CREATE OR REPLACE FUNCTION update_game_last_accessed()
RETURNS trigger AS $$
BEGIN
  UPDATE games 
  SET last_accessed = now()
  WHERE id = NEW.game_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for last_accessed
CREATE TRIGGER update_game_last_accessed_trigger
AFTER INSERT OR UPDATE ON game_settings
FOR EACH ROW
EXECUTE FUNCTION update_game_last_accessed();

-- Add policy for cross-origin access
CREATE POLICY "Allow cross-origin read access"
  ON games
  FOR SELECT
  TO anon
  USING (active = true);

CREATE POLICY "Allow cross-origin settings read"
  ON game_settings
  FOR SELECT
  TO anon
  USING (true);