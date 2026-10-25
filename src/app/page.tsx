'use client';

import dynamic from 'next/dynamic';

// The 3D experience relies on WebGL & DOM APIs — load it client-side only.
const PortfolioExperience = dynamic(
  () => import('@/components/portfolio/PortfolioExperience'),
  {
    ssr: false,
    loading: () => (
      <div
        id="loader-wrapper"
        role="status"
        aria-live="polite"
        aria-label="Loading 3D portfolio"
      >
        <div className="loader" aria-hidden="true" />
      </div>
    ),
  }
);

export default function Home() {
  return <PortfolioExperience />;
}
