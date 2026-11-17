export type CrewId = 'brandon' | 'pol' | 'robofap' | 'paperhands' | 'meast' | 'tek';
export type CharId = 'jake' | CrewId | 'rugpull' | 'guard' | 'bear' | 'worker' | 'og' | 'biker';
export type LevelId = 1 | 2 | 3 | 4 | 5;

export const CREW_ORDER: CrewId[] = ['brandon', 'pol', 'robofap', 'paperhands', 'meast', 'tek'];

export const CREW_INFO: Record<CrewId, { name: string; emoji: string; color: string }> = {
  brandon: { name: 'BRANDON', emoji: '🍗', color: '#ef4444' },
  pol: { name: 'POL', emoji: '💅', color: '#f472b6' },
  robofap: { name: 'ROBOFAP', emoji: '🤖', color: '#22d3ee' },
  paperhands: { name: 'PAPER HANDS', emoji: '🧻', color: '#e5e7eb' },
  meast: { name: 'MEAST', emoji: '💪', color: '#f59e0b' },
  tek: { name: 'TEK', emoji: '💻', color: '#39ff88' },
};
