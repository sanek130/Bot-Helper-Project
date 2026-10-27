import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWarn } from '../src/services/userService.js';

test('три варна снимают роль и закрывают путь в админы', () => {
  const admin = { role: 'admin', warns: 0, adminBanned: false };

  applyWarn(admin);
  applyWarn(admin);
  assert.equal(admin.role, 'admin');
  assert.equal(admin.adminBanned, false);
  assert.equal(admin.warns, 2);

  const result = applyWarn(admin);
  assert.equal(result.banned, true);
  assert.equal(admin.role, 'user');
  assert.equal(admin.adminBanned, true);
  assert.equal(admin.warns, 3);
});

test('варны не растут выше трёх и сохраняются', () => {
  const admin = { role: 'admin', warns: 3, adminBanned: false };
  applyWarn(admin);
  assert.equal(admin.warns, 3);
  assert.equal(admin.adminBanned, true);
});
