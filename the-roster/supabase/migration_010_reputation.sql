-- §6.2: Label reputation (0–1000, event-driven)
ALTER TABLE labels ADD COLUMN IF NOT EXISTS reputation INT NOT NULL DEFAULT 0;
