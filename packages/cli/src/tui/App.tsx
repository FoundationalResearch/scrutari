import React from 'react';
import { AnalysisView } from './views/AnalysisView.js';
import type { AnalysisProps } from './types.js';

interface AppProps {
  view: 'analysis';
  analysisProps: AnalysisProps;
}

export function App({ view, analysisProps }: AppProps): React.ReactElement {
  switch (view) {
    case 'analysis':
      return <AnalysisView {...analysisProps} />;
  }
}
