const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/roles.ts'), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

const mod = { exports: {} };
const factory = new Function('require', 'module', 'exports', transpiled);
factory(require, mod, mod.exports);

const { canAccessRoute, getVisibleNavigation, normalizeRole } = mod.exports;

const cases = [
  {
    name: 'Super Admin can access Users Management',
    check: () => canAccessRoute('Super Admin', '/users'),
    expected: true,
  },
  {
    name: 'Business Admin can access Settings',
    check: () => canAccessRoute('Business Admin', '/settings'),
    expected: true,
  },
  {
    name: 'Manager can access Dashboard',
    check: () => canAccessRoute('Manager', '/dashboard'),
    expected: true,
  },
  {
    name: 'Manager cannot access Settings',
    check: () => canAccessRoute('Manager', '/settings'),
    expected: false,
  },
  {
    name: 'Dispatcher can access Trips',
    check: () => canAccessRoute('Dispatcher', '/trips'),
    expected: true,
  },
  {
    name: 'Driver cannot access Users module',
    check: () => canAccessRoute('Driver', '/users'),
    expected: false,
  },
  {
    name: 'Support Staff can access Notifications',
    check: () => canAccessRoute('Support Staff', '/notifications'),
    expected: true,
  },
  {
    name: 'Viewer can access Reports',
    check: () => canAccessRoute('Viewer', '/reports'),
    expected: true,
  },
  {
    name: 'Unknown role uses the least privileged display role',
    check: () => normalizeRole('Unknown Role'),
    expected: 'Viewer',
  },
  {
    name: 'Manager sees only permitted primary nav items',
    check: () => getVisibleNavigation('Manager').every(item => canAccessRoute('Manager', item.href)) && !getVisibleNavigation('Manager').some(item => item.href === '/users' || item.href === '/settings'),
    expected: true,
  },
  { name: 'Driver has a complete personal workspace navigation', check: () => getVisibleNavigation('Driver').map(item => item.href), expected: ['/driver', '/driver/trips', '/driver/vehicles', '/settings/profile', '/settings/security/password'] },
  { name: 'Viewer can read vehicle pages', check: () => canAccessRoute('Viewer', '/vehicles'), expected: true },
  { name: 'Dispatcher cannot access finance pages', check: () => canAccessRoute('Dispatcher', '/payments'), expected: false },
  { name: 'Accountant can access invoice pages', check: () => canAccessRoute('Accountant', '/invoices'), expected: true },
  { name: 'Unknown role cannot access operational pages', check: () => canAccessRoute('Unknown Role', '/trips'), expected: false },
];

console.log('Running role and access validation tests...');
for (const testCase of cases) {
  const actual = testCase.check();
  try {
    assert.deepStrictEqual(actual, testCase.expected);
    console.log(`✔ ${testCase.name}`);
  } catch (error) {
    console.error(`✘ ${testCase.name}`);
    console.error('Expected:', testCase.expected);
    console.error('Actual:', actual);
    process.exitCode = 1;
  }
}

if (process.exitCode === 1) {
  console.error('\nSome access tests failed.');
  process.exit(1);
}

console.log('\nAll role access checks passed.');
