import { z } from "zod"

export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().default(0), // Higher = loaded first
  pattern: z.string(), // File pattern: "AGENTS.md", "**/*.md", "~/.claude/*.md"
  action: z.enum(["allow", "deny", "warn"]), // allow=load, deny=skip, warn=load with warning
  metadata: z.object({
    type: z.enum(["local", "global", "absolute", "glob"]).optional(),
    weight: z.number().default(1).optional(), // Importance weight for AI
    includeHeader: z.boolean().default(true).optional(), // Add file header
  }).optional(),
})

export const RulesConfig = z.object({
  enabled: z.boolean().default(true),
  rulesFile: z.string().optional(),
  rules: z.array(RuleSchema).default([]),
})

export type Rule = z.infer<typeof RuleSchema>
export type RulesConfigType = z.infer<typeof RulesConfig>