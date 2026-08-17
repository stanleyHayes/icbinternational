#!/usr/bin/env node
/**
 * Route-coverage gate — enforces `agent_plan.md` M-09.
 *
 * The contract declares a route; a controller has to serve it. Nothing checked that, and the
 * consequence was 77 declared routes with no implementation while every workstream reported
 * green and `pnpm verify` passed. The front ends could not reveal it either: they were built
 * against `@reliance/mocks`, which implements the whole contract, so a screen looked finished
 * whether or not anything answered it.
 *
 * This closes that seam. It is deliberately static — no database, no boot, no ports — so it can
 * run in the cheapest CI job and on a laptop with nothing else up.
 *
 * ## Waivers
 *
 * A route that is genuinely deferred goes in `scripts/route-waivers.json` with a reason and a
 * date. That makes deferral a decision somebody wrote down rather than an omission nobody
 * noticed. A waiver for a route that *is* now implemented is also an error: a stale waiver is
 * how a gate quietly stops gating.
 *
 * Usage:  node scripts/check-route-coverage.mjs [--json] [--update-waivers]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROUTES_FILE = join(ROOT, 'packages/contracts/src/common/routes.ts');
const CONTROLLER_ROOT = join(ROOT, 'apps/api/src');
const MAIN_FILE = join(ROOT, 'apps/api/src/main.ts');
const WAIVER_FILE = join(ROOT, 'scripts/route-waivers.json');

/** `/loans/:id/repay` and `/loans/:loanId/repay` are the same route. Compare them that way. */
function normalise(path) {
  return path.replace(/:\w+/g, ':p').replace(/\$\{[^}]+\}/g, ':p');
}

/**
 * Every route the contract declares, as `group.name` → path.
 *
 * Both forms matter: `disputes: '/disputes'` and `dispute: (id) => `/disputes/${id}``. The
 * template form is what a parameterised route looks like, and skipping it would let every
 * `/:id` route go unchecked — which is most of the write surface.
 *
 * Groups nest (`admin.chat.conversations`), so the group is a stack keyed on indent, not a
 * single variable: a flat variable silently re-keys every route after a nested group, which
 * is how `admin.chat` once swallowed the whole back half of the admin surface.
 */
function declaredRoutes() {
  const source = readFileSync(ROUTES_FILE, 'utf8');
  const routes = new Map();
  const stack = [];

  for (const line of source.split('\n')) {
    const closing = /^(\s*)\}/.exec(line);
    if (closing) {
      while (stack.length > 0 && stack[stack.length - 1].indent >= closing[1].length) {
        stack.pop();
      }
    }

    const opening = /^(\s*)(\w+):\s*\{/.exec(line);
    if (opening) {
      stack.push({ name: opening[2], indent: opening[1].length });
      continue;
    }

    const entry = /^(\s*)(\w+):\s*(?:\([^)]*\)\s*=>\s*)?[`']([^`']+)[`']/.exec(line);
    if (entry && entry[3].startsWith('/')) {
      const key = [...stack.map((frame) => frame.name), entry[2]].join('.');
      routes.set(key, normalise(entry[3]));
    }
  }

  return routes;
}

function* walk(directory, suffix = '.controller.ts') {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) yield* walk(path, suffix);
    else if (entry.endsWith(suffix)) yield path;
  }
}

/**
 * Every controller class named in some module's `controllers: [...]`.
 *
 * A decorator is not a route. Nest serves a controller only if a module lists it and that
 * module is reachable from `AppModule`, and nothing checked that: this gate counted a route
 * the moment it saw `@Get(...)` in a file. Seven admin controllers sat in a module that the
 * root never imported, and coverage reported them as served while every one of them 404'd.
 *
 * Reachability is approximated by "listed in any module", not by walking the import graph
 * from `AppModule`. The stricter check needs a real module resolver; this one catches the
 * failure that actually happened — a controller written and never registered — and stays a
 * text scan that runs in the cheapest CI job.
 */
function registeredControllers() {
  const registered = new Set();

  for (const file of walk(CONTROLLER_ROOT, '.module.ts')) {
    const source = readFileSync(file, 'utf8');
    const block = /controllers:\s*\[([^\]]*)\]/s.exec(source);
    if (!block) continue;
    for (const name of block[1].matchAll(/\b([A-Z]\w*Controller)\b/g)) registered.add(name[1]);
  }

  return registered;
}

/**
 * Every route the controllers actually serve.
 *
 * Three binding styles are in use and all three have to be resolved, because missing one
 * under-reports coverage and produces a false failure that teaches people to ignore this script:
 *
 *   @Get(routes.support.disputes)      — bound straight to the contract, the preferred form
 *   @Get(DISPUTE_ROUTE)                — bound to a local constant that holds a contract route
 *   @Get('balance')                    — a literal, joined to the @Controller prefix
 */
function implementedRoutes(declared, unregistered) {
  const served = new Set();
  const registered = registeredControllers();

  for (const file of walk(CONTROLLER_ROOT)) {
    const source = readFileSync(file, 'utf8');

    // A file can declare several controllers — `admin-stubs.controller.ts` holds three. If
    // none of them is registered anywhere, nothing in this file is reachable and its routes
    // are not coverage, whatever its decorators say.
    const declaredHere = [...source.matchAll(/export class (\w*Controller)\b/g)].map((m) => m[1]);
    if (declaredHere.length > 0 && !declaredHere.some((name) => registered.has(name))) {
      unregistered.push({ file: relative(ROOT, file), classes: declaredHere });
      continue;
    }

    const local = new Map();
    for (const match of source.matchAll(/const\s+(\w+)\s*=\s*routes\.([\w.]+)/g)) {
      const path = declared.get(match[2]);
      if (path) local.set(match[1], path);
    }

    const prefixMatch = /@Controller\(\s*'([^']*)'/.exec(source);
    const prefix = prefixMatch ? prefixMatch[1] : '';

    for (const match of source.matchAll(/@(?:Get|Post|Patch|Put|Delete|Sse)\(\s*([^)\n]*)/g)) {
      const argument = match[1].trim();
      const identifier = argument.replace(/[`'"]/g, '').split('(')[0];

      const viaContract = /^routes\.([\w.]+)/.exec(argument);
      if (viaContract) {
        const path = declared.get(viaContract[1]);
        if (path) served.add(path);
        continue;
      }

      if (local.has(identifier)) {
        served.add(local.get(identifier));
        continue;
      }

      if (argument.startsWith("'") || argument.startsWith('"')) {
        const literal = argument.replace(/['"]/g, '');
        served.add(normalise('/' + [prefix, literal].filter(Boolean).join('/')));
      } else if (argument === '' || argument.startsWith(')')) {
        served.add(normalise('/' + prefix));
      }
    }
  }

  for (const path of implementedOutsideControllers()) served.add(path);

  return served;
}

/** Routes mounted outside controllers, e.g. Swagger's `/docs`. */
function implementedOutsideControllers() {
  const served = new Set();
  const source = readFileSync(MAIN_FILE, 'utf8');

  for (const match of source.matchAll(/SwaggerModule\.setup\(\s*['"`]\/?([^'"`]+)['"`]/g)) {
    served.add(normalise(`/${match[1]}`));
  }

  return served;
}

function readWaivers() {
  try {
    return JSON.parse(readFileSync(WAIVER_FILE, 'utf8'));
  } catch {
    return { waived: [] };
  }
}

const declared = declaredRoutes();
/** Controller files no module lists. Reported separately: not missing routes, dead code. */
const unregistered = [];
const served = implementedRoutes(declared, unregistered);
const waivers = readWaivers();
const waived = new Map(waivers.waived.map((entry) => [entry.route, entry]));

const paths = [...new Set(declared.values())].sort();
const missing = paths.filter((path) => !served.has(path));
const unwaived = missing.filter((path) => !waived.has(path));
const stale = [...waived.keys()].filter((path) => served.has(path)).sort();

if (process.argv.includes('--update-waivers')) {
  const today = new Date().toISOString().slice(0, 10);
  const next = missing.map(
    (route) =>
      waived.get(route) ?? { route, since: today, reason: 'Not yet built — see agent_plan.md §0.1' },
  );
  writeFileSync(WAIVER_FILE, `${JSON.stringify({ waived: next }, null, 2)}\n`);
  console.log(`Waiver list rewritten: ${next.length} route(s) deferred.`);
  process.exit(0);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ declared: paths.length, missing, unwaived, stale, unregistered }, null, 2));
  process.exit(unwaived.length === 0 && stale.length === 0 && unregistered.length === 0 ? 0 : 1);
}

const implemented = paths.length - missing.length;
console.log(
  `route coverage: ${implemented}/${paths.length} declared routes implemented` +
    (missing.length > 0 ? ` · ${missing.length} outstanding (${waived.size} waived)` : ''),
);

if (unregistered.length > 0) {
  console.error(
    `\n✗ ${unregistered.length} controller file(s) no module registers. Nest will not serve\n` +
      `  them, so their routes 404 however complete they look:\n`,
  );
  for (const entry of unregistered) {
    console.error(`    ${entry.file}  (${entry.classes.join(', ')})`);
  }
  console.error(
    `\n  Add them to a module's \`controllers: [...]\`, and make sure that module is\n` +
      `  imported by \`AppModule\`. Or delete them.\n`,
  );
}

if (stale.length > 0) {
  console.error(`\n✗ ${stale.length} waiver(s) for route(s) that now exist. Delete them:\n`);
  for (const route of stale) console.error(`    ${route}`);
}

if (unwaived.length > 0) {
  console.error(`\n✗ ${unwaived.length} declared route(s) with no controller:\n`);
  for (const route of unwaived) console.error(`    ${route}`);
  console.error(
    `\n  Either implement them, or record the deferral with a reason in\n` +
      `  ${relative(ROOT, WAIVER_FILE)}. A route the contract promises and nothing serves is\n` +
      `  a screen that fails in front of a customer.\n`,
  );
}

process.exit(unwaived.length === 0 && stale.length === 0 && unregistered.length === 0 ? 0 : 1);
