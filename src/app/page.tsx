'use client';

import dynamic from 'next/dynamic';

// The 3D experience relies on WebGL & DOM APIs — load it client-side only.
const PortfolioExperience = dynamic(
  () => import('@/components/portfolio/PortfolioExperience'),
  {
    ssr: false,
    loading: () => (
      <div id="loader-wrapper">
        <div className="loader" />
      </div>
    ),
  }
);

export default function Home() {
  return <PortfolioExperience />;
}
