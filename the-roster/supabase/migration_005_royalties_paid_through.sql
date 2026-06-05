-- Migration 005 — Add royalties_paid_through to contracts for tick idempotency
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS royalties_paid_through date;
