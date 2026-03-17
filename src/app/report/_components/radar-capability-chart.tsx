"use client"

import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { CapabilityScores } from "../_lib/chart-data"
import { cn } from "@/lib/utils"

type Props = {
  company: CapabilityScores
  industryAverage: CapabilityScores
  className?: string
}

const AXIS_ORDER: (keyof CapabilityScores)[] = [
  "수익성",
  "성장성",
  "안정성",
  "현금흐름",
  "시장점유율",
]

export function RadarCapabilityChart({ company, industryAverage, className }: Props) {
  const data = AXIS_ORDER.map((key) => ({
    subject: key,
    본기업: company[key],
    업계평균: industryAverage[key],
    fullMark: 100,
  }))

  return (
    <div className={cn("h-[280px] w-full", className)}>
      <p className="mb-2 text-xs text-slate-400">
        종합 평가 (0~100, 업계 평균 대비)
      </p>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid
            stroke="rgb(100 116 139 / 0.3)"
            strokeWidth={0.5}
          />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "rgb(148 163 184)", fontSize: 11 }}
            tickLine={{ stroke: "rgb(71 85 105 / 0.5)" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "rgb(148 163 184)", fontSize: 10 }}
            tickLine={{ stroke: "rgb(71 85 105 / 0.5)" }}
          />
          <Radar
            name="본 기업"
            dataKey="본기업"
            stroke="rgb(34 211 238)"
            fill="rgb(34 211 238 / 0.25)"
            fillOpacity={1}
            strokeWidth={1.5}
          />
          <Radar
            name="업계 평균"
            dataKey="업계평균"
            stroke="rgb(139 92 246 / 0.9)"
            fill="rgb(139 92 246 / 0.12)"
            fillOpacity={1}
            strokeWidth={1}
            strokeDasharray="4 2"
          />
          <Legend
            wrapperStyle={{ fontSize: "11px" }}
            formatter={(value) => (
              <span className="text-slate-400">{value}</span>
            )}
            iconType="circle"
            iconSize={8}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  )
}
