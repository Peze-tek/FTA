import type { CrewId } from '@/lib/types';
import type { DialogueLine } from '@/lib/store';

export interface RecruitQuest {
  npc: CrewId;
  district: 1 | 2 | 3 | 4;
  npcPos: [number, number, number];
  facing: number; // rotation.y; 0 faces +z
  firstStep: 'orbs' | 'infiltrate';
  orbLabel: string;
  orbs: [number, number][]; // x, z
  objectiveTalk: string;
  reminder: string;
  pumpTo: number;
  lines: DialogueLine[];
}

const J = (text: string): DialogueLine => ({ who: 'JACK', text, color: '#a78bfa' });

/** LEVEL 1 — order is locked: Brandon > Pol > Robofap > Paper Hands > Meast > Tek. */
export const RECRUIT_QUESTS: RecruitQuest[] = [
  {
    npc: 'brandon', district: 1, npcPos: [21, 0, -48], facing: -Math.PI / 2, firstStep: 'orbs',
    orbLabel: 'Follow the alpha pings', orbs: [[-25, -32], [-24, -47], [2, -48]],
    objectiveTalk: 'Find Brandon — he is hiding down the back alley',
    reminder: 'Bro, my 3 phones are all pinging. Grab the alpha pings around the market first!',
    pumpTo: 0.02,
    lines: [
      { who: 'BRANDON', text: '*vapes* ...you found Shitoshi\'s laptop? Nah. NAH.', color: '#ef4444' },
      J('FAPCOIN is sitting at one cent. Rugpull put a 30% tax on it.'),
      { who: 'BRANDON', text: 'I scan every launch on three phones, bro. I KNEW something was off with this one.', color: '#ef4444' },
      { who: 'BRANDON', text: 'Alpha scanner reporting for duty. Wings are on me.', color: '#ef4444' },
    ],
  },
  {
    npc: 'pol', district: 2, npcPos: [121, 0, 58], facing: -Math.PI / 2, firstStep: 'orbs',
    orbLabel: 'Follow the live-stream likes', orbs: [[85, 36], [86, 57], [105, 58]],
    objectiveTalk: 'Find Pol — she is streaming from a back lot south of the street',
    reminder: 'Darling, I am LIVE on two phones. Gather those likes first, then we talk.',
    pumpTo: 0.035,
    lines: [
      { who: 'POL', text: 'Darling. You look like a man with a rugged bag and a dream.', color: '#f472b6' },
      J('I need a whale. And an influencer. I heard you\'re both.'),
      { who: 'POL', text: 'Merged, sweetheart. Two phones, one livestream, zero patience for taxes.', color: '#f472b6' },
      { who: 'POL', text: 'Tell your little coin: auntie is coming to shill.', color: '#f472b6' },
    ],
  },
  {
    npc: 'robofap', district: 2, npcPos: [109, 0, -68], facing: Math.PI / 2, firstStep: 'orbs',
    orbLabel: 'Follow the data chips', orbs: [[135, -40], [134, -67], [120, -68]],
    objectiveTalk: 'Find Robofap — deep in the north blocks',
    reminder: '> loading... need 3 data chips. Scan the street.',
    pumpTo: 0.04,
    lines: [
      { who: 'ROBOFAP', text: '> loading...', color: '#22d3ee' },
      { who: 'ROBOFAP', text: '> master Shitoshi last pinged me 400 days ago.', color: '#22d3ee' },
      J('He left you his laptop. And a note. Fix the coin.'),
      { who: 'ROBOFAP', text: '> directive accepted. my eye is glowing. that means yes.', color: '#22d3ee' },
    ],
  },
  {
    npc: 'paperhands', district: 3, npcPos: [201, 0, 68], facing: -Math.PI / 2, firstStep: 'orbs',
    orbLabel: 'Follow the spilled paper', orbs: [[165, 40], [166, 67], [185, 68]],
    objectiveTalk: 'Find Paper Hands — he ran deep into Toilet Alley',
    reminder: 'AAAH! Everything fell! Please pick up my papers, I can\'t, my hands, they\'re shaking!',
    pumpTo: 0.045,
    lines: [
      { who: 'PAPER HANDS', text: 'IS IT DUMPING?! IS IT DUMPING?! SELL! SELL EVERYTHING!', color: '#e5e7eb' },
      J('Relax. It\'s one cent. It can\'t dump any harder.'),
      { who: 'PAPER HANDS', text: '...oh. That\'s... actually true. Huh.', color: '#e5e7eb' },
      { who: 'PAPER HANDS', text: 'Fine. I\'ll ride your sidecar. But if it goes red I\'m screaming.', color: '#e5e7eb' },
    ],
  },
  {
    npc: 'meast', district: 3, npcPos: [199, 0, -58], facing: Math.PI / 2, firstStep: 'orbs',
    orbLabel: 'Follow the gym weights', orbs: [[235, -34], [234, -57], [215, -58]],
    objectiveTalk: 'Find Meast — his gym is down a north side street',
    reminder: 'Weights are scattered. Pick them up. Do not make Meast ask twice.',
    pumpTo: 0.05,
    lines: [
      { who: 'MEAST', text: '*bench presses a danfo bus* ...who disturbs the gym?', color: '#f59e0b' },
      J('Rugpull is holding 200 OG holders in cages under his pub.'),
      { who: 'MEAST', text: 'Cages? Bars? ...Those are just resistance bands with ambition.', color: '#f59e0b' },
      { who: 'MEAST', text: 'I don\'t shake. I MEAST.', color: '#f59e0b' },
    ],
  },
  {
    npc: 'tek', district: 3, npcPos: [236, 0, 9.5], facing: Math.PI, firstStep: 'infiltrate',
    orbLabel: 'Infiltrate the AI Call Center', orbs: [],
    objectiveTalk: 'Talk to Tek in the Hackspace',
    reminder: 'They cloned my voice at that call center. Get in there, hack it. Nobody gets hurt.',
    pumpTo: 0.06,
    lines: [
      { who: 'TEK', text: 'You cleared the call center without touching a single worker? Respect.', color: '#39ff88' },
      { who: 'TEK', text: 'They gave us the stereotype. I\'m coding the patch.', color: '#39ff88' },
      J('Then code it. We take FAPCOIN to $1000.'),
      { who: 'TEK', text: "I'll shill to the Coynzy community, we need solid holders at this level", color: '#39ff88' },
      { who: 'TEK', text: 'Compiling... let\'s fix this thing. Properly.', color: '#39ff88' },
    ],
  },
];

export const CALL_CENTER = { x: 240, z: -9 };
export const LAPTOP_POS: [number, number, number] = [0, 0, -3];
