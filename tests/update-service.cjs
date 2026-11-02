const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const old = 'a'.repeat(40), latest = 'b'.repeat(40);
const js = ts.transpileModule(fs.readFileSync('src/app/update.service.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
}).outputText;
function setup(commit = old, desktop) {
  const requests = [], navigations = [];
  let remote = latest, fail = false;
  const ctx = {
    exports: {}, URL, AbortController, setTimeout, clearTimeout,
    require: name => name === '@angular/core' ? { Injectable: () => c => c } : { default: { commit } },
    window: { stundenplanDesktop: desktop, location: {
      origin: 'https://freddy-hubgit.github.io', pathname: '/stundenplan-11bguti/',
      search: '?v=' + latest, replace: url => navigations.push(url)
    } },
    fetch: async url => {
      requests.push(url);
      if (fail) throw Error('offline');
      return { ok: true, json: async () => ({ commit: remote }) };
    }
  };
  vm.runInNewContext(js, ctx);
  return { service: new ctx.exports.UpdateService({ run: fn => fn() }), requests, navigations,
    setRemote: value => { remote = value; }, offline: () => { fail = true; } };
}
(async () => {
  const test = setup();
  assert.equal(await test.service.check(), true, 'URL version must not hide an older running build');
  assert.equal(test.service.availableCommit, latest);
  assert.match(test.requests[0], /\/assets\/version.json\?t=/);
  await test.service.apply();
  assert.equal(test.navigations.length, 1);
  test.setRemote(old);
  assert.equal(await test.service.check(), false);
  assert.equal(test.service.availableCommit, null);
  await test.service.apply();
  assert.equal(test.navigations.length, 1, 'no install without available update');
  test.offline();
  assert.equal(await test.service.check(), false);
  assert.match(test.service.statusMessage, /nicht geprüft/);
  assert.equal(test.service.checking, false);
  assert.equal(test.requests.some(url => url.includes('api.github.com')), false, 'unpublished source commits must not advertise updates');
  const invalid = setup(); invalid.setRemote('not-a-commit');
  assert.equal(await invalid.service.check(), false);
  assert.match(invalid.service.statusMessage, /nicht geprüft/);
  const calls = [];
  const desktop = setup(old, { checkUpdate: async options => {
    calls.push(options);
    return options ? { available: true, commit: latest } : { updated: true, commit: latest };
  } });
  assert.equal(await desktop.service.check(), true);
  assert.equal(calls[0].checkOnly, true);
  assert.equal(desktop.navigations.length, 0, 'check must not navigate');
  await desktop.service.apply();
  assert.equal(calls.length, 2);
  assert.equal(calls[1], undefined);
  assert.equal(desktop.service.availableCommit, null);
  const failed = setup(old, { checkUpdate: async () => ({ error: 'offline' }) });
  assert.equal(await failed.service.check(), false);
  assert.match(failed.service.statusMessage, /nicht geprüft/);
  assert.equal(failed.service.availableCommit, null);
  console.log('PASS update service: build identity, deployed version path, offline and invalid responses, guarded installation, desktop check/apply');
})().catch(error => { console.error(error); process.exitCode = 1; });
