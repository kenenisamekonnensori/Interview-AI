import type { PerformanceSummary } from "@interviewer-ai/types";

export type ChartPoint = { x: number; y: number };

/** Maps a 0-100 score to the y pixel position (top = 100, bottom = 0). */
export function yForScore(score: number, height: number, padding = 8) {
  const innerHeight = height - padding * 2;
  return padding + innerHeight * (1 - score / 100);
}

/**
 * Maps chronological scores to chart coordinates. A single point is centered;
 * otherwise points are spread evenly across the padded width.
 */
export function buildChartPoints(
  scores: number[],
  width: number,
  height: number,
  padding = 8,
): ChartPoint[] {
  if (scores.length === 0) return [];
  if (scores.length === 1) {
    const score = scores[0]!;
    return [{ x: width / 2, y: yForScore(score, height, padding) }];
  }
  const innerWidth = width - padding * 2;
  const step = innerWidth / (scores.length - 1);
  return scores.map((score, index) => ({
    x: padding + index * step,
    y: yForScore(score, height, padding),
  }));
}

export function buildSeriesPath(points: ChartPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
}

const gridlines = [0, 25, 50, 75, 100];

export function TrendChart({
  series,
  width = 640,
  height = 220,
}: {
  series: PerformanceSummary["series"];
  width?: number;
  height?: number;
}) {
  const points = buildChartPoints(
    series.map((point) => point.overallScore),
    width,
    height,
  );
  const path = buildSeriesPath(points);
  const last = series.at(-1);
  const latestLabel = last
    ? `${last.overallScore} / 100 · ${new Date(last.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">
          Overall score over time
          {series.length > 1
            ? ` · ${series.length} scored interview${series.length === 1 ? "" : "s"}`
            : ""}
        </p>
        {latestLabel ? <p className="text-sm font-semibold tabular-nums">{latestLabel}</p> : null}
      </div>
      {points.length > 1 ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Line chart of overall interview scores over time, scaled 0 to 100"
          className="mt-3 w-full"
        >
          {gridlines.map((value) => (
            <g key={value}>
              <line
                x1={0}
                x2={width}
                y1={yForScore(value, height)}
                y2={yForScore(value, height)}
                className="stroke-white/[.08]"
                strokeWidth={1}
              />
              <text
                x={width - 4}
                y={yForScore(value, height) - 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {value}
              </text>
            </g>
          ))}
          <path
            d={path}
            fill="none"
            className="stroke-primary"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={3}
              className="fill-background stroke-primary"
              strokeWidth={2}
            />
          ))}
        </svg>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
          {series.length === 1
            ? "You have one scored interview. Complete another to see a trend line."
            : "Add more scored interviews to see your trend line here."}
        </p>
      )}
    </div>
  );
}
