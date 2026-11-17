/**
 * Rugged Pub basement layout (Level 2). One ASCII char = one 4x4m tile.
 *  # wall   . floor   S start   C cage (solid, Meast breaks it)   T Rugpull's terminal
 */
export const TILE = 4;
export const WALL_H = 4.5;
export const HOLDERS_TOTAL = 200;

export const MAP: string[] = [
  '#########################',
  '#S..#.......#...........#',
  '#...#..C.C..#..C..C..C..#',
  '#...#.......#...........#',
  '#...##.###.##.###.#######',
  '#.......................#',
  '#...#####.#####.#####...#',
  '#...#C.C#.#C.C#.#C.C#...#',
  '#...#...#.#...#.#...#...#',
  '#...##.##.##.##.##.##...#',
  '#.......................#',
  '#.####.#########.####...#',
  '#.#C.#.#.......#.#C.#...#',
  '#.#..#.#...T...#.#..#...#',
  '#.##.#.#.......#.##.#...#',
  '#.......................#',
  '#########################',
];

/** Guard patrol routes in tile coords [col,row] (ping-pong). Every tile must be floor. */
export const GUARD_DEFS: { id: string; path: [number, number][] }[] = [
  { id: 'g1', path: [[2, 5], [22, 5]] },
  { id: 'g2', path: [[22, 10], [2, 10]] },
  { id: 'g3', path: [[2, 15], [22, 15]] },
  { id: 'g4', path: [[9, 6], [9, 10]] },
  { id: 'g5', path: [[13, 3], [23, 3]] },
];

export const tileCenter = (c: number, r: number): [number, number] => [c * TILE + TILE / 2, r * TILE + TILE / 2];

export interface Cage { col: number; row: number; x: number; z: number }
export function parseBasement() {
  const walls: [number, number][] = [];
  const cages: Cage[] = [];
  const floors: [number, number][] = [];
  let start: [number, number] = [6, 6];
  let terminal: [number, number] = [0, 0];
  MAP.forEach((row, r) => row.split('').forEach((ch, c) => {
    const [x, z] = tileCenter(c, r);
    if (ch === '#') walls.push([x, z]);
    else {
      floors.push([x, z]);
      if (ch === 'C') cages.push({ col: c, row: r, x, z });
      if (ch === 'S') start = [x, z];
      if (ch === 'T') terminal = [x, z];
    }
  }));
  return { walls, cages, floors, start, terminal, cols: MAP[0].length, rows: MAP.length };
}

/** Split exactly 200 holders across the cages. */
export function holdersPerCage(n: number) {
  const base = Math.floor(HOLDERS_TOTAL / n);
  const extra = HOLDERS_TOTAL - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}
