import type { IssueMoveItem } from "@/app/_lib/company-api"

export type IssueScoreWeights = {
  baseline: number
  balanceMultiplier: number
  confidenceMultiplier: number
  confidenceSampleCap: number
}

// 운영 중 점수 체계를 손쉽게 조정하기 위한 기본 가중치.
export const ISSUE_SCORE_WEIGHTS: IssueScoreWeights = {
  baseline: 50,
  balanceMultiplier: 30,
  confidenceMultiplier: 20,
  confidenceSampleCap: 20,
}

export type IssueScoreResult = {
  score: number | null
  scoreLabel: string
  barWidth: number
  total: number
  surge: number
  drop: number
  surgeRate: number
  dropRate: number
}

export function calculateIssueScore(
  moves: IssueMoveItem[] | undefined,
  weights: IssueScoreWeights = ISSUE_SCORE_WEIGHTS,
): IssueScoreResult {
  const rows = moves ?? []
  if (!rows.length) {
    return {
      score: null,
      scoreLabel: "–",
      barWidth: 0,
      total: 0,
      surge: 0,
      drop: 0,
      surgeRate: 0,
      dropRate: 0,
    }
  }

  const surge = rows.filter((m) => m.moveType === "SURGE" || m.moveType === "BOTH").length
  const drop = rows.filter((m) => m.moveType === "DROP" || m.moveType === "BOTH").length
  const total = rows.length
  const balance = total > 0 ? (surge - drop) / total : 0
  const confidence = Math.min(1, total / weights.confidenceSampleCap)

  const rawScore =
    weights.baseline +
    balance * weights.balanceMultiplier +
    confidence * weights.confidenceMultiplier
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))
  const surgeRate = (surge / total) * 100
  const dropRate = (drop / total) * 100

  return {
    score,
    scoreLabel: String(score),
    barWidth: score,
    total,
    surge,
    drop,
    surgeRate,
    dropRate,
  }
}

