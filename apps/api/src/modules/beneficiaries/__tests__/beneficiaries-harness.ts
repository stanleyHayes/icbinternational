import { type ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { frozenClock } from '../../accounts/__tests__/accounts-harness.js';
import { InMemoryAccountStore } from '../../accounts/index.js';
import { BeneficiaryService } from '../beneficiary.service.js';
import { InMemoryBeneficiaryStore } from '../in-memory-beneficiary.store.js';
import { PayeeResolverService } from '../payee-resolver.service.js';
import { PayeeTrustService } from '../payee-trust.service.js';
import { InMemoryPayeeDirectory } from '../ports/in-memory-payee-directory.js';
import { ResolverPayeeNameAdapter } from '../ports/resolver-payee-name.adapter.js';

/**
 * The beneficiaries lane over in-memory stores.
 *
 * Only the two stores and the directory are fakes; the resolver, the name check, the
 * cooling-off rule and the uniqueness contract are the shipped implementations. A payee
 * saved in these tests goes through exactly the code a payee saved in production does.
 */
export interface BeneficiariesRig {
  accounts: InMemoryAccountStore;
  store: InMemoryBeneficiaryStore;
  directory: InMemoryPayeeDirectory;
  payees: PayeeResolverService;
  beneficiaries: BeneficiaryService;
  trust: PayeeTrustService;
  clock: ClockService;
}

export function beneficiariesRig(): BeneficiariesRig {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock();
  const directory = new InMemoryPayeeDirectory();
  const payees = new PayeeResolverService(accounts, directory);
  const store = new InMemoryBeneficiaryStore(new IdGenerator());

  const beneficiaries = new BeneficiaryService(store, new ResolverPayeeNameAdapter(payees), clock);

  return {
    accounts,
    store,
    directory,
    payees,
    beneficiaries,
    trust: new PayeeTrustService(beneficiaries, clock),
    clock,
  };
}
