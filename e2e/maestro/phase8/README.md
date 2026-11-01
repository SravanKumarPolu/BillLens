# Phase 8 — Prompt 80 release flows

The 23 required release flows. Ten are aliases (`runFlow`) for canonical
phase6/phase7 definitions; thirteen are authored here.

| Flow | Definition |
|------|------------|
| fresh-install-guest | phase8/fresh-install-guest.yaml |
| email-otp-auth | phase8/email-otp-auth.yaml |
| social-auth-cancel | phase8/social-auth-cancel.yaml |
| guest-account-upgrade | phase8/guest-account-upgrade.yaml |
| create-group | phase8/create-group.yaml |
| join-group-by-invite | phase8/join-group-by-invite.yaml |
| create-manual-expense | phase8/create-manual-expense.yaml |
| scan-and-confirm-receipt | phase8/scan-and-confirm-receipt.yaml |
| import-payment-screenshot | phase8/import-payment-screenshot.yaml |
| correct-low-confidence-field | phase8/correct-low-confidence-field.yaml |
| create-multiple-payer-expense | phase8/create-multiple-payer-expense.yaml |
| delete-account | phase8/delete-account.yaml |
| removed-member-access-denied | phase8/removed-member-access-denied.yaml |
| record-partial-settlement | e2e/maestro/phase6/record-partial-settlement.yaml |
| confirm-settlement | e2e/maestro/phase6/confirm-settlement.yaml |
| reverse-settlement | e2e/maestro/phase6/reverse-completed-settlement.yaml |
| create-expense-offline | e2e/maestro/phase7/create-expense-offline.yaml |
| restart-and-sync | e2e/maestro/phase7/restart-with-pending-queue.yaml |
| resolve-financial-conflict | e2e/maestro/phase7/review-expense-conflict.yaml |
| export-group | e2e/maestro/phase7/export-group-csv.yaml |
| backup-account | e2e/maestro/phase7/create-json-backup.yaml |
| restore-account | e2e/maestro/phase7/restore-empty-profile.yaml |
| notification-private-mode | e2e/maestro/phase7/receive-private-notification.yaml |
