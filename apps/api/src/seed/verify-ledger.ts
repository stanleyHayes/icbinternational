import { runLedgerVerificationCli } from '../modules/ledger/verification/verify-ledger.runner.js';

void runLedgerVerificationCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
