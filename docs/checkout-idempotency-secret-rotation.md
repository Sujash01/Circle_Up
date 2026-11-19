# Checkout idempotency and `SESSION_SECRET` rotation

Guest replay tokens are deterministically derived from `SESSION_SECRET`; only their hashes are stored. Rotating `SESSION_SECRET` during the 24-hour idempotency window changes the derived token and can prevent a guest from recovering the token on a valid checkout replay.

Before rotating the secret, operators must account for outstanding idempotency records and allow the full validity window to expire, or otherwise coordinate recovery for affected guests. A future improvement is versioned token derivation: store a key version with each record and retain prior derivation keys for at least the full 24-hour validity window. That architecture is not implemented; raw guest tokens must not be stored.
