import { z } from 'zod';

export const InputSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'string[]', 'number', 'boolean']),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  description: z.string().optional(),
}).strict();

export const StageSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  tools: z.array(z.string()).optional(),
  prompt: z.string().optional(),
  sub_pipeline: z.string().optional(),
  sub_inputs: z.record(z.string(), z.string()).optional(),
  output_format: z.enum(['json', 'markdown', 'text']).optional(),
  max_tokens: z.number().int().positive().optional(),
  input_from: z.array(z.string()).optional(),
  agent_type: z.enum(['research', 'explore', 'verify', 'default']).optional(),
}).strict().superRefine((stage, ctx) => {
  // Must have exactly one of prompt OR sub_pipeline
  if (!stage.sub_pipeline && !stage.prompt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Stage "${stage.name}" must have either prompt or sub_pipeline`,
    });
  }
  if (stage.sub_pipeline && stage.prompt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Stage "${stage.name}" cannot have both prompt and sub_pipeline`,
    });
  }
  // sub_pipeline stages shouldn't set model/tools
  if (stage.sub_pipeline && stage.model) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Stage "${stage.name}": sub_pipeline stages should not set model`,
    });
  }
  if (stage.sub_pipeline && stage.tools) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Stage "${stage.name}": sub_pipeline stages should not set tools`,
    });
  }
});

export const SkillOutputSchema = z.object({
  primary: z.string(),
  format: z.enum(['markdown', 'json', 'docx']).optional(),
  save_intermediate: z.boolean().optional(),
  filename_template: z.string().optional(),
}).strict();

export const ToolsConfigSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown()),
).optional();

export const SkillSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  description: z.string(),
  author: z.string().optional(),
  inputs: z.array(InputSchema).optional(),
  tools_required: z.array(z.string()).optional(),
  tools_optional: z.array(z.string()).optional(),
  tools_config: ToolsConfigSchema,
  stages: z.array(StageSchema).min(1),
  output: SkillOutputSchema,
}).strict().superRefine((skill, ctx) => {
  const stageNames = skill.stages.map(s => s.name);

  // 1. Stage names must be unique
  const seen = new Set<string>();
  for (const name of stageNames) {
    if (seen.has(name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate stage name: "${name}"`,
        path: ['stages'],
      });
    }
    seen.add(name);
  }

  // 2. output.primary must reference an existing stage
  if (!stageNames.includes(skill.output.primary)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `output.primary "${skill.output.primary}" does not reference an existing stage`,
      path: ['output', 'primary'],
    });
  }

  // 3. input_from entries must reference existing stages
  for (let i = 0; i < skill.stages.length; i++) {
    const stage = skill.stages[i];
    if (stage.input_from) {
      for (const ref of stage.input_from) {
        if (!stageNames.includes(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Stage "${stage.name}" input_from references unknown stage "${ref}"`,
            path: ['stages', i, 'input_from'],
          });
        }
      }
    }
  }

  // 4. Stage tools must be subset of tools_required ∪ tools_optional
  const declaredTools = new Set([
    ...(skill.tools_required ?? []),
    ...(skill.tools_optional ?? []),
  ]);
  const hasToolDeclarations = (skill.tools_required?.length ?? 0) > 0 || (skill.tools_optional?.length ?? 0) > 0;

  if (hasToolDeclarations) {
    for (let i = 0; i < skill.stages.length; i++) {
      const stage = skill.stages[i];
      if (stage.tools) {
        for (const tool of stage.tools) {
          if (!declaredTools.has(tool)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Stage "${stage.name}" uses undeclared tool "${tool}"`,
              path: ['stages', i, 'tools'],
            });
          }
        }
      }
    }
  }

  // 5. tools_config keys must reference declared tools (when tool declarations exist)
  if (skill.tools_config && hasToolDeclarations) {
    for (const configKey of Object.keys(skill.tools_config)) {
      if (!declaredTools.has(configKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `tools_config references undeclared tool "${configKey}"`,
          path: ['tools_config', configKey],
        });
      }
    }
  }

  // 6. Input default values must match declared type
  if (skill.inputs) {
    for (let i = 0; i < skill.inputs.length; i++) {
      const input = skill.inputs[i];
      if (input.default !== undefined) {
        const valid = isDefaultMatchingType(input.default, input.type);
        if (!valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Input "${input.name}" default value does not match type "${input.type}"`,
            path: ['inputs', i, 'default'],
          });
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Agent Skill Frontmatter Schema (SKILL.md)
// ---------------------------------------------------------------------------

export const AgentSkillFrontmatterSchema = z.object({
  name: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/, 'Name must be lowercase letters, digits, and hyphens, starting with a letter'),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  'allowed-tools': z.string().optional(),
});

function isDefaultMatchingType(
  value: string | number | boolean | string[],
  type: string,
): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'string[]':
      return Array.isArray(value) && value.every(v => typeof v === 'string');
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
}
