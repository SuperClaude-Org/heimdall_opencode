import { z } from "zod"

export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().default(0),
  pattern: z.string().optional(),
  action: z.enum(["allow", "deny", "warn"]),
  metadata: z.record(z.any()).optional(),
})

export const RulesConfig = z.object({
  enabled: z.boolean().default(true),
  rulesFile: z.string().optional(),
  rules: z.array(RuleSchema).default([]),
})

export type Rule = z.infer<typeof RuleSchema>
export type RulesConfigType = z.infer<typeof RulesConfig>