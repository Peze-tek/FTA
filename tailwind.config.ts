import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { fap: '#39ff88', rug: '#ff2d55', neon: '#22d3ee', pink: '#ff4fd8' },
      fontFamily: { game: ['"Arial Black"', 'Impact', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
