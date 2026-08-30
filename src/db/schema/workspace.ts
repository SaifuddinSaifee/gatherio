import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authLevel, workspaceRole } from './enums';
import { user } from './auth';

export const workspace = pgTable('workspace', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  billingPlan: text('billing_plan').notNull().default('trial'),
  retentionPolicyDays: text('retention_policy_days'),
  /** §4.7 risk ladder default; individual requirements can override via `requirement.sensitivity`. */
  defaultAuthenticationPolicy: authLevel('default_authentication_policy').notNull().default('link'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMember = pgTable('workspace_member', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: workspaceRole('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
