import { z } from 'zod';
import { HOOK_EVENTS } from './types.js';

export const HookDefinitionSchema = z.object({
  command: z.string().min(1),
  description: z.string().optional(),
  stage: z.string().optional(),
  tool: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
  background: z.boolean().optional(),
}).strict();

const hookEventEnum = z.enum(HOOK_EVENTS as unknown as [string, ...string[]]);

export const HooksFileSchema = z.object({
  hooks: z.record(hookEventEnum, z.array(HookDefinitionSchema)).optional().default({}),
}).strict();

export type HooksFileData = z.infer<typeof HooksFileSchema>;
