import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidPassword } from './password';

test('영문, 숫자, 특수문자를 포함한 8자 이상 비밀번호를 허용한다', () => {
  assert.equal(isValidPassword('Password1!'), true);
});

test('8자 미만 비밀번호를 거부한다', () => {
  assert.equal(isValidPassword('Pass1!'), false);
});

test('영문, 숫자, 특수문자 중 하나라도 없으면 거부한다', () => {
  assert.equal(isValidPassword('비밀번호12!'), false);
  assert.equal(isValidPassword('Password!'), false);
  assert.equal(isValidPassword('Password12'), false);
});
