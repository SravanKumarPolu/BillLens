# Analytics & Fairness Scoring Implementation

## Overview

Python backend endpoints for expense analytics and fairness scoring have been added. The implementation is **completely backward compatible** - existing frontend code continues to work unchanged.

## New Endpoints

### 1. Expense Analytics
**Endpoint:** `POST /analytics/expense`

**Request:**
```json
{
  "expenses": [
    {
      "id": "exp-1",
      "date": "2024-01-15T10:00:00Z",
      "amount": 500.0,
      "category": "Food",
      "paidBy": "member-1",
      "splits": [{"memberId": "member-1", "amount": 250}, {"memberId": "member-2", "amount": 250}],
      "merchant": "Swiggy",
      "title": "Lunch"
    }
  ],
  "group_id": "group-1",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "months": 6
}
```

**Response:**
```json
{
  "monthly_totals": [
    {"month": "Jan", "year": 2024, "amount": 5000.0, "count": 10}
  ],
  "category_breakdown": [
    {"category": "Food", "amount": 3000.0, "count": 6}
  ],
  "current_month_total": {
    "total": 5000.0,
    "count": 10,
    "month": "Jan",
    "year": 2024
  },
  "spending_trends": {
    "average_per_month": 5000.0,
    "trend_percentage": 10.5,
    "pattern": "increasing",
    "total_expenses": 10,
    "monthly_breakdown": {"2024-01": 5000.0}
  }
}
```

### 2. Fairness Scoring
**Endpoint:** `POST /analytics/fairness`

**Request:**
```json
{
  "expenses": [...],
  "members": [
    {"id": "member-1", "name": "Alice"},
    {"id": "member-2", "name": "Bob"}
  ],
  "balances": [
    {"memberId": "member-1", "balance": 100.0},
    {"memberId": "member-2", "balance": -100.0}
  ]
}
```

**Response:**
```json
{
  "score": 85,
  "level": "good",
  "factors": {
    "paymentDistribution": 90,
    "splitEquality": 85,
    "balanceDistribution": 80
  },
  "issues": [],
  "recommendations": ["Great job! Your group maintains fair expense splitting"]
}
```

### 3. Reliability Meter
**Endpoint:** `POST /analytics/reliability`

**Request:**
```json
{
  "expenses": [...],
  "settlements": [
    {"id": "settle-1", "status": "completed"}
  ]
}
```

**Response:**
```json
{
  "score": 95,
  "level": "high",
  "factors": {
    "dataCompleteness": 100,
    "splitAccuracy": 95,
    "settlementCompleteness": 90
  },
  "warnings": ["All data looks accurate and complete"]
}
```

## Services Created

### 1. `services/analytics_service.py`
- `ExpenseAnalytics.calculate_monthly_totals()` - Monthly spending trends
- `ExpenseAnalytics.calculate_category_breakdown()` - Category analysis
- `ExpenseAnalytics.calculate_spending_trends()` - Spending pattern analysis
- `ExpenseAnalytics.calculate_current_month_total()` - Current month summary

### 2. `services/fairness_service.py`
- `FairnessScoring.calculate_fairness_score()` - Fairness scoring
- `FairnessScoring.calculate_reliability_meter()` - Data quality metrics

## Frontend Integration (Optional)

New optional frontend service: `src/utils/analyticsBackendService.ts`

**Usage:**
```typescript
import { getFairnessScoreHybrid, getReliabilityMeterHybrid } from '../utils/analyticsBackendService';

// Automatically uses backend if available, falls back to frontend
const fairnessScore = await getFairnessScoreHybrid(expenses, group, balances);
const reliability = await getReliabilityMeterHybrid(expenses, settlements);
```

**Configuration:**
```typescript
// src/config/analyticsConfig.ts
export const getAnalyticsConfig = (): AnalyticsConfig => {
  return {
    pythonBackendUrl: 'http://localhost:8000', // Optional
    usePythonBackend: true, // Optional
  };
};
```

## Backward Compatibility

✅ **All existing frontend code continues to work unchanged:**
- `src/utils/fairnessScore.ts` - Unchanged
- `src/utils/insightsService.ts` - Unchanged
- `src/screens/AnalyticsScreen.tsx` - Unchanged

The backend is **completely optional** - if not configured, everything works as before.

## Testing

1. **Start Python backend:**
   ```bash
   cd python-backend
   python -m uvicorn app.main:app --reload
   ```

2. **Test endpoints:**
   ```bash
   curl -X POST http://localhost:8000/analytics/expense \
     -H "Content-Type: application/json" \
     -d '{"expenses": [], "months": 6}'
   ```

3. **Verify frontend still works:**
   - All existing screens should work normally
   - Analytics screen should display correctly
   - Fairness meter should calculate correctly

## Benefits

1. **Performance:** Better for large datasets (1000+ expenses)
2. **Scalability:** Can handle batch processing
3. **Consistency:** Matches existing backend architecture
4. **Optional:** Doesn't break existing functionality
5. **Future-proof:** Enables ML-based insights, scheduled reports

## Next Steps (Optional)

1. Enable backend in frontend config (if desired)
2. Add caching for analytics results
3. Add batch processing for historical data
4. Add ML-based insights
5. Add scheduled report generation
