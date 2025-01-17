/*
  # Update RLS policies for game settings

  1. Changes
    - Add new RLS policy to allow authenticated users to update game settings
    - Keep existing read policy intact

  2. Security
    - Only authenticated users can update settings
    - Updates are restricted to existing rows only (no new row creation)
*/

-- Drop the old policy first to avoid conflicts
DROP POLICY IF EXISTS "Allow write access to admin users" ON game_settings;

-- Create new policy for updating settings
CREATE POLICY "Allow authenticated users to update settings"
  ON game_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);