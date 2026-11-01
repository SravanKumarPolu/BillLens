> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23**  \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**.  \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# Security, privacy and data lifecycle

## Local-first boundary
Financial records reside in SQLite on the user's device by default. Local SQLite alone is **not a guarantee of at-rest encryption**; confirm OS file protection, backup exclusion, SecureStore and threat model on real devices. Guest identity must not be tied to mandatory cloud login. Permissions must be least privilege and checked at operation boundaries.

## Encrypted collaboration (optional)
Domain primitives implement Ed25519 signatures, X25519 key agreement and XChaCha20-Poly1305 envelopes. Review nonce uniqueness, signed header binding, epoch rotation, replay protection, membership revocation and authenticated invitation delivery. Relay is an untrusted transport of ciphertext; ciphertext can still reveal metadata and delivery timing. Do not claim independent audit or completed end-to-end security; app wiring and security review are incomplete.

## Key custody and recovery
Keys should be stored in platform-appropriate secure storage; never logs, analytics or plaintext exports. Member-assisted key rewrap is represented in services but requires guided UX, device verification and revocation tests. Lost keys may mean irrecoverable records without a consenting member holding group keys. Do not promise cloud recovery without a deployed service.

## Retention and deletion
Default **365-day inactivity eligibility**, optional 6/24-month selection, zero outstanding balance, no pending confirmation and no unsynced edits before *offering* cleanup. Existing code **does not automatically purge after one year**. Distinguish void expense, delete local copy, leave group, erase local data and shared deletion; ensure audit, confirmation, backup warning and scope are explicit. A 30-day relay TTL does not replace financial record backup.

## Receipts, exports, privacy and legal
Receipts and OCR can contain phone numbers, GST IDs and payment references; minimise storage, redact logs, restrict exports, remove temp files, validate permissions, encrypt backups and test restore. Payment screenshots do not verify transfer completion. Review privacy policy, terms, retention and store data-safety declarations with qualified counsel before release. SOC 2/ISO 27001 are not claimed and are not required to run a small local-first prototype.
