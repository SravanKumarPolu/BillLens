# BillLens encrypted backup format

## Envelope

- JSON envelope, format `billlens-encrypted-backup`, version 1.
- PBKDF2-HMAC-SHA256, 210,000 iterations, 16-byte salt, 256-bit key.
- XChaCha20-Poly1305 with a 24-byte nonce; format/version/KDF/iterations/salt are
  bound as AAD. No custom cryptography.

## Payload versions

### v1 (legacy)
`billlens-backup` payload with financial tables only. No attachments. Still
restorable when its schema version is <= the installed schema.

### v2 (current)
Adds `attachments`:

```json
{
  "id": "receipt-<hash prefix>",
  "originalUris": ["file:///..."],
  "sha256": "<hash of canonical base64>",
  "sizeBytes": 12345,
  "mimeType": "image/jpeg",
  "extension": "jpg",
  "base64": "..."
}
```

Images are inside the encrypted payload; no plaintext archive is written.
Limits: 12 MB per image, 60 MB total, 200 attachments. Identical files are
deduplicated by SHA-256; every original URI maps to the same restored path.

## Restore

1. Decrypt and authenticate the envelope.
2. Validate payload version, schema <= installed version, table shapes, sizes
   and hashes.
3. Check free disk space when available.
4. Stage attachments into `document/billlens-restored-receipts/`.
5. Rewrite every table value equal to an original `image_uri` to the staged URI.
6. Replace financial tables in one SQLite transaction.
7. On SQL failure remove staged files; the previous database remains.
8. Missing source images are reported at backup time and simply excluded.

Filesystem writes and SQL are not atomic together. A crash after staging but
before commit leaves only unreferenced staged files; a crash after commit leaves
valid references.

## Compatibility

- v1 files load with `formatVersion: 1` and `includesAttachments: false`.
- New backups always use v2 but may carry zero attachments.
- Older schema backups are accepted only up to the current schema; unknown
  future versions are rejected.
