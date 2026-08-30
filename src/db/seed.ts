import { randomUUID } from 'node:crypto';
import { db } from './client';
import * as schema from './schema';
import { generateAccessToken } from '@/lib/token';
import { env } from '@/lib/env';

async function main() {
  const [owner] = await db
    .insert(schema.user)
    .values({
      id: randomUUID(),
      name: 'Saifuddin Saifee',
      email: 'saifeemustafaq@gmail.com',
      emailVerified: true,
    })
    .returning();
  if (!owner) throw new Error('failed to insert seed user');

  const [workspace] = await db
    .insert(schema.workspace)
    .values({ name: 'Demo Accounting Practice' })
    .returning();
  if (!workspace) throw new Error('failed to insert seed workspace');

  await db.insert(schema.workspaceMember).values({
    workspaceId: workspace.id,
    userId: owner.id,
    role: 'owner',
  });

  const [template] = await db
    .insert(schema.workflowTemplate)
    .values({ workspaceId: workspace.id, name: 'Monthly Bookkeeping Close' })
    .returning();
  if (!template) throw new Error('failed to insert seed template');

  const [templateVersion] = await db
    .insert(schema.templateVersion)
    .values({
      workspaceId: workspace.id,
      templateId: template.id,
      version: 1,
      status: 'active',
    })
    .returning();
  if (!templateVersion) throw new Error('failed to insert seed template version');

  const definitions = await db
    .insert(schema.requirementDefinition)
    .values([
      {
        workspaceId: workspace.id,
        templateVersionId: templateVersion.id,
        actionType: 'upload',
        title: 'Bank statement (all accounts)',
        instructions: 'PDF or photo, current month.',
        sequence: 0,
      },
      {
        workspaceId: workspace.id,
        templateVersionId: templateVersion.id,
        actionType: 'answer',
        answerFieldType: 'yes_no',
        title: 'Any new loans or leases this month?',
        sequence: 1,
      },
    ])
    .returning();

  const [uploadDef, answerDef] = definitions;
  if (!uploadDef || !answerDef) throw new Error('failed to insert seed requirement definitions');

  const [demoCase] = await db
    .insert(schema.caseTable)
    .values({
      workspaceId: workspace.id,
      templateVersionId: templateVersion.id,
      name: 'August 2026 Close: Acme Traders',
      createdBy: owner.id,
    })
    .returning();
  if (!demoCase) throw new Error('failed to insert seed case');

  const [party] = await db
    .insert(schema.party)
    .values({
      workspaceId: workspace.id,
      caseId: demoCase.id,
      partyType: 'organization',
      displayName: 'Acme Traders',
      email: 'client@acme-traders.example',
    })
    .returning();
  if (!party) throw new Error('failed to insert seed party');

  const requirements = await db
    .insert(schema.requirement)
    .values([
      {
        workspaceId: workspace.id,
        caseId: demoCase.id,
        actionType: uploadDef.actionType,
        title: uploadDef.title,
        instructions: uploadDef.instructions,
        sequence: uploadDef.sequence,
      },
      {
        workspaceId: workspace.id,
        caseId: demoCase.id,
        actionType: answerDef.actionType,
        answerFieldType: answerDef.answerFieldType,
        title: answerDef.title,
        sequence: answerDef.sequence,
      },
    ])
    .returning();

  await db.insert(schema.assignment).values(
    requirements.map((r) => ({
      workspaceId: workspace.id,
      requirementId: r.id,
      partyId: party.id,
    })),
  );

  const { token, tokenHash } = generateAccessToken();
  await db.insert(schema.accessToken).values({
    workspaceId: workspace.id,
    caseId: demoCase.id,
    partyId: party.id,
    tokenHash,
    authLevel: 'link',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  console.log('Seed complete.');
  console.log(`Requester: ${owner.email}`);
  console.log(`Workspace: ${workspace.name} (${workspace.id})`);
  console.log(`Case: ${demoCase.name}`);
  console.log(`Recipient link: ${env.APP_URL}/r/${token}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
