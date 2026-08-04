/**
 * The icon set's contract is behavioural, not visual: every glyph is decorative (`aria-hidden`),
 * inherits its colour from the parent (`currentColor`), and takes its size from `className` so a
 * component can scale it without reaching for inline styles.
 */

import { render, screen } from '@testing-library/react';
import { type ComponentType } from 'react';

import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  InfoIcon,
  MinusIcon,
  SortIcon,
  type IconProps,
} from './icons.js';

const ALL_ICONS: ReadonlyArray<readonly [string, ComponentType<IconProps>]> = [
  ['AlertTriangleIcon', AlertTriangleIcon],
  ['ArrowDownIcon', ArrowDownIcon],
  ['ArrowUpIcon', ArrowUpIcon],
  ['CheckIcon', CheckIcon],
  ['ChevronDownIcon', ChevronDownIcon],
  ['ChevronLeftIcon', ChevronLeftIcon],
  ['ChevronRightIcon', ChevronRightIcon],
  ['CloseIcon', CloseIcon],
  ['InfoIcon', InfoIcon],
  ['MinusIcon', MinusIcon],
  ['SortIcon', SortIcon],
];

describe('icon set', () => {
  it.each(ALL_ICONS)('%s renders a decorative, colour-inheriting svg', (name, Icon) => {
    const { container } = render(<Icon data-testid={name} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it.each(ALL_ICONS)('%s carries no hard-coded colour', (name, Icon) => {
    const { container } = render(<Icon data-testid={name} />);

    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('lets a caller className win size conflicts, so components can scale icons', () => {
    render(<CheckIcon className="text-credit size-6" data-testid="icon" />);

    expect(screen.getByTestId('icon')).toHaveClass('size-6', 'text-credit', 'shrink-0');
    expect(screen.getByTestId('icon')).not.toHaveClass('size-4');
  });

  it('passes svg props through to the element', () => {
    render(<CloseIcon data-testid="icon" strokeWidth={2} />);

    expect(screen.getByTestId('icon')).toHaveAttribute('stroke-width', '2');
  });
});
