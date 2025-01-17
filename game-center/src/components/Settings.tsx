import * as React from 'react';
import type { Database } from '../lib/database.types';

type GameSetting = Database['public']['Tables']['game_settings']['Row'];

interface SettingsProps {
  settings: GameSetting[];
  onUpdate: (gameId: string, key: string, value: any) => void;
}

export function Settings({ settings, onUpdate }: SettingsProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-6">Game Settings</h2>
      <div className="space-y-6">
        {settings.map(setting => {
          const value = typeof setting.value === 'string'
            ? JSON.parse(setting.value)
            : setting.value;

          return (
            <div key={setting.id} className="border-b pb-6">
              <label className="block font-medium mb-2">
                {setting.key}
              </label>
              <div className="flex gap-4 items-center">
                <input
                  type={value.type}
                  value={value.value}
                  min={value.min}
                  max={value.max}
                  step={value.step}
                  onChange={(e) => onUpdate(
                    setting.game_id,
                    setting.key,
                    {
                      ...value,
                      value: value.type === 'number'
                        ? parseFloat(e.target.value)
                        : e.target.value
                    }
                  )}
                  className="flex-1 p-2 border rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
                {value.type === 'number' && (
                  <div className="text-sm text-gray-500">
                    {value.min} - {value.max}
                  </div>
                )}
              </div>
              {setting.description && (
                <p className="text-sm text-gray-500 mt-2">
                  {setting.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}