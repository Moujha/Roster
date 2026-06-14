-- Migration 014: add is_regional_star flag to artists
-- Regional Stars: artists ranking in top 50 of their home country chart.
-- Allows signing Major-tier artists and enables the Home Crowd 1.15× bonus.
ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_regional_star boolean NOT NULL DEFAULT false;
