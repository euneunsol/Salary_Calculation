import assert from 'node:assert/strict';
import test from 'node:test';
import { authErrorMessage, connectionErrorMessage, withAuthTimeout } from './authError';

test('unreachable auth server is distinct from invalid credentials', () => {
  assert.equal(authErrorMessage(new TypeError('Failed to fetch')), connectionErrorMessage);
  assert.equal(authErrorMessage({ code: 'invalid_credentials' }), '이메일 또는 비밀번호를 확인해주세요.');
  assert.equal(authErrorMessage({ code: 'email_not_confirmed' }), '이메일 인증을 완료한 후 로그인해주세요.');
});

test('auth initialization stops waiting when the SDK never settles', async () => {
  await assert.rejects(withAuthTimeout(new Promise(() => {}), 5), {
    message: connectionErrorMessage,
  });
});

test('auth timeout preserves successful results and original failures', async () => {
  assert.equal(await withAuthTimeout(Promise.resolve('session'), 100), 'session');
  const error = new Error('auth failed');
  await assert.rejects(withAuthTimeout(Promise.reject(error), 100), (caught) => caught === error);
});
