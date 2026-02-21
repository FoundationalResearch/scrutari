import { z } from 'zod';

export const RuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  match: z.object({
    ticker: z.string().optional(),
    sector: z.string().optional(),
    topic: z.string().optional(),
  }).optional(),
  instruction: z.string().min(1),
  priority: z.number().int().min(0).max(100).default(50),
});

export const PersonaSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  system_prompt: z.string().min(1),
  analysis_depth: z.enum(['quick', 'standard', 'deep', 'exhaustive']).optional(),
  output_format: z.enum(['markdown', 'json', 'docx']).optional(),
  default_skill: z.string().optional(),
  risk_framing: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  tone: z.string().optional(),
});
