import { ConsoleSplash } from '@/components/shell/console-splash';

/**
 * The console splash, shown while the root segment resolves the operator's session and
 * permissions — which is what decides how much of the navigation even renders.
 */
export default function Loading() {
  return <ConsoleSplash label="Checking your access" />;
}
