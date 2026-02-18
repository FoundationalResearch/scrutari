import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { AnalysisProps } from './types.js';

export type { AnalysisProps, StageState, AnalysisState } from './types.js';
export { runHeadless } from './headless.js';

export async function renderAnalysis(props: AnalysisProps): Promise<void> {
  const { waitUntilExit } = render(
    React.createElement(App, {
      view: 'analysis',
      analysisProps: props,
    }),
  );
  await waitUntilExit();
}
