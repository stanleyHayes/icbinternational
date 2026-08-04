/**
 * The console's complete navigation, in the order it is presented.
 *
 * Split across two files only because the list is long; this is the one import a screen
 * or a search should use, so nothing has to know which half a destination lives in.
 */

import type { NavSection } from './nav-model';
import { BACK_OFFICE_SECTIONS } from './sections-back-office';
import { FRONTLINE_SECTIONS } from './sections-frontline';

/** Every destination the operations console offers, before permissions are applied. */
export const NAV_SECTIONS: readonly NavSection[] = [...FRONTLINE_SECTIONS, ...BACK_OFFICE_SECTIONS];
