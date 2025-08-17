import { cmd } from "./cmd"
// import { UI } from "../ui" // Unused import
import { Config } from "../../config/config"
import { App } from "../../app/app"

const RulesListCommand = cmd({
  command: "list",
  describe: "list all instruction rules",
  async handler() {
    await App.provide({ cwd: process.cwd() }, async () => {
      const config = await Config.get()
      const rules = config.rules?.rules || []
      
      if (rules.length === 0) {
        console.log("No rules configured")
        return
      }
      
      console.log("Rules:")
      for (const rule of rules) {
        const status = rule.enabled ? "✓" : "✗"
        console.log(`  ${status} ${rule.id}: ${rule.name} (${rule.action})`)
        if (rule.description) {
          console.log(`    ${rule.description}`)
        }
      }
    })
  },
})

const RulesStatusCommand = cmd({
  command: "status",
  describe: "show instruction rules system status",
  async handler() {
    await App.provide({ cwd: process.cwd() }, async () => {
      const config = await Config.get()
      const rulesConfig = config.rules
      
      if (!rulesConfig) {
        console.log("Rules system: Not configured")
        return
      }
      
      console.log(`Rules system: ${rulesConfig.enabled ? "Enabled" : "Disabled"}`)
      console.log(`Rules count: ${rulesConfig.rules?.length || 0}`)
      if (rulesConfig.rulesFile) {
        console.log(`Rules file: ${rulesConfig.rulesFile}`)
      }
    })
  },
})

export const RulesCommand = cmd({
  command: "rules",
  describe: "manage AI instruction rules",
  builder: (yargs) =>
    yargs
      .command(RulesListCommand)
      .command(RulesStatusCommand)
      .demandCommand(1, "You need to specify a subcommand")
      .help(),
  handler: () => {
    // Default handler - yargs will show help
  },
})