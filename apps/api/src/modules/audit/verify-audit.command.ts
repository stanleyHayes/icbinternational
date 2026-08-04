import { createConnection } from 'mongoose';

import { ClockService } from '../../common/clock/clock.service.js';

import { AuditEventRepository } from './audit-event.repository.js';
import { AuditEventDocument, AuditEventSchema } from './audit-event.schema.js';
import { AuditVerifierService } from './audit-verifier.service.js';
import { type AuditChainVerification } from './audit.types.js';

/**
 * The `audit:verify` command — walks the whole chain and exits non-zero when it is broken.
 *
 * Standalone on purpose: verification must not depend on the API booting, because a
 * tampered-with database is exactly the situation in which you still need this to run.
 * It therefore opens its own connection rather than starting a Nest application context,
 * and it writes nothing — the collection being checked is never touched by the checker.
 *
 * Exit codes: `0` chain sound, `1` chain broken (the report names the first broken
 * event), `2` the check itself could not run. CI and the nightly job alert on anything
 * but `0`.
 */
async function main(): Promise<number> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    process.stderr.write(
      'MONGODB_URI is not set. Run via `pnpm --filter @reliance/api audit:verify`.\n',
    );
    return EXIT_ERROR;
  }

  const connection = createConnection(uri, { dbName: process.env.MONGODB_DB ?? DEFAULT_DB_NAME });

  try {
    await connection.asPromise();
    const verifier = new AuditVerifierService(
      new AuditEventRepository(connection.model(AuditEventDocument.name, AuditEventSchema)),
      new ClockService(),
    );

    const report = await verifier.verify();
    process.stdout.write(formatReport(report));
    return report.verified ? EXIT_OK : EXIT_BROKEN;
  } finally {
    await connection.close();
  }
}

/** The human-readable verdict. The JSON line is for tooling parsing the same output. */
function formatReport(report: AuditChainVerification): string {
  const verdict = report.verified
    ? `OK — ${report.eventsChecked} events checked, chain intact`
    : `BROKEN at sequence ${report.firstBrokenSequence}: ${report.reason}`;

  return `audit chain verification (${report.checkedAt})\n  ${verdict}\n${JSON.stringify(report)}\n`;
}

const EXIT_OK = 0;
const EXIT_BROKEN = 1;
const EXIT_ERROR = 2;
const DEFAULT_DB_NAME = 'reliancebank';

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`audit:verify could not run: ${String(error)}\n`);
    process.exitCode = EXIT_ERROR;
  },
);
