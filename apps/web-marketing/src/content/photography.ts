/**
 * The photography, in one place.
 *
 * Every file lives in `public/photography`, so each entry carries its intrinsic size:
 * `next/image` needs both dimensions up front to reserve the box before the bytes arrive,
 * and a rate table that jumps down the page as a hero photo loads is the kind of thing a
 * customer reads as the site being unreliable.
 *
 * The set was shot to one brief — overcast British daylight, muted palette, unposed, no
 * eye contact with the camera — so the pages read as one commissioned shoot rather than a
 * bundle of stock. Anything added later has to match that or it will show.
 *
 * **Alt text is deliberately empty at every use site.** These are editorial photographs:
 * they carry mood, not information, and every fact they gesture at is already in the
 * heading or the copy beside them. A portrait sits next to the person's name in the same
 * caption, so describing it again only makes a screen reader say the name twice. The
 * descriptions below are for whoever maintains the set, not for the page.
 */

export interface Photograph {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

const photograph = (src: string, width: number, height: number): Photograph => ({
  src: `/photography/${src}`,
  width,
  height,
});

/** Customer portraits. Keyed to the names in `./testimonials`. */
export const PORTRAITS = {
  /** Helena Vaughan — on a Bristol street of painted terraces. */
  helenaVaughan: photograph('testimonial-helena-vaughan.jpg', 800, 800),
  /** Idris Bello — in the doorway of his Manchester print workshop. */
  idrisBello: photograph('testimonial-idris-bello.jpg', 800, 800),
  /** Ruth McAllister — on a Glasgow tenement street. */
  ruthMcAllister: photograph('testimonial-ruth-mcallister.jpg', 800, 800),
  /** Daniel Osei — at the table in a Leeds front room. */
  danielOsei: photograph('testimonial-daniel-osei.jpg', 800, 800),
} as const;

/** Scene photography, one per page that earns one. */
export const SCENES = {
  /** Home — a woman on a bench in a covered Victorian market hall. */
  home: photograph('hero-market-hall.jpg', 900, 1200),
  /** Personal — two people on a high street of painted terraces. */
  personal: photograph('personal-high-street.jpg', 1400, 1400),
  /** Business — a café owner at her counter after service. */
  business: photograph('business-cafe.jpg', 1600, 1066),
  /** Savings — a couple working something out at a kitchen table. */
  savings: photograph('savings-kitchen-table.jpg', 1600, 1066),
  /** Borrowing — a tradesman beside a half-finished van. */
  loans: photograph('loans-van.jpg', 1600, 1066),
  /** About — a branch counter, mid-morning. */
  about: photograph('about-branch.jpg', 1600, 1066),
  /** Careers — four colleagues around one screen. */
  careers: photograph('careers-team.jpg', 1600, 1066),
} as const;
