# Group lifecycle guards and durable receipt cleanup

## Mutation matrix

| Operation | Active | Archived | Deleted |
|---|---|---|---|
| View expenses/balances/history | Yes | Yes | No |
| Export / backup | Yes | Yes | Yes (remaining data) |
| Restore group | n/a | Yes | No |
| Expense create/edit/void | Yes | **Rejected** | Rejected |
| Settlement create/transition | Yes | **Rejected** | Rejected |
| Recurring create/edit/pause/delete/generate | Yes | **Rejected** | Rejected |
| Member add/rename/deactivate | Yes | **Rejected** | Rejected |
| Group edit | Yes | **Rejected** (restore first) | Rejected |
| Archive | Yes | n/a | No |
| Permanent delete | Yes | Yes | Idempotent |

The guard exists in `assertGroupWritable` (application) and
`assertGroupWritableDb` (SQLite adapter). The adapter check cannot be bypassed
by a future screen.

## Cleanup outbox

- Table `file_cleanup_queue` (migration 0012) stores URI, reason, attempts,
  last error, next attempt, completion time.
- Intent is inserted inside the group-deletion transaction before receipt rows
  are removed.
- A URI still referenced by a receipt in another group is not queued.
- Processor: max 10 jobs/run, five attempts, exponential minutes 1/5/30/120/720,
  missing file = success, permanent failures parked at year 9999 for diagnostics.
- Queue drains on app start and after deletion. Completed rows are pruned after
  30 days.
- SQLite and filesystem deletion are not atomic together; SQL commits first,
  files are removed from the durable queue afterwards.
