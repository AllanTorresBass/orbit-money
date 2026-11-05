export interface AllowanceDto {
  sTodayCents: number;
  sDailyCents: number;
  nP: number;
  nextPayday: string | null;
  mitigated: boolean;
  asOfDate: string;
  tenantName: string;
  breachDate: string | null;
  warningDate: string | null;
  /** Sum of account balances. */
  bankTotalCents: number;
  /** The "keep at least" amount. */
  keepAtLeastCents: number;
  /** True when the forecast could not refresh and the previous one is shown. */
  forecastStale: boolean;
}
