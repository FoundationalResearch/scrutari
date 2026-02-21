import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, render } from 'ink';
import TextInput from 'ink-text-input';
import type { SkillDefinition } from './writer.js';
import { generateSkillYaml, writeSkillFile } from './writer.js';

type WizardStep = 'name' | 'description' | 'inputs' | 'stages' | 'output' | 'confirm';

interface InputDef {
  name: string;
  type: 'string' | 'string[]' | 'number' | 'boolean';
  required: boolean;
  description?: string;
}

interface StageDef {
  name: string;
  model?: string;
  prompt: string;
  tools?: string[];
  input_from?: string[];
}

function SkillWizard(): React.ReactElement {
  const [step, setStep] = useState<WizardStep>('name');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inputs, setInputs] = useState<InputDef[]>([]);
  const [stages, setStages] = useState<StageDef[]>([]);
  const [outputPrimary, setOutputPrimary] = useState('');

  // Sub-step fields
  const [inputName, setInputName] = useState('');
  const [inputType, setInputType] = useState('');
  const [inputRequired, setInputRequired] = useState('');
  const [, setInputDesc] = useState('');
  const [inputSubStep, setInputSubStep] = useState<'name' | 'type' | 'required' | 'desc' | 'add-more'>('name');

  const [stageName, setStageName] = useState('');
  const [stageModel, setStageModel] = useState('');
  const [stagePrompt, setStagePrompt] = useState('');
  const [stageTools, setStageTools] = useState('');
  const [, setStageInputFrom] = useState('');
  const [stageSubStep, setStageSubStep] = useState<'name' | 'model' | 'prompt' | 'tools' | 'input_from' | 'add-more'>('name');

  const [done, setDone] = useState(false);
  const [writtenPath, setWrittenPath] = useState('');
  const [error, setError] = useState('');

  const buildDefinition = useCallback((): SkillDefinition => {
    const primary = outputPrimary || (stages.length > 0 ? stages[stages.length - 1].name : 'output');
    return {
      name,
      description,
      inputs: inputs.length > 0 ? inputs : undefined,
      stages: stages.map(s => ({
        name: s.name,
        model: s.model || undefined,
        prompt: s.prompt,
        tools: s.tools && s.tools.length > 0 ? s.tools : undefined,
        input_from: s.input_from && s.input_from.length > 0 ? s.input_from : undefined,
      })),
      output: { primary },
    };
  }, [name, description, inputs, stages, outputPrimary]);

  const handleConfirm = useCallback(() => {
    try {
      const def = buildDefinition();
      const path = writeSkillFile(def);
      setWrittenPath(path);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [buildDefinition]);

  // Handle input submission for each sub-step
  const handleInputSubmit = useCallback((value: string) => {
    if (inputSubStep === 'name') {
      setInputName(value);
      setInputSubStep('type');
    } else if (inputSubStep === 'type') {
      setInputType(value || 'string');
      setInputSubStep('required');
    } else if (inputSubStep === 'required') {
      setInputRequired(value);
      setInputSubStep('desc');
    } else if (inputSubStep === 'desc') {
      setInputDesc(value);
      setInputs(prev => [...prev, {
        name: inputName,
        type: (inputType || 'string') as InputDef['type'],
        required: inputRequired.toLowerCase() === 'y' || inputRequired.toLowerCase() === 'yes',
        description: value || undefined,
      }]);
      setInputName('');
      setInputType('');
      setInputRequired('');
      setInputDesc('');
      setInputSubStep('add-more');
    }
  }, [inputSubStep, inputName, inputType, inputRequired]);

  const handleStageSubmit = useCallback((value: string) => {
    if (stageSubStep === 'name') {
      setStageName(value);
      setStageSubStep('model');
    } else if (stageSubStep === 'model') {
      setStageModel(value);
      setStageSubStep('prompt');
    } else if (stageSubStep === 'prompt') {
      setStagePrompt(value);
      setStageSubStep('tools');
    } else if (stageSubStep === 'tools') {
      setStageTools(value);
      setStageSubStep('input_from');
    } else if (stageSubStep === 'input_from') {
      setStageInputFrom(value);
      const tools = stageTools ? stageTools.split(',').map(t => t.trim()).filter(Boolean) : undefined;
      const inputFrom = value ? value.split(',').map(t => t.trim()).filter(Boolean) : undefined;
      setStages(prev => [...prev, {
        name: stageName,
        model: stageModel || undefined,
        prompt: stagePrompt,
        tools,
        input_from: inputFrom,
      }]);
      setStageName('');
      setStageModel('');
      setStagePrompt('');
      setStageTools('');
      setStageInputFrom('');
      setStageSubStep('add-more');
    }
  }, [stageSubStep, stageName, stageModel, stagePrompt, stageTools]);

  useInput((input) => {
    if (inputSubStep === 'add-more') {
      if (input === 'y' || input === 'Y') {
        setInputSubStep('name');
      } else {
        setStep('stages');
      }
      return;
    }
    if (stageSubStep === 'add-more') {
      if (input === 'y' || input === 'Y') {
        setStageSubStep('name');
      } else {
        setStep('output');
      }
      return;
    }
  });

  if (done) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="green" bold>Skill created successfully!</Text>
        <Text>Written to: {writtenPath}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red" bold>Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="blue" bold>Skill Creation Wizard</Text>
      <Text dimColor>Step: {step}</Text>
      <Box marginTop={1} flexDirection="column">
        {step === 'name' && (
          <PromptLine label="Skill name" onSubmit={(v) => { setName(v); setStep('description'); }} />
        )}
        {step === 'description' && (
          <PromptLine label="Description" onSubmit={(v) => { setDescription(v); setStep('inputs'); setInputSubStep('name'); }} />
        )}
        {step === 'inputs' && renderInputStep(inputSubStep, inputs, handleInputSubmit)}
        {step === 'stages' && renderStageStep(stageSubStep, stages, handleStageSubmit)}
        {step === 'output' && (
          <PromptLine
            label={`Primary output stage (default: ${stages.length > 0 ? stages[stages.length - 1].name : 'last'})`}
            onSubmit={(v) => { setOutputPrimary(v); setStep('confirm'); }}
          />
        )}
        {step === 'confirm' && (
          <Box flexDirection="column">
            <Text bold>Preview:</Text>
            <Text dimColor>{generateSkillYaml(buildDefinition())}</Text>
            <Text bold>Write this skill? (y/n)</Text>
            <ConfirmInput onYes={handleConfirm} onNo={() => setStep('name')} />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function renderInputStep(
  subStep: string,
  inputs: InputDef[],
  onSubmit: (value: string) => void,
): React.ReactElement {
  if (subStep === 'add-more') {
    return (
      <Box flexDirection="column">
        <Text>Inputs so far: {inputs.map(i => i.name).join(', ') || '(none)'}</Text>
        <Text bold>Add another input? (y/n)</Text>
      </Box>
    );
  }
  const labels: Record<string, string> = {
    name: 'Input name',
    type: 'Type (string, string[], number, boolean)',
    required: 'Required? (y/n)',
    desc: 'Description (optional)',
  };
  return <PromptLine label={labels[subStep] ?? subStep} onSubmit={onSubmit} />;
}

function renderStageStep(
  subStep: string,
  stages: StageDef[],
  onSubmit: (value: string) => void,
): React.ReactElement {
  if (subStep === 'add-more') {
    return (
      <Box flexDirection="column">
        <Text>Stages so far: {stages.map(s => s.name).join(', ') || '(none)'}</Text>
        <Text bold>Add another stage? (y/n)</Text>
      </Box>
    );
  }
  const labels: Record<string, string> = {
    name: 'Stage name',
    model: 'Model (optional, e.g., claude-haiku-3-5-20241022)',
    prompt: 'Prompt template',
    tools: 'Tools (comma-separated, optional)',
    input_from: 'Input from stages (comma-separated, optional)',
  };
  return <PromptLine label={labels[subStep] ?? subStep} onSubmit={onSubmit} />;
}

function PromptLine({ label, onSubmit }: { label: string; onSubmit: (value: string) => void }): React.ReactElement {
  const [value, setValue] = useState('');
  return (
    <Box>
      <Text bold>{label}: </Text>
      <TextInput value={value} onChange={setValue} onSubmit={() => { onSubmit(value); setValue(''); }} />
    </Box>
  );
}

function ConfirmInput({ onYes, onNo }: { onYes: () => void; onNo: () => void }): React.ReactElement {
  useInput((input) => {
    if (input === 'y' || input === 'Y') onYes();
    else if (input === 'n' || input === 'N') onNo();
  });
  return <Text dimColor>(press y or n)</Text>;
}

export async function runSkillWizard(): Promise<void> {
  const { waitUntilExit } = render(React.createElement(SkillWizard));
  await waitUntilExit();
}
