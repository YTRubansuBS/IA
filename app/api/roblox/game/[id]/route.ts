import { NextResponse } from "next/server";

type Series = { time: string; value: number };
type QueryResult = { values: any[]; error?: string };

const METRICS = [
  ["dau", "DailyActiveUsers", "OneDay"],
  ["playtimeHours", "TotalPlayTimeHours", "OneDay"],
  ["avgPlaytime", "AveragePlayTimeMinutesPerDAU", "OneDay"],
  ["avgSession", "AverageSessionLengthMinutes", "OneDay"],
  ["sessions", "Visits", "OneDay"],
  ["revenue", "DailyRevenue", "OneDay"],
  ["d1", "ForwardD1Retention", "OneDay"],
  ["d7", "ForwardD7Retention", "OneDay"],
  ["payingUsers", "PayingUsers", "OneDay"],
  ["payerCVR", "PayingUsersCVR", "OneDay"],
] as const;

const RFY = [
  ["RFYPlayThroughRate", "ptr"],
  ["RFYDuration0To60", "bounce0to60"],
  ["RFYDuration61To180", "bounce61to180"],
  ["RFYD1Playtime", "d1Playtime"],
  ["RFYD2To7Playtime", "d2to7Playtime"],
  ["RFYD8To28Playtime", "d8to28Playtime"],
  ["RFYD1PlayDays", "d1PlayDays"],
  ["RFYD2To7PlayDays", "d2to7PlayDays"],
  ["RFYD8To28PlayDays", "d8to28PlayDays"],
  ["RFYD1CoplayDays", "d1Coplay"],
  ["RFYD2To7CoplayDays", "d2to7Coplay"],
  ["RFYD8To28CoplayDays", "d8to28Coplay"],
  ["RFYD1QualifiedPlaySessions", "d1Qualified"],
  ["RFYD2To7QualifiedPlaySessions", "d2to7Qualified"],
  ["RFYD8To28QualifiedPlaySessions", "d8to28Qualified"],
  ["RFYD1RobuxSpend", "d1Robux"],
  ["RFYD2To7RobuxSpend", "d2to7Robux"],
  ["RFYD8To28RobuxSpend", "d8to28Robux"],
] as const;

async function query(
  universe: string,
  apiKey: string,
  metric: string,
  granularity: string,
  startTime: string,
  endTime: string,
  breakdown?: string[],
  limit?: number,
): Promise<QueryResult> {
  const body: Record<string, unknown> = { metric, granularity, startTime, endTime };
  if (breakdown) body.breakdown = breakdown;
  if (limit) body.limit = limit;

  const response = await fetch(
    `https://apis.roblox.com/analytics-query-api/v1/universes/${universe}/metrics`,
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  let data: any = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.code ||
      `Roblox Analytics HTTP ${response.status}`;
    const hint =
      response.status === 403
        ? " Vérifie que la clé API possède universe.analytics:read et que cet univers est autorisé dans la clé."
        : "";
    throw new Error(`${metric}: Roblox Analytics HTTP ${response.status} — ${message}.${hint}`);
  }

  if (data?.done === false && data?.path) {
    for (let i = 0; i < 30 && !data.done; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const poll = await fetch(
        `https://apis.roblox.com/analytics-query-api/${data.path}`,
        { headers: { "x-api-key": apiKey }, cache: "no-store" },
      );
      data = await poll.json().catch(() => null);

      if (!poll.ok) {
        throw new Error(
          `${metric}: Roblox Analytics polling HTTP ${poll.status}`,
        );
      }
    }

    if (!data?.done) {
      throw new Error(`${metric}: requête Roblox Analytics trop longue`);
    }
  }

  return { values: data?.response?.values || [] };
}

function flat(values: any[]): Series[] {
  return (values?.[0]?.dataPoints || []).map((point: any) => ({
    time: point.time,
    value: Number(point.value) || 0,
  }));
}

function one(values: any[]): number | null {
  const series = flat(values);
  return series.length ? series[series.length - 1].value : null;
}

function breakdown(values: any[]) {
  return (values || [])
    .map((item) => ({
      label: String(item.breakdowns?.[0] ?? "Inconnu"),
      value:
        Number(item.dataPoints?.[item.dataPoints.length - 1]?.value) || 0,
    }))
    .sort((a, b) => b.value - a.value);
}

async function safe(
  universe: string,
  apiKey: string,
  metric: string,
  granularity: string,
  dates: { start: string; end: string },
  errors: string[],
  breakdownValues?: string[],
) {
  try {
    return await query(
      universe,
      apiKey,
      metric,
      granularity,
      dates.start,
      dates.end,
      breakdownValues,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    return { values: [] };
  }
}

function dates(days: number) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { start: start.toISOString(), end: end.toISOString() };
}

function keyFor(id: string) {
  return process.env[`ROBLOX_API_KEY_${id}`] || process.env.ROBLOX_API_KEY || "";
}

async function build(universe: string, apiKey: string, days: number) {
  const dateRange = dates(days);
  const errors: string[] = [];
  const stats: any = {
    dau: [],
    playtimeHours: [],
    avgPlaytime: [],
    avgSession: [],
    sessions: [],
    revenue: [],
    d1: [],
    d7: [],
    payingUsers: [],
    payerCVR: [],
    acquisition: [],
    platforms: [],
    countries: [],
    ages: [],
    newReturning: [],
    rfy: {},
  };

  // DAU is the health check: if Roblox rejects this request, do not hide the
  // real reason behind an empty dashboard.
  const dauResult = await query(
    universe,
    apiKey,
    "DailyActiveUsers",
    "OneDay",
    dateRange.start,
    dateRange.end,
  );
  stats.dau = flat(dauResult.values);

  const main = await Promise.all(
    METRICS.filter(([key]) => key !== "dau").map(async ([key, metric, granularity]) => {
      const result = await safe(
        universe,
        apiKey,
        metric,
        granularity,
        dateRange,
        errors,
      );
      return [key, flat(result.values)] as const;
    }),
  );

  for (const [key, value] of main) stats[key] = value;

  const mau = await safe(
    universe,
    apiKey,
    "MonthlyActiveUsers",
    "OneDay",
    dateRange,
    errors,
  );
  stats.mau = one(mau.values);

  const [platform, country, age, newReturning] = await Promise.all([
    safe(universe, apiKey, "DailyActiveUsers", "None", dateRange, errors, ["Platform"]),
    safe(universe, apiKey, "DailyActiveUsers", "None", dateRange, errors, ["Country"]),
    safe(universe, apiKey, "DailyActiveUsers", "None", dateRange, errors, ["AgeGroupV2"]),
    safe(universe, apiKey, "DailyActiveUsers", "None", dateRange, errors, ["IsNewUser"]),
  ]);

  stats.platforms = breakdown(platform.values);
  stats.countries = breakdown(country.values);
  stats.ages = breakdown(age.values);
  stats.newReturning = breakdown(newReturning.values);

  const [impressions, clicks, plays, ctr, rate] = await Promise.all([
    safe(universe, apiKey, "UniqueUsersWithImpressions", "None", dateRange, errors, ["AcquisitionSource"]),
    safe(universe, apiKey, "UniqueUsersWithClicks", "None", dateRange, errors, ["AcquisitionSource"]),
    safe(universe, apiKey, "UniqueUsersWithPlaySessions", "None", dateRange, errors, ["AcquisitionSource"]),
    safe(universe, apiKey, "ImpressionCVR", "None", dateRange, errors, ["AcquisitionSource"]),
    safe(universe, apiKey, "EndToEndCVR", "None", dateRange, errors, ["AcquisitionSource"]),
  ]);

  const latestMap = (values: any[]) => {
    const out: Record<string, number> = {};
    for (const item of values || []) {
      const label = String(item.breakdowns?.[0] ?? "Other");
      out[label] =
        Number(item.dataPoints?.[item.dataPoints.length - 1]?.value) || 0;
    }
    return out;
  };

  const I = latestMap(impressions.values);
  const C = latestMap(clicks.values);
  const P = latestMap(plays.values);
  const CTR = latestMap(ctr.values);
  const RATE = latestMap(rate.values);

  const sources = Array.from(
    new Set([...Object.keys(I), ...Object.keys(C), ...Object.keys(P)]),
  );

  stats.acquisition = sources
    .map((source) => ({
      source,
      impressions: I[source] || 0,
      clicks: C[source] || 0,
      plays: P[source] || 0,
      impressionCTR: CTR[source] ?? null,
      playRate: RATE[source] ?? null,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  for (const [metric, key] of RFY) {
    const result = await safe(
      universe,
      apiKey,
      metric,
      "OneDay",
      dateRange,
      errors,
    );
    stats.rfy[key] = one(result.values);
  }

  return {
    stats,
    diagnostics: {
      universeId: universe,
      days,
      partialErrors: Array.from(new Set(errors)),
      apiKeyConfigured: true,
    },
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiKey = keyFor(id);

  if (!apiKey) {
    return NextResponse.json(
      {
        error: `Clé Roblox Open Cloud absente pour l'univers ${id}. Ajoute ROBLOX_API_KEY ou ROBLOX_API_KEY_${id} dans Vercel (Production).`,
        code: "ROBLOX_API_KEY_MISSING",
      },
      { status: 503 },
    );
  }

  const days = Math.min(
    365,
    Math.max(1, Number(new URL(req.url).searchParams.get("days") || 30)),
  );

  try {
    return NextResponse.json(await build(id, apiKey, days));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analytics Roblox indisponibles";

    return NextResponse.json(
      {
        error: message,
        code: "ROBLOX_ANALYTICS_REQUEST_FAILED",
        universeId: id,
        hint:
          message.includes("HTTP 403")
            ? "La clé Roblox est présente mais Roblox refuse l'accès Analytics. Vérifie universe.analytics:read et les expériences autorisées dans la clé."
            : undefined,
      },
      { status: 502 },
    );
  }
}
