from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Literal, Optional
from pathlib import Path
import yfinance as yf
import pandas as pd


class PriceCandle(BaseModel):
  date: str
  open: float
  high: float
  low: float
  close: float
  volume: float


class MovingAveragePoint(BaseModel):
  date: str
  ma20: Optional[float]
  ma60: Optional[float]
  ma120: Optional[float]


class AccumulationZone(BaseModel):
  date: str
  close: float
  turnover: float
  volume_ratio: float


class OperatorRange(BaseModel):
  lower: Optional[float]
  upper: Optional[float]


class AccumulationStrength(BaseModel):
  score: int
  recent_days: int
  zones_count: int
  total_turnover: float


class VolumeByPriceBucket(BaseModel):
  price: float
  volume: float


class RiskMetrics(BaseModel):
  max_drawdown_pct: float
  avg_daily_volatility_pct: float


class AnalyzeRawResponse(BaseModel):
  symbol: str
  market: Literal["KR", "US"]
  price_series: List[PriceCandle]
  moving_averages: List[MovingAveragePoint]
  accumulation_zones: List[AccumulationZone]
  operator_range: OperatorRange
  accumulation_strength: AccumulationStrength
  volume_by_price: List[VolumeByPriceBucket]
  risk: RiskMetrics
  current_price: float
  current_date: str


app = FastAPI(title="Stock Analyze Backend", version="0.1.0")

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.get("/health")
def health():
  return {"status": "ok"}


def normalize_symbol(symbol: str, market: str) -> str:
  """간단한 심볼 정규화 (초기 버전: 한국은 .KS 붙이기 등)."""
  s = symbol.strip().upper()
  if market == "KR":
    # 이미 .KS, .KQ가 붙어있으면 그대로 사용
    if s.endswith(".KS") or s.endswith(".KQ"):
      return s
    # 숫자 6자리면 코스피 기본 .KS 가정
    if s.isdigit() and len(s) == 6:
      return f"{s}.KS"
  return s


DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_mock_dataframe(symbol: str) -> Optional[pd.DataFrame]:
  """yfinance 실패 시 사용할 로컬 CSV mock 데이터."""
  mapped = None
  s = symbol.strip().upper()
  if s in {"005930", "005930.KS"}:
    mapped = "005930.sample.csv"
  elif s in {"000660", "000660.KS"}:
    mapped = "000660.sample.csv"

  if not mapped:
    return None

  csv_path = DATA_DIR / mapped
  if not csv_path.exists():
    return None

  df = pd.read_csv(csv_path, parse_dates=["date"])
  df = df.rename(
    columns={
      "open": "open",
      "high": "high",
      "low": "low",
      "close": "close",
      "volume": "volume",
    }
  )
  return df


@app.get("/analyze/raw", response_model=AnalyzeRawResponse)
def analyze_raw(symbol: str, market: Literal["KR", "US"] = "KR"):
  if not symbol:
    raise HTTPException(status_code=400, detail="symbol is required")

  norm_symbol = normalize_symbol(symbol, market)

  df: Optional[pd.DataFrame] = None

  try:
    ticker = yf.Ticker(norm_symbol)
    hist = ticker.history(period="1y", interval="1d")
    if not hist.empty:
      df = hist.reset_index().rename(columns=str.lower)
  except Exception:
    df = None

  # yfinance 실패 또는 빈 결과인 경우, 로컬 mock CSV로 대체
  if df is None or df.empty:
    mock_df = load_mock_dataframe(norm_symbol)
    if mock_df is None or mock_df.empty:
      raise HTTPException(status_code=404, detail="no price data for symbol")
    df = mock_df

  # 이동평균선 계산
  df["ma20"] = df["close"].rolling(window=20).mean()
  df["ma60"] = df["close"].rolling(window=60).mean()
  df["ma120"] = df["close"].rolling(window=120).mean()

  # 거래량 평균 및 매집 의심 구간 계산
  volume_mean = df["volume"].rolling(window=20, min_periods=5).mean()
  volume_ratio = df["volume"] / volume_mean

  df["volume_ratio"] = volume_ratio
  df["turnover"] = df["close"] * df["volume"]

  accumulation_df = df[
    (df["volume_ratio"] >= 3.0)  # 평소 대비 300% 이상
    & (df["close"] > df["open"])  # 양봉
  ]

  price_series = [
    PriceCandle(
      date=row["date"].strftime("%Y-%m-%d"),
      open=float(row["open"]),
      high=float(row["high"]),
      low=float(row["low"]),
      close=float(row["close"]),
      volume=float(row["volume"]),
    )
    for _, row in df.iterrows()
  ]

  moving_averages = [
    MovingAveragePoint(
      date=row["date"].strftime("%Y-%m-%d"),
      ma20=float(row["ma20"]) if pd.notna(row["ma20"]) else None,
      ma60=float(row["ma60"]) if pd.notna(row["ma60"]) else None,
      ma120=float(row["ma120"]) if pd.notna(row["ma120"]) else None,
    )
    for _, row in df.iterrows()
  ]

  accumulation_zones = [
    AccumulationZone(
      date=row["date"].strftime("%Y-%m-%d"),
      close=float(row["close"]),
      turnover=float(row["turnover"]),
      volume_ratio=float(row["volume_ratio"]),
    )
    for _, row in accumulation_df.iterrows()
  ]

  latest = df.iloc[-1]

  # 세력 평단 추정 구간 (매집 의심 구간의 거래대금 가중 평균 ± 표준편차)
  if not accumulation_df.empty:
    weights = accumulation_df["turnover"]
    weighted_avg = (accumulation_df["close"] * weights).sum() / weights.sum()
    std = accumulation_df["close"].std() if len(accumulation_df) > 1 else 0
    operator_range = OperatorRange(
      lower=float(max(0, weighted_avg - std)),
      upper=float(weighted_avg + std),
    )
  else:
    operator_range = OperatorRange(lower=None, upper=None)

  # 최근 30일 기준 매집 강도 점수 계산
  recent_window = 30
  cutoff = df["date"].max() - pd.Timedelta(days=recent_window)
  recent_zones = accumulation_df[accumulation_df["date"] >= cutoff]
  zones_count = int(len(recent_zones))
  total_turnover = float(recent_zones["turnover"].sum()) if zones_count > 0 else 0.0
  score = min(100, zones_count * 10)  # 간단한 초기 점수 로직
  accumulation_strength = AccumulationStrength(
    score=int(score),
    recent_days=recent_window,
    zones_count=zones_count,
    total_turnover=total_turnover,
  )

  # 가격 구간별 매물대 (종가 기준 버킷)
  bucket_size = max(1, int(df["close"].mean() * 0.01))  # 약 1% 단위 버킷
  price_floor = (df["close"].min() // bucket_size) * bucket_size
  df["price_bucket"] = ((df["close"] - price_floor) // bucket_size) * bucket_size + price_floor
  volume_by_bucket = (
    df.groupby("price_bucket")["volume"].sum().reset_index().sort_values("price_bucket")
  )
  volume_by_price = [
    VolumeByPriceBucket(price=float(row["price_bucket"]), volume=float(row["volume"]))
    for _, row in volume_by_bucket.iterrows()
  ]

  # 리스크 지표 (최대 낙폭, 평균 일간 변동성)
  closes = df["close"]
  rolling_max = closes.cummax()
  drawdowns = (closes - rolling_max) / rolling_max
  max_drawdown_pct = float(drawdowns.min() * 100)

  daily_returns = closes.pct_change().dropna()
  avg_daily_volatility_pct = float(daily_returns.std() * 100)
  risk = RiskMetrics(
    max_drawdown_pct=max_drawdown_pct,
    avg_daily_volatility_pct=avg_daily_volatility_pct,
  )

  return AnalyzeRawResponse(
    symbol=symbol,
    market=market,
    price_series=price_series,
    moving_averages=moving_averages,
    accumulation_zones=accumulation_zones,
    operator_range=operator_range,
    accumulation_strength=accumulation_strength,
    volume_by_price=volume_by_price,
    risk=risk,
    current_price=float(latest["close"]),
    current_date=latest["date"].strftime("%Y-%m-%d"),
  )

