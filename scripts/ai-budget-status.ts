import { ensureMonthlyBudget, getMonthlySpend } from "./_lib/ai-budget"

async function main() {
  await ensureMonthlyBudget()
  const s = await getMonthlySpend()
  console.log(
    JSON.stringify(
      {
        month: s.month,
        limitKrw: s.limitKrw,
        spentKrw: s.spentKrw,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        tokenCapMonthly: Number(process.env.AI_TOKEN_BUDGET_MONTHLY ?? 0) || undefined,
        costRatesKrwPer1M: {
          input: Number(process.env.AI_COST_INPUT_KRW_PER_1M ?? 0) || 0,
          output: Number(process.env.AI_COST_OUTPUT_KRW_PER_1M ?? 0) || 0,
        },
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

