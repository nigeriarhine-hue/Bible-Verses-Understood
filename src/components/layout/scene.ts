/** Which sky the app paints, and how the time of day chooses one. */
export type Scene = 'sunrise' | 'day' | 'golden' | 'night';

/** Picks a sky to match the reader's own time of day. */
export function sceneForHour(hour: number): Scene {
  if (hour < 5) return 'night';
  if (hour < 9) return 'sunrise';
  if (hour < 16) return 'day';
  if (hour < 20) return 'golden';
  return 'night';
}

