'use client';

import { useParams } from 'next/navigation';
import SwSafetyAnalysisComponent from '../components/SwSafetyAnalysisComponent';

export default function SwSafetyAnalysisPage() {
  const params = useParams();
  const swComponentUuid = params.uuid as string;

  if (!swComponentUuid) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Invalid Component UUID</h2>
        <p>Please provide a valid SW Component UUID</p>
      </div>
    );
  }

  return <SwSafetyAnalysisComponent swComponentUuid={swComponentUuid} />;
}
