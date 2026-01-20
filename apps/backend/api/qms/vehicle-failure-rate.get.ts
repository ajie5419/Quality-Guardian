import { defineEventHandler, getQuery } from 'h3';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const modelFilter = (query.model as string) || null;

  try {
    const months = getYTDMonths();

    // 1. Get Trend Data (YTD Cumulative)
    // Each point represents the cumulative failure rate from Jan 1st to that month.
    const trend = await Promise.all(
      months.map(async (month) => {
        // YTD Window: [Jan 1st, Month End]
        const windowStart = new Date(new Date().getFullYear(), 0, 1);
        windowStart.setHours(0, 0, 0, 0);

        // A. Shipped Count (Denominator) - R12M
        const shippedResult = await prisma.work_orders.aggregate({
          _sum: { quantity: true },
          where: {
            deliveryDate: { gte: windowStart, lte: month.end }, // Rolling window
            isDeleted: false,
            status: 'COMPLETED',
            ...(modelFilter ? { projectName: modelFilter } : {}),
          },
        });
        const shipped = Number(shippedResult._sum.quantity || 0);

        // B. Failure Count (Numerator) - R12M
        const failureCount = await prisma.after_sales.count({
          where: {
            occurDate: { gte: windowStart, lte: month.end }, // Rolling window
            ...(modelFilter ? { projectName: modelFilter } : {}),
            isDeleted: false,
          },
        });

        const rate =
          shipped > 0 ? ((failureCount / shipped) * 100).toFixed(2) : 0;

        return {
          period: month.label,
          rate: Number(rate),
          shipped, // Note: This is now R12M cumulative shipment, might be misleading if interpreted as monthly.
          // Usually trend bars show monthly volume, line shows R12M rate.
          // BUT user wants data accurate for low volume. Showing monthly volume is fine, rate should be R12M.
          // Let's return Monthly Shipment for the bar, but R12M Rate for the line.
          r12mShipped: shipped, // Internal use or debugging
          r12mFailures: failureCount,
        };
      }),
    );

    // Correcting the "Shipped" returned to frontend:
    // If we return the R12M sum as "shipped", the bar chart will be huge (annual volume).
    // Usually, dashboard users want to see "Monthly Volume vs Annualized Rate".
    // Let's re-query strict monthly volume for the "shipped" field.

    const monthlyVolumes = await Promise.all(
      months.map(async (m) => {
        const res = await prisma.work_orders.aggregate({
          _sum: { quantity: true },
          where: {
            deliveryDate: { gte: m.start, lte: m.end },
            isDeleted: false,
            status: 'COMPLETED',
            ...(modelFilter ? { projectName: modelFilter } : {}),
          },
        });
        return Number(res._sum.quantity || 0);
      }),
    );

    const finalTrend = trend.map((t, i) => ({
      ...t,
      shipped: monthlyVolumes[i], // Return MONTHLY volume for the bar chart
    }));

    // 2. Ranking Data (Overall R12M of the LAST month in the series, effectively current status)
    // Or aggregate of the whole displayed period?
    // Ranking typically shows "Who is worst right now?". So R12M of the latest month is best.
    // But the previous implementation aggregated the whole visible period (Jan-Dec).
    // Let's stick to "Last 12 Months from Today" for ranking, which matches the R12M concept.

    // 2. Ranking (YTD Total)
    // Filter from Jan 1st of Current Year
    const rankingStart = new Date(new Date().getFullYear(), 0, 1);
    rankingStart.setHours(0, 0, 0, 0);
    const rankingEnd = new Date();

    const shipmentsByModel = await prisma.work_orders.groupBy({
      _sum: { quantity: true },
      by: ['projectName'],
      where: {
        deliveryDate: { gte: rankingStart, lte: rankingEnd },
        isDeleted: false,
        status: 'COMPLETED',
      },
    });

    const failuresByModel = await prisma.after_sales.groupBy({
      by: ['projectName'],
      _count: { _all: true },
      where: {
        occurDate: { gte: rankingStart, lte: rankingEnd },
        isDeleted: false,
      },
    });

    const failureCounts: Record<string, number> = {};
    failuresByModel.forEach((f) => {
      const model = f.projectName || 'Unknown';
      failureCounts[model] = f._count._all;
    });

    const ranking = shipmentsByModel
      .map((item) => {
        const model = item.projectName || 'Unknown';
        const shipped = Number(item._sum.quantity || 0);
        const failures = failureCounts[model] || 0;
        const rate = shipped > 0 ? ((failures / shipped) * 100).toFixed(2) : 0;

        return {
          model,
          shipped,
          failures,
          rate: Number(rate),
        };
      })
      .filter((item) => item.model !== 'Unknown' && item.shipped > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10);

    return useResponseSuccess({
      trend: finalTrend,
      ranking,
    });
  } catch (error) {
    console.error('Failed to get vehicle failure rate:', error);
    return { trend: [], ranking: [] };
  }
});

function getYTDMonths() {
  const months = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  for (let i = 0; i <= currentMonth; i++) {
    const start = new Date(currentYear, i, 1);
    const end = new Date(currentYear, i + 1, 0, 23, 59, 59);
    months.push({
      label: `${currentYear}-${String(i + 1).padStart(2, '0')}`,
      start,
      end,
    });
  }
  return months;
}
