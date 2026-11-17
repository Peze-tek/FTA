'use client';
import dynamic from 'next/dynamic';

// WebGL + window APIs: client only.
const GameRoot = dynamic(() => import('@/components/GameRoot'), { ssr: false });

export default function Page() {
  return <GameRoot />;
}
