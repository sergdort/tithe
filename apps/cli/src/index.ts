#!/usr/bin/env node
import crypto from 'node:crypto';
import { Command } from 'commander';

import { fail, ok } from '@tithe/contracts';
import { runMigrations } from '@tithe/db';
import { AppError, createDomainServices } from '@tithe/domain';
import { loadWorkspaceEnv } from './load-env.js';
import { runWebCommand } from './web.js';

loadWorkspaceEnv();

const program = new Command();
type CliServices = ReturnType<typeof createDomainServices> & { close?: () => void };
let services: CliServices | null = null;
const getServices = (): CliServices => (services ??= createDomainServices());
process.once('exit', () => {
  services?.close?.();
});
let migrationsReady = false;

const asBoolean = (value?: string | boolean): boolean => {
  if (value === true) {
    return true;
  }
  if (value === false || value === undefined) {
    return false;
  }
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
};

const parseOptionalInteger = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : Number(value);

const parseNullableIntegerOption = (value: string | undefined): number | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value.toLowerCase() === 'null') {
    return null;
  }
  return Number(value);
};

const parseNullableStringOption = (value: string | undefined): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return value.toLowerCase() === 'null' ? null : value;
};

const monthPattern = /^\d{4}-\d{2}$/;

const resolveLocalMonthRange = (month?: string): { from: string; to: string } => {
  let year: number;
  let monthIndex: number;

  if (month) {
    if (!monthPattern.test(month)) {
      throw new AppError('VALIDATION_ERROR', '--month must match YYYY-MM', 400, { month });
    }
    const [yearText, monthText] = month.split('-');
    year = Number(yearText);
    monthIndex = Number(monthText) - 1;
    if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      throw new AppError('VALIDATION_ERROR', '--month must match YYYY-MM', 400, { month });
    }
  } else {
    const now = new Date();
    year = now.getFullYear();
    monthIndex = now.getMonth();
  }

  return {
    from: new Date(year, monthIndex, 1, 0, 0, 0, 0).toISOString(),
    to: new Date(year, monthIndex + 1, 1, 0, 0, 0, 0).toISOString(),
  };
};

const emit = (payload: unknown, json: boolean): void => {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (typeof payload === 'object' && payload !== null) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(String(payload));
};

const run = async <T>(json: boolean, fn: () => Promise<T>): Promise<void> => {
  try {
    if (!migrationsReady) {
      runMigrations();
      migrationsReady = true;
    }

    const data = await fn();
    emit(ok(data), json);
  } catch (error) {
    if (error instanceof AppError) {
      emit(fail(error.code, error.message, error.details), true);
      process.exitCode = 1;
      return;
    }

    emit(fail('INTERNAL_ERROR', error instanceof Error ? error.message : String(error)), true);
    process.exitCode = 1;
  }
};

program
  .name('tithe')
  .description('Local-first expense tracker CLI')
  .option('--json', 'output as JSON envelope', false)
  .showHelpAfterError();

const category = program.command('category').description('Category operations');

category
  .command('list')
  .description('List categories')
  .action(async () => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () => getServices().categories.list());
  });

category
  .command('add')
  .requiredOption('--name <name>', 'category name')
  .requiredOption('--kind <kind>', 'expense|income|transfer')
  .option('--icon <icon>', 'MUI icon name')
  .option('--color <color>', 'hex color')
  .option('--reimbursement-mode <mode>', 'none|optional|always')
  .option('--default-counterparty-type <type>', 'self|partner|team|other|null')
  .option('--default-recovery-window-days <days>', 'default auto-match window days or null')
  .option('--default-my-share-mode <mode>', 'fixed|percent|null')
  .option('--default-my-share-value <value>', 'default my share value or null')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () =>
      getServices().categories.create(
        {
          name: options.name,
          kind: options.kind,
          icon: options.icon,
          color: options.color,
          reimbursementMode: options.reimbursementMode,
          defaultCounterpartyType: parseNullableStringOption(options.defaultCounterpartyType) as
            | 'self'
            | 'partner'
            | 'team'
            | 'other'
            | null
            | undefined,
          defaultRecoveryWindowDays: parseNullableIntegerOption(options.defaultRecoveryWindowDays),
          defaultMyShareMode: parseNullableStringOption(options.defaultMyShareMode) as
            | 'fixed'
            | 'percent'
            | null
            | undefined,
          defaultMyShareValue: parseNullableIntegerOption(options.defaultMyShareValue),
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

category
  .command('update')
  .requiredOption('--id <id>', 'category id')
  .option('--name <name>', 'category name')
  .option('--kind <kind>', 'expense|income|transfer')
  .option('--icon <icon>', 'MUI icon name')
  .option('--color <color>', 'hex color')
  .option('--archived-at <isoDate>', 'archive timestamp')
  .option('--unarchive', 'clear archivedAt flag', false)
  .option('--reimbursement-mode <mode>', 'none|optional|always')
  .option('--default-counterparty-type <type>', 'self|partner|team|other|null')
  .option('--default-recovery-window-days <days>', 'default auto-match window days or null')
  .option('--default-my-share-mode <mode>', 'fixed|percent|null')
  .option('--default-my-share-value <value>', 'default my share value or null')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    await run(opts.json, () =>
      getServices().categories.update(
        options.id,
        {
          name: options.name,
          kind: options.kind,
          icon: options.icon,
          color: options.color,
          archivedAt: options.unarchive ? null : options.archivedAt,
          reimbursementMode: options.reimbursementMode,
          defaultCounterpartyType: parseNullableStringOption(options.defaultCounterpartyType) as
            | 'self'
            | 'partner'
            | 'team'
            | 'other'
            | null
            | undefined,
          defaultRecoveryWindowDays: parseNullableIntegerOption(options.defaultRecoveryWindowDays),
          defaultMyShareMode: parseNullableStringOption(options.defaultMyShareMode) as
            | 'fixed'
            | 'percent'
            | null
            | undefined,
          defaultMyShareValue: parseNullableIntegerOption(options.defaultMyShareValue),
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

category
  .command('delete')
  .requiredOption('--id <id>', 'category id')
  .option('--reassign <id>', 'reassign linked records before delete')
  .option('--dry-run', 'return approval token only', false)
  .option('--approve <operationId>', 'approval token id')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    if (options.dryRun) {
      await run(opts.json, () =>
        getServices().categories.createDeleteApproval(options.id, options.reassign),
      );
      return;
    }

    if (!options.approve) {
      emit(
        fail('APPROVAL_REQUIRED', 'Pass --dry-run first, then --approve <operationId> for delete.'),
        true,
      );
      process.exitCode = 1;
      return;
    }

    await run(opts.json, async () => {
      await getServices().categories.delete(options.id, options.approve, options.reassign, {
        actor: 'cli',
        channel: 'cli',
      });
      return { deleted: true, id: options.id };
    });
  });

const expense = program.command('expense').description('Expense operations');

expense
  .command('list')
  .option('--from <isoDate>', 'from date')
  .option('--to <isoDate>', 'to date')
  .option('--category-id <id>', 'category id')
  .option('--limit <count>', 'max records', '200')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () =>
      getServices().expenses.list({
        from: options.from,
        to: options.to,
        categoryId: options.categoryId,
        limit: Number(options.limit),
      }),
    );
  });

expense
  .command('add')
  .requiredOption('--occurred-at <isoDate>', 'occurrence date')
  .requiredOption('--amount-minor <amountMinor>', 'amount in minor units')
  .requiredOption('--currency <currency>', 'ISO currency')
  .requiredOption('--category-id <id>', 'category id')
  .option('--posted-at <isoDate>', 'posting date')
  .option('--amount-base-minor <amountBaseMinor>', 'normalized base amount')
  .option('--fx-rate <fxRate>', 'fx rate')
  .option('--source <source>', 'local|monzo|commitment', 'local')
  .option('--transfer-direction <direction>', 'in|out')
  .option('--kind <kind>', 'expense|income|transfer_internal|transfer_external')
  .option('--reimbursable', 'mark expense as reimbursable')
  .option('--not-reimbursable', 'disable reimbursement tracking for this row')
  .option('--my-share-minor <amountMinor|null>', 'my share in minor units or null')
  .option('--counterparty-type <type|null>', 'self|partner|team|other|null')
  .option('--reimbursement-group-id <id|null>', 'optional reimbursement grouping key or null')
  .option('--merchant-name <merchantName>', 'merchant name')
  .option('--note <note>', 'note')
  .option('--provider-transaction-id <providerTransactionId>', 'provider transaction id for idempotency')
  .option('--commitment-instance-id <id>', 'link expense to commitment instance')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    const reimbursable =
      options.reimbursable === true
        ? true
        : options.notReimbursable === true
          ? false
          : undefined;

    await run(opts.json, () =>
      getServices().expenses.create(
        {
          occurredAt: options.occurredAt,
          postedAt: options.postedAt,
          amountMinor: Number(options.amountMinor),
          currency: options.currency,
          amountBaseMinor: options.amountBaseMinor ? Number(options.amountBaseMinor) : undefined,
          fxRate: options.fxRate ? Number(options.fxRate) : undefined,
          categoryId: options.categoryId,
          source: options.source,
          transferDirection: options.transferDirection,
          kind: options.kind,
          reimbursable,
          myShareMinor: parseNullableIntegerOption(options.myShareMinor),
          counterpartyType: parseNullableStringOption(options.counterpartyType) as
            | 'self'
            | 'partner'
            | 'team'
            | 'other'
            | null
            | undefined,
          reimbursementGroupId: parseNullableStringOption(options.reimbursementGroupId),
          merchantName: options.merchantName,
          note: options.note,
          providerTransactionId: options.providerTransactionId,
          commitmentInstanceId: options.commitmentInstanceId,
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

expense
  .command('update')
  .requiredOption('--id <id>', 'expense id')
  .option('--occurred-at <isoDate>', 'occurrence date')
  .option('--posted-at <isoDate>', 'posting date')
  .option('--amount-minor <amountMinor>', 'amount in minor units')
  .option('--currency <currency>', 'ISO currency')
  .option('--amount-base-minor <amountBaseMinor>', 'normalized base amount')
  .option('--fx-rate <fxRate>', 'fx rate')
  .option('--category-id <id>', 'category id')
  .option('--transfer-direction <direction>', 'in|out')
  .option('--kind <kind>', 'expense|income|transfer_internal|transfer_external')
  .option('--reimbursable', 'mark expense as reimbursable')
  .option('--not-reimbursable', 'disable reimbursement tracking for this row')
  .option('--my-share-minor <amountMinor|null>', 'my share in minor units or null')
  .option('--counterparty-type <type|null>', 'self|partner|team|other|null')
  .option('--reimbursement-group-id <id|null>', 'optional reimbursement grouping key or null')
  .option('--merchant-name <merchantName>', 'merchant name')
  .option('--note <note>', 'note')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    const reimbursable =
      options.reimbursable === true
        ? true
        : options.notReimbursable === true
          ? false
          : undefined;

    await run(opts.json, () =>
      getServices().expenses.update(
        options.id,
        {
          occurredAt: options.occurredAt,
          postedAt: options.postedAt,
          amountMinor: options.amountMinor ? Number(options.amountMinor) : undefined,
          currency: options.currency,
          amountBaseMinor: options.amountBaseMinor ? Number(options.amountBaseMinor) : undefined,
          fxRate: options.fxRate ? Number(options.fxRate) : undefined,
          categoryId: options.categoryId,
          transferDirection: options.transferDirection,
          kind: options.kind,
          reimbursable,
          myShareMinor: parseNullableIntegerOption(options.myShareMinor),
          counterpartyType: parseNullableStringOption(options.counterpartyType) as
            | 'self'
            | 'partner'
            | 'team'
            | 'other'
            | null
            | undefined,
          reimbursementGroupId: parseNullableStringOption(options.reimbursementGroupId),
          merchantName: options.merchantName,
          note: options.note,
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

expense
  .command('delete')
  .requiredOption('--id <id>', 'expense id')
  .option('--dry-run', 'return approval token only', false)
  .option('--approve <operationId>', 'approval token id')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    if (options.dryRun) {
      await run(opts.json, () => getServices().expenses.createDeleteApproval(options.id));
      return;
    }

    if (!options.approve) {
      emit(
        fail('APPROVAL_REQUIRED', 'Pass --dry-run first, then --approve <operationId> for delete.'),
        true,
      );
      process.exitCode = 1;
      return;
    }

    await run(opts.json, async () => {
      await getServices().expenses.delete(options.id, options.approve, { actor: 'cli', channel: 'cli' });
      return { deleted: true, id: options.id };
    });
  });

const reimbursement = program.command('reimbursement').description('Reimbursement workflow operations');
const reimbursementRule = reimbursement
  .command('rule')
  .description('Reimbursement auto-match category rule operations');

reimbursementRule.command('list').action(async () => {
  const opts = program.opts<{ json: boolean }>();
  await run(opts.json, () => getServices().reimbursements.listCategoryRules());
});

reimbursementRule
  .command('add')
  .requiredOption('--expense-category-id <id>', 'expense category id')
  .requiredOption('--inbound-category-id <id>', 'income/transfer category id')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () =>
      getServices().reimbursements.createCategoryRule(
        {
          expenseCategoryId: options.expenseCategoryId,
          inboundCategoryId: options.inboundCategoryId,
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

reimbursementRule
  .command('delete')
  .requiredOption('--id <id>', 'reimbursement category rule id')
  .option('--dry-run', 'return approval token only', false)
  .option('--approve <operationId>', 'approval token id')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    if (options.dryRun) {
      await run(opts.json, () => getServices().reimbursements.createDeleteCategoryRuleApproval(options.id));
      return;
    }

    if (!options.approve) {
      emit(
        fail('APPROVAL_REQUIRED', 'Pass --dry-run first, then --approve <operationId> for delete.'),
        true,
      );
      process.exitCode = 1;
      return;
    }

    await run(opts.json, async () => {
      await getServices().reimbursements.deleteCategoryRule(options.id, options.approve, {
        actor: 'cli',
        channel: 'cli',
      });
      return { deleted: true, id: options.id };
    });
  });

reimbursement
  .command('link')
  .requiredOption('--expense-out-id <id>', 'reimbursable outbound expense id')
  .requiredOption('--expense-in-id <id>', 'inbound reimbursement transaction id')
  .requiredOption('--amount-minor <amountMinor>', 'allocation amount in minor units')
  .option('--idempotency-key <key>', 'idempotency key (UUID recommended)')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    const idempotencyKey = options.idempotencyKey ?? crypto.randomUUID();

    await run(opts.json, () =>
      getServices().reimbursements.link(
        {
          expenseOutId: options.expenseOutId,
          expenseInId: options.expenseInId,
          amountMinor: Number(options.amountMinor),
          idempotencyKey,
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

reimbursement
  .command('unlink')
  .requiredOption('--id <id>', 'reimbursement link id')
  .option('--dry-run', 'return approval token only', false)
  .option('--approve <operationId>', 'approval token id')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    if (options.dryRun) {
      await run(opts.json, () => getServices().reimbursements.createUnlinkApproval(options.id));
      return;
    }

    if (!options.approve) {
      emit(
        fail('APPROVAL_REQUIRED', 'Pass --dry-run first, then --approve <operationId> for delete.'),
        true,
      );
      process.exitCode = 1;
      return;
    }

    await run(opts.json, async () => {
      await getServices().reimbursements.unlink(options.id, options.approve, {
        actor: 'cli',
        channel: 'cli',
      });
      return { deleted: true, id: options.id };
    });
  });

reimbursement
  .command('close')
  .requiredOption('--expense-out-id <id>', 'reimbursable outbound expense id')
  .option('--close-outstanding-minor <amountMinor>', 'write-off amount in minor units')
  .option('--reason <text>', 'optional write-off reason')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () =>
      getServices().reimbursements.close(
        options.expenseOutId,
        {
          closeOutstandingMinor: parseOptionalInteger(options.closeOutstandingMinor),
          reason: options.reason,
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

reimbursement
  .command('reopen')
  .requiredOption('--expense-out-id <id>', 'reimbursable outbound expense id')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () =>
      getServices().reimbursements.reopen(options.expenseOutId, { actor: 'cli', channel: 'cli' }),
    );
  });

reimbursement
  .command('auto-match')
  .option('--from <isoDate>', 'from date (inclusive)')
  .option('--to <isoDate>', 'to date (exclusive)')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () =>
      getServices().reimbursements.autoMatch(
        {
          from: options.from,
          to: options.to,
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

const commitment = program.command('commitment').description('Recurring commitment operations');

commitment.command('list').action(async () => {
  const opts = program.opts<{ json: boolean }>();
  await run(opts.json, () => getServices().commitments.list());
});

commitment
  .command('add')
  .requiredOption('--name <name>', 'name')
  .requiredOption('--rrule <rrule>', 'RFC5545 RRULE fragment e.g. FREQ=MONTHLY;INTERVAL=1')
  .requiredOption('--start-date <isoDate>', 'start date')
  .requiredOption('--default-amount-minor <amountMinor>', 'amount in minor units')
  .requiredOption('--currency <currency>', 'ISO currency')
  .requiredOption('--category-id <id>', 'category id')
  .option('--grace-days <graceDays>', 'grace days', '0')
  .option('--inactive', 'create as inactive', false)
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    await run(opts.json, () =>
      getServices().commitments.create(
        {
          name: options.name,
          rrule: options.rrule,
          startDate: options.startDate,
          defaultAmountMinor: Number(options.defaultAmountMinor),
          currency: options.currency,
          categoryId: options.categoryId,
          graceDays: Number(options.graceDays),
          active: !asBoolean(options.inactive),
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

commitment
  .command('update')
  .requiredOption('--id <id>', 'commitment id')
  .option('--name <name>', 'name')
  .option('--rrule <rrule>', 'rrule')
  .option('--start-date <isoDate>', 'start date')
  .option('--default-amount-minor <amountMinor>', 'amount in minor units')
  .option('--currency <currency>', 'currency')
  .option('--category-id <id>', 'category id')
  .option('--grace-days <graceDays>', 'grace days')
  .option('--active', 'active true')
  .option('--inactive', 'active false')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    let active: boolean | undefined;
    if (options.active) {
      active = true;
    } else if (options.inactive) {
      active = false;
    }

    await run(opts.json, () =>
      getServices().commitments.update(
        options.id,
        {
          name: options.name,
          rrule: options.rrule,
          startDate: options.startDate,
          defaultAmountMinor: options.defaultAmountMinor
            ? Number(options.defaultAmountMinor)
            : undefined,
          currency: options.currency,
          categoryId: options.categoryId,
          graceDays: options.graceDays ? Number(options.graceDays) : undefined,
          active,
        },
        { actor: 'cli', channel: 'cli' },
      ),
    );
  });

commitment
  .command('delete')
  .requiredOption('--id <id>', 'commitment id')
  .option('--dry-run', 'return approval token only', false)
  .option('--approve <operationId>', 'approval token id')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    if (options.dryRun) {
      await run(opts.json, () => getServices().commitments.createDeleteApproval(options.id));
      return;
    }

    if (!options.approve) {
      emit(
        fail('APPROVAL_REQUIRED', 'Pass --dry-run first, then --approve <operationId> for delete.'),
        true,
      );
      process.exitCode = 1;
      return;
    }

    await run(opts.json, async () => {
      await getServices().commitments.delete(options.id, options.approve, {
        actor: 'cli',
        channel: 'cli',
      });
      return { deleted: true, id: options.id };
    });
  });

commitment
  .command('run-due')
  .option('--up-to <isoDate>', 'generate due instances up to date')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () =>
      getServices().commitments.runDueGeneration(options.upTo, { actor: 'cli', channel: 'cli' }),
    );
  });

commitment
  .command('instances')
  .option('--status <status>', 'pending|paid|overdue|skipped')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () => getServices().commitments.listInstances(options.status));
  });

const report = program.command('report').description('Reporting and insights');

report
  .command('trends')
  .option('--months <months>', 'months', '6')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () => getServices().reports.monthlyTrends(Number(options.months)));
  });

report
  .command('category-breakdown')
  .option('--from <isoDate>', 'from date')
  .option('--to <isoDate>', 'to date')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () => getServices().reports.categoryBreakdown(options.from, options.to));
  });

report
  .command('commitment-forecast')
  .option('--days <days>', 'forecast days', '30')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();
    await run(opts.json, () => getServices().reports.commitmentForecast(Number(options.days)));
  });

report
  .command('monthly-ledger')
  .option('--month <month>', 'month in YYYY-MM')
  .option('--from <isoDate>', 'from date (inclusive)')
  .option('--to <isoDate>', 'to date (exclusive)')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    let range: { from: string; to: string };
    try {
      if (options.month && (options.from || options.to)) {
        emit(fail('VALIDATION_ERROR', 'Use either --month or --from/--to, not both'), true);
        process.exitCode = 1;
        return;
      }

      if (options.from || options.to) {
        if (!options.from || !options.to) {
          emit(fail('VALIDATION_ERROR', 'Pass both --from and --to'), true);
          process.exitCode = 1;
          return;
        }
        range = { from: options.from, to: options.to };
      } else {
        range = resolveLocalMonthRange(options.month);
      }
    } catch (error) {
      if (error instanceof AppError) {
        emit(fail(error.code, error.message, error.details), true);
        process.exitCode = 1;
        return;
      }
      throw error;
    }

    await run(opts.json, () => getServices().reports.monthlyLedger(range));
  });

program
  .command('query')
  .requiredOption(
    '--entity <entity>',
    'expenses|categories|commitment_instances|recurring_commitments',
  )
  .option('--filter <jsonFilter...>', 'JSON filter object array item')
  .option('--sort-by <sortBy>', 'sort column')
  .option('--sort-dir <sortDir>', 'asc|desc', 'desc')
  .option('--limit <limit>', 'result limit', '100')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    const filters = (options.filter ?? []).map((item: string) => JSON.parse(item));

    await run(opts.json, () =>
      getServices().query.run({
        entity: options.entity,
        filters,
        sortBy: options.sortBy ?? 'created_at',
        sortDir: options.sortDir,
        limit: Number(options.limit),
      }),
    );
  });

const monzo = program.command('monzo').description('Monzo integration');

monzo.command('connect').action(async () => {
  const opts = program.opts<{ json: boolean }>();
  await run(opts.json, () => getServices().monzo.connectStart());
});

monzo
  .command('sync')
  .option('--month <month>', 'month in YYYY-MM')
  .option('--from <isoDate>', 'from date (inclusive)')
  .option('--to <isoDate>', 'to date (exclusive)')
  .option('--override', 'overwrite already imported Monzo expenses in range', false)
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    let range: { from: string; to: string } | null = null;
    try {
      if (options.month && (options.from || options.to)) {
        emit(fail('VALIDATION_ERROR', 'Use either --month or --from/--to, not both'), true);
        process.exitCode = 1;
        return;
      }

      if (options.from || options.to) {
        if (!options.from || !options.to) {
          emit(fail('VALIDATION_ERROR', 'Pass both --from and --to'), true);
          process.exitCode = 1;
          return;
        }
        range = { from: options.from, to: options.to };
      } else if (options.month) {
        range = resolveLocalMonthRange(options.month);
      }
    } catch (error) {
      if (error instanceof AppError) {
        emit(fail(error.code, error.message, error.details), true);
        process.exitCode = 1;
        return;
      }

      throw error;
    }

    if (!range && !options.override) {
      await run(opts.json, () => getServices().monzo.syncNow());
      return;
    }

    await run(opts.json, () =>
      getServices().monzo.sync({
        from: range?.from,
        to: range?.to,
        overrideExisting: asBoolean(options.override),
      }),
    );
  });

monzo.command('status').action(async () => {
  const opts = program.opts<{ json: boolean }>();
  await run(opts.json, () => getServices().monzo.status());
});

program
  .command('web')
  .description('Run API + PWA web stack')
  .option('--mode <mode>', 'dev|preview', 'dev')
  .option('--api-port <port>', 'override API port (1-65535)')
  .option('--pwa-port <port>', 'override PWA port (1-65535)')
  .action(async (options) => {
    const opts = program.opts<{ json: boolean }>();

    try {
      await runWebCommand(
        {
          mode: options.mode,
          apiPort: options.apiPort,
          pwaPort: options.pwaPort,
        },
        opts.json,
      );
    } catch (error) {
      if (error instanceof AppError) {
        emit(fail(error.code, error.message, error.details), true);
        process.exitCode = 1;
        return;
      }

      emit(fail('INTERNAL_ERROR', error instanceof Error ? error.message : String(error)), true);
      process.exitCode = 1;
    }
  });

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

await program.parseAsync(process.argv);
