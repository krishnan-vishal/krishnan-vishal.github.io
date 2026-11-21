// SEP-01 bounded provider failure normalization. Never treats auth or policy errors as quota.
export function normalizeProviderFailure(outcome) {
  const status=outcome?.status;
  if(status==='QUOTA_EXHAUSTED'||status==='RATE_LIMITED'||status==='TEMPORARILY_UNAVAILABLE')
    return {retryable:true,reason:status};
  if(status==='AUTH_FAILED'||status==='POLICY_DENIED'||status==='BUDGET_EXCEEDED')
    return {retryable:false,reason:status};
  return {retryable:false,reason:'PROVIDER_FAILED'};
}
