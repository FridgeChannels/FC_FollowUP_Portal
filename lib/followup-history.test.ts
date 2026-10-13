import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEncounter, communicationRoundId, stampCommunicationRound, taskRoundId, stampTaskRound, withoutTaskRound, notionWriteText, emptyFollowupHistory, hasFollowupHistory, encounterKeyContext } from './followup-history.ts';
const encounter = { id: 'exhibition:meeting-123', exhibitionId: 'exhibition-1', meetingAt: '2026-10-13T09:30:00+08:00', metBy: 'Ella', meetingNotes: '  Original notes\nWith exact spacing.  ' };
test('encounter validation preserves evidence and normalizes only the timestamp', () => {
  const result = parseEncounter(encounter);
  assert.equal(result.meetingNotes, encounter.meetingNotes);
  assert.equal(result.meetingAt, '2026-10-13T01:30:00.000Z');
  assert.deepEqual(result.keyChanges, []);
  assert.equal(result.historical, false);
});
test('stable identity, timezone and valid key-change categories are required', () => {
  for (const patch of [{ id: '' }, { meetingAt: '2026-10-13 09:30' }, { meetingAt: '2026-02-30T10:00:00Z' }, { meetingAt: '2026-10-13T24:00:00Z' }, { meetingAt: 'invalid' }, { keyChanges: [{ type: 'Chitchat', text: 'Nice to meet you' }] }, { keyChanges: [{ type: 'Interest', text: '' }] }, { metBy: '' }, { historical: 'yes' }]) {
    assert.throws(() => parseEncounter({ ...encounter, ...patch }));
  }
});
test('key changes retain their sources; missing source defaults to stable encounter identity', () => {
  const result = parseEncounter({ ...encounter, keyChanges: [{ type: 'Contact', text: 'New decision maker', source: 'Original paragraph 2' }, { type: 'Commitment', text: 'Send product information' }] });
  assert.equal(result.keyChanges[0].source, 'Original paragraph 2');
  assert.equal(result.keyChanges[1].source, encounter.id);
});
test('untrusted meeting links cannot inject a script or local URL', () => {
  for (const meetingRecordUrl of ['javascript:alert(1)', 'file:///private/data', 'http://example.com/meeting', '/relative']) assert.throws(() => parseEncounter({ ...encounter, meetingRecordUrl }));
  assert.equal(parseEncounter({ ...encounter, meetingRecordUrl: 'https://www.notion.so/meeting' }).meetingRecordUrl, 'https://www.notion.so/meeting');
});
test('communication stamping preserves provider payload and original round attribution', () => {
  const source = JSON.stringify({ quo: { callId: 'call-1' }, attachments: [{ url: 'https://example.com/a' }], followupRoundId: 'old-round' });
  assert.deepEqual(JSON.parse(stampCommunicationRound(source, 'new-round')), JSON.parse(source));
  assert.equal(communicationRoundId(stampCommunicationRound('{"emailOpen":true}', 'round-2')), 'round-2');
  assert.equal(stampCommunicationRound('historical non-json payload', 'round-2'), 'historical non-json payload');
  assert.equal(communicationRoundId('bad json'), null);
});
test('task round markers retain scheduling/call metadata without leaking into display', () => {
  const notes = 'Original task notes\n[LINKEDIN_COLD]metadata';
  const stamped = stampTaskRound(notes, 'round-1');
  assert.equal(taskRoundId(stamped), 'round-1');
  assert.equal(stampTaskRound(stamped, 'round-2'), stamped);
  assert.equal(withoutTaskRound(stamped), notes);
});
test('Notion write payload extraction does not erase attachments, Quo data or notes', () => {
  assert.equal(notionWriteText({ rich_text: [{ text: { content: '{"attachments":' } }, { text: { content: '[]}' } }] }), '{"attachments":[]}');
  assert.equal(notionWriteText({ type: 'rich_text', rich_text: [{ plain_text: 'Original notes' }] }), 'Original notes');
});
test('History is hidden until encounters, completed rounds or assignments make it useful', () => {
  assert.equal(hasFollowupHistory(emptyFollowupHistory()), false);
  assert.equal(hasFollowupHistory(emptyFollowupHistory(), 2), true);
  assert.equal(hasFollowupHistory(emptyFollowupHistory(), 0, 2), true);
  const history = { ...emptyFollowupHistory(), unreadEncounterCount: 1 };
  assert.equal(hasFollowupHistory(history), true);
});
test('relationship context preserves conflicting claims with their sources', () => {
  const history = { ...emptyFollowupHistory(), encounters: [
    { id: '1', brand_id: 'brand', exhibition_id: 'show', exhibition_name: 'SUPERZOO', round_id: null, meeting_at: '2026-08-10T00:00:00Z', met_by: 'Peter', meeting_notes: 'Budget not approved', key_changes: [{ type: 'Objection' as const, text: 'Budget not approved', source: 'notes-1' }], next_step: null, meeting_record_url: null, created_at: '' },
    { id: '2', brand_id: 'brand', exhibition_id: 'show-2', exhibition_name: 'Newtopia', round_id: null, meeting_at: '2026-09-10T00:00:00Z', met_by: 'Ella', meeting_notes: 'Budget approved', key_changes: [{ type: 'Interest' as const, text: 'Budget approved', source: 'notes-2' }], next_step: null, meeting_record_url: null, created_at: '' },
  ] };
  const context = encounterKeyContext(history);
  assert.match(context, /Budget not approved.*notes-1/);
  assert.match(context, /Budget approved.*notes-2/);
});
