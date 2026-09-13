/**
 * Icon geometry, kept apart from the component so the module exports only
 * data and helpers (and the component file exports only a component).
 *
 * Deliberately abstract — light, sky, landscape and journey shapes rather
 * than religious imagery, so Scripture stays the focus.
 */
export type IconName =
  | 'mail'
  | 'search'
  | 'book'
  | 'compass'
  | 'sun'
  | 'sunrise'
  | 'moon'
  | 'star'
  | 'heart'
  | 'bookmark'
  | 'bookmark-filled'
  | 'share'
  | 'speaker'
  | 'stop'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'arrow-right'
  | 'arrow-left'
  | 'close'
  | 'menu'
  | 'user'
  | 'plus'
  | 'check'
  | 'trash'
  | 'clock'
  | 'sparkle'
  | 'layers'
  | 'message'
  | 'info'
  | 'shield'
  | 'anchor'
  | 'leaf'
  | 'mountain'
  | 'waves'
  | 'lantern'
  | 'path'
  | 'bridge'
  | 'hands'
  | 'flame'
  | 'seedling'
  | 'scales'
  | 'hourglass'
  | 'crossroads'
  | 'open-hand'
  | 'home'
  | 'rings'
  | 'coin'
  | 'owl'
  | 'mirror'
  | 'candle'
  | 'reins'
  | 'tools'
  | 'fork'
  | 'key';

export const PATHS: Record<IconName, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5ZM4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  sunrise: 'M12 3v5M5.6 9.6 4.2 8.2M18.4 9.6l1.4-1.4M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M2 21h20',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  star: 'm12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8L12 3Z',
  heart: 'M12 20s-7-4.4-7-9.3A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.7c0 4.9-7 9.3-7 9.3Z',
  bookmark: 'M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1Z',
  'bookmark-filled': 'M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1Z',
  share: 'M12 3v13M8.5 6.5 12 3l3.5 3.5M5 14v5.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V14',
  speaker: 'M4 9.5h3.5L12 5.5v13L7.5 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  stop: 'M7 7h10v10H7z',
  'chevron-left': 'm14.5 6-5.5 6 5.5 6',
  'chevron-right': 'm9.5 6 5.5 6-5.5 6',
  'chevron-down': 'm6 9.5 6 5.5 6-5.5',
  'arrow-right': 'M4 12h15M13 6l6 6-6 6',
  'arrow-left': 'M20 12H5M11 6l-6 6 6 6',
  close: 'm6 6 12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 13 4.5 4.5L19 7',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.5l3.5 2',
  sparkle: 'M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5ZM18.5 16.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z',
  layers: 'm12 3 8.5 4.5L12 12 3.5 7.5 12 3ZM4 12l8 4.3 8-4.3M4 16.5 12 21l8-4.5',
  message: 'M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 7.6v.6',
  shield: 'M12 3 20 6v6c0 4.6-3.3 7.9-8 9-4.7-1.1-8-4.4-8-9V6l8-3Z',
  anchor: 'M12 9v12M12 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM5 13a7 7 0 0 0 14 0M4 13h2M18 13h2',
  leaf: 'M20 4C10 4 4 9 4 16c0 2 .7 3.4.7 3.4S9 12 19 8c0 0-6 3.5-8.5 11.5C16 21 20 16 20 4Z',
  mountain: 'M3 19h18L14 6l-3.5 6.5L8.5 10 3 19Z',
  waves: 'M3 8c2.5-2 4.5 2 7 0s4.5-2 7 0 4-2 4-2M3 14c2.5-2 4.5 2 7 0s4.5-2 7 0 4-2 4-2M3 20c2.5-2 4.5 2 7 0s4.5-2 7 0 4-2 4-2',
  lantern: 'M9 3h6M12 3v3M7 6h10l-1.5 12H8.5L7 6ZM10 20h4',
  path: 'M6 21c0-5 12-7 12-12a4 4 0 0 0-8 0c0 2 2 3 2 3',
  bridge: 'M3 10h18M5 10v9M19 10v9M3 19c0-5 4-7 9-7s9 2 9 7',
  hands: 'M8 21v-6l-2.5-3a2 2 0 0 1 3-2.6L11 12V4a1.5 1.5 0 0 1 3 0v6M14 10a1.5 1.5 0 0 1 3 0v7a4 4 0 0 1-4 4H8',
  flame: 'M12 21a6 6 0 0 0 6-6c0-5-6-12-6-12S6 10 6 15a6 6 0 0 0 6 6ZM12 21a2.6 2.6 0 0 0 2.6-2.6c0-2-2.6-4.4-2.6-4.4s-2.6 2.4-2.6 4.4A2.6 2.6 0 0 0 12 21Z',
  seedling: 'M12 21v-8M12 13C12 9 9 7 5 7c0 4 3 6 7 6ZM12 13c0-4 3-6 7-6 0 4-3 6-7 6Z',
  scales: 'M12 4v16M7 20h10M4 8h16M4 8 2 14h4L4 8ZM20 8l-2 6h4l-2-6ZM8 6l4-2 4 2',
  hourglass: 'M6 3h12M6 21h12M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9',
  crossroads: 'M12 21V9M12 9 7 4M12 9l5-5M4 21h16',
  'open-hand': 'M7 12V6.5a1.5 1.5 0 0 1 3 0V11M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V6a1.5 1.5 0 0 1 3 0v7M16 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-2',
  home: 'M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9Z',
  rings: 'M9 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM15 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM14.5 9.2A3 3 0 0 0 12 8c-1.7 0-2.5.9-2.5 2s1 1.7 2.5 2 2.5.9 2.5 2-1 2-2.5 2a3 3 0 0 1-2.5-1.2M12 6.5v11',
  owl: 'M5 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM11 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM9 9h.01M15 9h.01M12 13v3M8 20l4-3 4 3',
  mirror: 'M12 3c3.9 0 7 3.4 7 7.5S15.9 18 12 18s-7-3.4-7-7.5S8.1 3 12 3ZM12 18v3M9 21h6',
  candle: 'M12 3s2 2 2 3.5a2 2 0 0 1-4 0C10 5 12 3 12 3ZM8 11h8v10H8zM8 11c0-1 1.5-2 4-2s4 1 4 2',
  reins: 'M5 6c5 0 5 12 14 12M5 18c5 0 5-12 14-12M3 6h2M3 18h2M19 4v4M19 16v4',
  tools: 'm5 19 7-7M14.5 3.5a4 4 0 0 0 5 5l-9 9-5-5 9-9ZM4 20l2-2',
  fork: 'M12 21V12M12 12 6 5M12 12l6-7M6 5V3M18 5V3',
  mail:
    'M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5zM3.6 7l7.3 5.2a2 2 0 0 0 2.2 0L20.4 7',
  key: 'M15 9a4 4 0 1 0-3.5 4L9 15.5l1.5 1.5L9 18.5l1.5 1.5 2-2 2.5-2.5A4 4 0 0 0 15 9Z',
};

/** Maps a topic's stored icon keyword to an icon, with a safe default. */
export function topicIcon(keyword: string | null | undefined): IconName {
  const name = (keyword ?? "") as IconName;
  return name in PATHS ? name : "sparkle";
}
