/**
 * Level 2 hack puzzle generator: "Dump Rugpull's shitcoin, NOT FAPCOIN."
 * Exactly one token's top holder is Rugpull's wallet. One decoy holds a LOOKALIKE wallet (one hex digit off),
 * so you have to actually read it. FAPCOIN is always in the list as the trap.
 */
import { rng } from '@/lib/rng';

const HEX = '0123456789abcdef';

export interface DumpToken {
  id: string; ticker: string; deployer: string; tax: number; topHolder: string; topPct: number; note: string;
}
export interface DumpRound { wallet: string; tokens: DumpToken[]; correctId: string }

export function makeDumpRound(seed: number): DumpRound {
  const r = rng(seed * 7727 + 31);
  const hex = (n: number) => Array.from({ length: n }, () => HEX[Math.floor(r() * 16)]).join('');
  const suffix = hex(4);
  const wallet = `0xRUG…${suffix}`;

  // lookalike: change exactly one character
  const pos = Math.floor(r() * 4);
  let ch = HEX[Math.floor(r() * 16)];
  while (ch === suffix[pos]) ch = HEX[Math.floor(r() * 16)];
  const look = suffix.slice(0, pos) + ch + suffix.slice(pos + 1);

  const tokens: DumpToken[] = [
    { id: 'rugd', ticker: '$RUGGD', deployer: `0x${hex(2)}…${hex(2)}`, tax: 99, topHolder: wallet, topPct: 98, note: 'LP unlocked · honeypot' },
    { id: 'lookalike', ticker: '$RUGDE', deployer: `0x${hex(2)}…${hex(2)}`, tax: 12, topHolder: `0xRUG…${look}`, topPct: 97, note: 'copycat deployer' },
    { id: 'whale', ticker: '$FAPE', deployer: `0x${hex(2)}…${hex(2)}`, tax: 5, topHolder: `0x${hex(3)}…${hex(3)}`, topPct: 61, note: 'one big whale' },
    { id: 'clean', ticker: '$WAGMI', deployer: `0x${hex(2)}…${hex(2)}`, tax: 0, topHolder: `0x${hex(3)}…${hex(3)}`, topPct: 7, note: 'healthy spread' },
    { id: 'fap', ticker: 'FAPCOIN', deployer: 'Satoshi Shitoshi', tax: 30, topHolder: 'community', topPct: 4, note: 'abandoned · tax hijacked' },
  ];
  for (let i = tokens.length - 1; i > 0; i--) { // Fisher-Yates
    const j = Math.floor(r() * (i + 1));
    [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
  }
  return { wallet, tokens, correctId: 'rugd' };
}
