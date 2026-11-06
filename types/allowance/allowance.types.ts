export interface AllowanceDto {
  sTodayCents: number;
  sDailyCents: number;
  /**
   * Tomorrow's projected burn (forecast day 1). Used for past-pace copy when
   * S_today is negative so the hero cites the rebaked rate (D7), not morning S_daily.
   */
  tomorrowBurnCents: number;
  /** Days until the next inflow. Null when no future inflow is scheduled. */
  nP: number | null;
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
  /** Balance of the Spending pool. Below zero means ordinary days are overdrawn. */
  spendingBalanceCents: number;
  /** False until the first purchase is recorded. Drives the first-run banner. */
  hasPurchaseHistory: boolean;
}
