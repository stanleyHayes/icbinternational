/**
 * The profile lane's public surface: the module, and nothing else.
 *
 * Deliberately bare. Everything this lane owns is either a customer's sealed personal
 * details or the machinery for handing them all over at once, and there is no other module
 * that should be able to reach either. The day one legitimately needs a fact from here —
 * "is this customer tax-resident in the UK?" — the right answer is a narrow read-only port
 * shaped like that question, in the manner of `KycTierPort`, not an exported store.
 */

export { ProfileModule } from './profile.module.js';
