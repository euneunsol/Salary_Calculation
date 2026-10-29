import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStoreName } from './storeForm';

test('공백 매장명을 거부한다', () => assert.ok(validateStoreName('   ')));
test('정상 매장명을 허용한다', () => assert.equal(validateStoreName('은은 카페'), null));
test('50자를 초과한 매장명을 거부한다', () => assert.ok(validateStoreName('가'.repeat(51))));
