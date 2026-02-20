import { runMigrations } from './migrations.js';

const applied = runMigrations();
if (applied.length === 0) {
  console.log('No new migrations');
} else {
  for (const file of applied) {
    console.log(`Applied migration: ${file}`);
  }
}
