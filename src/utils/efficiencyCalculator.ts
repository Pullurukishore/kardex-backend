interface EfficiencyMetrics {
  ticketsResolved: number;
  avgResolutionTime: number;
  customerSatisfaction: number;
  firstTimeFixRate: number;
  slaCompliance: number;
  utilization?: number;
}

export function calculateEfficiencyScore(metrics: EfficiencyMetrics): number {
  const {
    ticketsResolved = 0,
    avgResolutionTime = 0,
    customerSatisfaction = 0,
    firstTimeFixRate = 0,
    slaCompliance = 0,
    utilization = 100
  } = metrics;

  // Normalize values between 0 and 1
  const normalizedTickets = Math.min(ticketsResolved / 50, 1); // Cap at 50 tickets for normalization
  const normalizedResolutionTime = Math.max(0, 1 - (avgResolutionTime / 480)); // 8 hours = 480 minutes
  const normalizedSatisfaction = customerSatisfaction / 5; // Assuming 1-5 scale
  const normalizedFTFR = firstTimeFixRate / 100; // Convert percentage to decimal
  const normalizedSLA = slaCompliance / 100; // Convert percentage to decimal
  const normalizedUtilization = utilization / 100; // Convert percentage to decimal

  // Weighted average calculation
  const weights = {
    tickets: 0.25,
    resolutionTime: 0.2,
    satisfaction: 0.2,
    ftfr: 0.2,
    sla: 0.1,
    utilization: 0.05
  };

  // Calculate weighted score (0-100 scale)
  const score = (
    (normalizedTickets * weights.tickets) +
    (normalizedResolutionTime * weights.resolutionTime) +
    (normalizedSatisfaction * weights.satisfaction) +
    (normalizedFTFR * weights.ftfr) +
    (normalizedSLA * weights.sla) +
    (normalizedUtilization * weights.utilization)
  ) * 100;

  // Ensure score is within 0-100 range
  return Math.min(100, Math.max(0, Math.round(score * 10) / 10));
}

export function getEfficiencyLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Very Good';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Average';
  if (score >= 50) return 'Below Average';
  return 'Needs Improvement';
}

export function calculateTechnicianEfficiency(metrics: EfficiencyMetrics) {
  const score = calculateEfficiencyScore(metrics);
  return {
    score,
    label: getEfficiencyLabel(score),
    ...metrics
  };
}
