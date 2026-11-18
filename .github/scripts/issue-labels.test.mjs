import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelChanges } from './issue-labels.mjs';

test('labels the phase, priority and type on a new implementation issue', () => {
  assert.deepEqual(labelChanges('[구현][1차 후속][P1][데이터] 원장 연결', []), {
    add: ['차수:1차', '우선순위:P1', '유형:구현'], remove: [],
  });
});

test('replaces stale managed labels and preserves unrelated labels', () => {
  const current = ['차수:1차', '우선순위:P2', '유형:설계', 'bug', 'enhancement', 'accessibility'];
  assert.deepEqual(labelChanges('[구현][3차][P0] 읽기 어댑터', current), {
    add: ['차수:3차', '우선순위:P0', '유형:구현'],
    remove: ['차수:1차', '우선순위:P2', '유형:설계'],
  });
});

test('handles legacy design tags, cross-cutting work and multiple phases', () => {
  assert.deepEqual(labelChanges('[HMD-019][P1][검증] 브라우저 QA 기준', []).add,
    ['차수:공통', '우선순위:P1', '유형:설계']);
  assert.deepEqual(labelChanges('[HMD-016][P0][1·2차] 어댑터', ['차수:공통']).add,
    ['차수:1차', '차수:2차', '우선순위:P0', '유형:설계']);
});

test('labels a validation task scheduled as a first-phase extension', () => {
  assert.deepEqual(labelChanges('[검증][1차 선택 확장][P2] 안내 확인', []).add,
    ['차수:1차', '우선순위:P2', '유형:검증']);
});

test('does not guess missing or conflicting metadata or parse tags in the summary', () => {
  assert.deepEqual(labelChanges('일반 이슈 [P0] [1차]', ['차수:2차', '우선순위:P1']),
    { add: [], remove: [] });
  assert.deepEqual(labelChanges('[검증][설계][P0][P1] 모호한 태그', ['우선순위:P2', '유형:구현']),
    { add: [], remove: [] });
});

test('is idempotent for an already-labeled issue', () => {
  assert.deepEqual(labelChanges('[검증][4차][P2] 이관 비교', ['차수:4차', '우선순위:P2', '유형:검증']),
    { add: [], remove: [] });
});
