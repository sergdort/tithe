ALTER TABLE expenses ADD COLUMN transfer_direction TEXT;

UPDATE expenses
SET transfer_direction = CASE
  WHEN amount_minor < 0 THEN 'in'
  ELSE 'out'
END
WHERE category_id IN (
  SELECT id
  FROM categories
  WHERE kind = 'transfer'
);
