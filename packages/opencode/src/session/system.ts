import { App } from "../app/app"
import { Ripgrep } from "../file/ripgrep"
import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { Config } from "../config/config"
import { Rule } from "../rules/types"
import path from "path"
import os from "os"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_ANTHROPIC_WITHOUT_TODO from "./prompt/qwen.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_ANTHROPIC_SPOOF from "./prompt/anthropic_spoof.txt"
import PROMPT_SUMMARIZE from "./prompt/summarize.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import PROMPT_COPILOT_GPT_5 from "./prompt/copilot-gpt-5.txt"

export namespace SystemPrompt {
  export function header(providerID: string) {
    if (providerID.includes("anthropic")) return [PROMPT_ANTHROPIC_SPOOF.trim()]
    return []
  }

  export function provider(modelID: string) {
    if (modelID.includes("gpt-5")) return [PROMPT_COPILOT_GPT_5]
    if (modelID.includes("gpt-") || modelID.includes("o1") || modelID.includes("o3")) return [PROMPT_BEAST]
    if (modelID.includes("gemini-")) return [PROMPT_GEMINI]
    if (modelID.includes("claude")) return [PROMPT_ANTHROPIC]
    return [PROMPT_ANTHROPIC_WITHOUT_TODO]
  }

  export async function environment() {
    const app = App.info()
    return [
      [
        `Here is some useful information about the environment you are running in:`,
        `<env>`,
        `  Working directory: ${app.path.cwd}`,
        `  Is directory a git repo: ${app.git ? "yes" : "no"}`,
        `  Platform: ${process.platform}`,
        `  Today's date: ${new Date().toDateString()}`,
        `</env>`,
        `<project>`,
        `  ${
          app.git
            ? await Ripgrep.tree({
                cwd: app.path.cwd,
                limit: 200,
              })
            : ""
        }`,
        `</project>`,
      ].join("\n"),
    ]
  }

  const LOCAL_RULE_FILES = [
    "AGENTS.md",
    "CLAUDE.md",
    "CONTEXT.md", // deprecated
  ]
  const GLOBAL_RULE_FILES = [
    path.join(Global.Path.config, "AGENTS.md"),
    path.join(os.homedir(), ".claude", "CLAUDE.md"),
  ]
  function getDefaultRules(): Rule[] {
    return [
      {
        id: "agents-local",
        name: "Local Agent Instructions",
        pattern: "AGENTS.md",
        action: "allow" as const,
        priority: 100,
        enabled: true,
        metadata: { type: "local" as const, weight: 10, includeHeader: true }
      },
      {
        id: "claude-local", 
        name: "Local Claude Instructions",
        pattern: "CLAUDE.md",
        action: "allow" as const,
        priority: 90,
        enabled: true,
        metadata: { type: "local" as const, weight: 8, includeHeader: true }
      },
      {
        id: "context-local",
        name: "Local Context Instructions", 
        pattern: "CONTEXT.md",
        action: "allow" as const,
        priority: 80,
        enabled: true,
        metadata: { type: "local" as const, weight: 6, includeHeader: true }
      },
      {
        id: "agents-global",
        name: "Global Agent Instructions",
        pattern: path.join(Global.Path.config, "AGENTS.md"),
        action: "allow" as const,
        priority: 70,
        enabled: true,
        metadata: { type: "global" as const, weight: 5, includeHeader: true }
      },
      {
        id: "claude-global",
        name: "Global Claude Instructions",
        pattern: path.join(os.homedir(), ".claude", "CLAUDE.md"),
        action: "allow" as const,
        priority: 60,
        enabled: true,
        metadata: { type: "global" as const, weight: 4, includeHeader: true }
      }
    ]
  }

  async function processInstructionRules(rules: Rule[], cwd: string, root: string) {
    const results: Array<{ path: string, rule: Rule, content: string }> = []
    
    for (const rule of rules.filter(r => r.enabled && r.action === "allow").sort((a, b) => b.priority - a.priority)) {
      let matches: string[] = []
      
      if (rule.metadata?.type === "global" || path.isAbsolute(rule.pattern)) {
        // Global or absolute path
        if (await Bun.file(rule.pattern).exists()) {
          matches = [rule.pattern]
        }
      } else if (rule.metadata?.type === "glob" || rule.pattern.includes("*")) {
        // Glob pattern
        if (rule.pattern.startsWith("~/")) {
          const expandedPattern = path.join(os.homedir(), rule.pattern.slice(2))
          matches = await Array.fromAsync(
            new Bun.Glob(path.basename(expandedPattern)).scan({
              cwd: path.dirname(expandedPattern),
              absolute: true,
              onlyFiles: true,
            }),
          ).catch(() => [])
        } else {
          matches = await Filesystem.globUp(rule.pattern, cwd, root).catch(() => [])
        }
      } else {
        // Local file search
        const found = await Filesystem.findUp(rule.pattern, cwd, root)
        if (found.length > 0) {
          matches = [found[0]] // Take first match for local files
        }
      }
      
      for (const filePath of matches) {
        try {
          const content = await Bun.file(filePath).text()
          if (content.trim()) {
            results.push({ path: filePath, rule, content })
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }
    
    return results
  }

  export async function custom() {
    const { cwd, root } = App.info().path
    const config = await Config.get()
    
    // Use rules config if enabled, otherwise use default behavior
    if (config.rules?.enabled && config.rules.rules.length > 0) {
      const files = await processInstructionRules(config.rules.rules, cwd, root)
      
      return files.map(({path: filePath, rule, content}) => {
        if (rule.metadata?.includeHeader !== false) {
          const weight = rule.metadata?.weight || 1
          const header = `<!-- File: ${path.basename(filePath)} | Priority: ${rule.priority} | Weight: ${weight} -->`
          return `${header}
${content}`
        }
        return content
      })
    }
    
    // Fallback to enhanced default behavior with rules structure
    const defaultRules = getDefaultRules()
    const files = await processInstructionRules(defaultRules, cwd, root)
    
    // Process legacy config.instructions if present
    const legacyPaths = new Set<string>()
    if (config.instructions) {
      for (let instruction of config.instructions) {
        if (instruction.startsWith("~/")) {
          instruction = path.join(os.homedir(), instruction.slice(2))
        }
        let matches: string[] = []
        if (path.isAbsolute(instruction)) {
          matches = await Array.fromAsync(
            new Bun.Glob(path.basename(instruction)).scan({
              cwd: path.dirname(instruction),
              absolute: true,
              onlyFiles: true,
            }),
          ).catch(() => [])
        } else {
          matches = await Filesystem.globUp(instruction, cwd, root).catch(() => [])
        }
        matches.forEach((path) => legacyPaths.add(path))
      }
    }
    
    // Combine rule-based files with legacy instructions
    const allContent = [
      ...files.map(({path: filePath, rule, content}) => {
        const weight = rule.metadata?.weight || 1
        const header = `<!-- File: ${path.basename(filePath)} | Priority: ${rule.priority} | Weight: ${weight} -->`
        return `${header}
${content}`
      }),
      ...await Promise.all(Array.from(legacyPaths).map(p => 
        Bun.file(p).text().catch(() => "")
      )).then(result => result.filter(Boolean))
    ]
    
    return allContent
  }

  export function summarize(providerID: string) {
    switch (providerID) {
      case "anthropic":
        return [PROMPT_ANTHROPIC_SPOOF.trim(), PROMPT_SUMMARIZE]
      default:
        return [PROMPT_SUMMARIZE]
    }
  }

  export function title(providerID: string) {
    switch (providerID) {
      case "anthropic":
        return [PROMPT_ANTHROPIC_SPOOF.trim(), PROMPT_TITLE]
      default:
        return [PROMPT_TITLE]
    }
  }
}
