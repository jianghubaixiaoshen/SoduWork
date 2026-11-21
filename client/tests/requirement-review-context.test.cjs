'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const review = require('../core/requirement-review-context');

test('review history retains full business text and real timestamps without exposing identifiers', () => {
  const timeline = { schemaVersion: 1, rows: [
    { id: 'private-requirement-id', kind: 'requirement', at: null, text: 'Write 400 words.' },
    { id: 'private-dispatch-id', kind: 'supplement', at: '2026-11-15T01:00:00Z', text: 'Write 200 words.' },
    { id: 'private-decision-id', kind: 'rework', at: '2026-11-15T02:00:00Z', text: 'Write 300 words.' },
    { kind: 'supplement', at: '2026-11-15T03:00:00Z', text: 'Keep it to 250 words.' },
  ] };
  const text = review.prompt(timeline);
  assert.ok(text.indexOf('Write 400') < text.indexOf('Write 200'));
  assert.ok(text.indexOf('Write 200') < text.indexOf('Write 300'));
  assert.ok(text.indexOf('Write 300') < text.indexOf('Keep it'));
  assert.match(text, /原始需求.*时间未记录/);
  assert.match(text, /真实记录时间最新/);
  assert.match(text, /时间相同或未记录/);
  assert.match(text, /不能改变.*验收权限/);
  assert.match(text, /不得静默漏掉检查项/);
  assert.doesNotMatch(review.render(timeline), /private-/);
});

test('a generated acceptance template never becomes a new instruction by being sent again', () => {
  const draft = '【自动验收】\n\nWrite 400 words.\n\nOlder history.';
  assert.equal(review.instruction(draft, { acceptanceDraft: draft }), '');
  const requested = { acceptanceDraft: draft, acceptanceInstruction: 'Check the final paragraph.' };
  const note = review.instruction(draft, requested);
  assert.match(note, /Check the final paragraph/);
  assert.doesNotMatch(note, /400 words|Older history/);
  const appended = review.instruction(draft + '\n\nAlso check spelling.', requested);
  assert.match(appended, /Check the final paragraph/);
  assert.match(appended, /Also check spelling/);
  assert.doesNotMatch(appended, /400 words/);
  const edited = review.instruction(draft.replace('400', '250'), requested);
  assert.match(edited, /编辑后的验收草稿/);
  assert.match(edited, /引用内容仍按原记录时间/);
  assert.doesNotMatch(edited, /Check the final paragraph/);
});

test('legacy generated drafts and withheld execution context cannot silently appear complete', () => {
  assert.match(review.instruction('【验收分析】\nPrevious description'), /历史引用/);
  assert.match(review.instruction('Use the corrected title.'), /本轮验收人新增说明/);
  const prompt = review.prompt({ schemaVersion: 1, executionContextIncluded: false,
    rows: [{ kind: 'requirement', text: 'Public content' }] });
  assert.match(prompt, /缺失材料不能视作没有修改意见/);
  assert.equal(review.render({ schemaVersion: 2, rows: [] }), '');
});
