export type EnemyType = 'shadowlord' | 'hunter' | 'bounder' | 'pterodactyl';

export interface EnemyConfig {
  color: string;
  riderColor: string;
  speed: number;
  jumpForce: number;
  points: number;
}

export const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig> = {
  shadowlord: {
    color: '#4169E1', // Royal Blue
    riderColor: '#000080', // Navy Blue
    speed: 5,
    jumpForce: -3.2,
    points: 1500
  },
  hunter: {
    color: '#32CD32', // Lime Green
    riderColor: '#8B0000', // Dark Red
    speed: 4,
    jumpForce: -2.8,
    points: 750
  },
  bounder: {
    color: '#98FB98', // Pale Green
    riderColor: '#A52A2A', // Brown
    speed: 3,
    jumpForce: -2.4,
    points: 500
  },
  pterodactyl: {
    color: '#FF4500', // Orange Red
    riderColor: '#8B0000', // Dark Red
    speed: 6,
    jumpForce: -4,
    points: 2000
  }
};