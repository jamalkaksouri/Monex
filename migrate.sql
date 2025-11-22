-- Create new schema (if starting fresh)
-- Run the new application first to create schema, then:

-- Migrate existing transactions to admin user (user_id = 1)
UPDATE transactions SET user_id = 1 WHERE user_id IS NULL;

-- If you have old transactions without user_id, run:
-- INSERT INTO transactions (user_id, type, amount, note, created_at, updated_at)
-- SELECT 1, type, amount, note, created_at, created_at FROM old_transactions;



