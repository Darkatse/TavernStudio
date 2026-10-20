import { describe, expect, test } from '@rstest/core';
import { DataDirectory } from './data-directory';
import { createReplay } from './replay';

const encoder = new TextEncoder();

describe('createReplay', () => {
  test('a Session reopened on the same data plays on from where it stopped', () => {
    const replies = [{ content: 'one' }, { content: 'two' }, { content: 'three' }];
    const data = new DataDirectory([['replay.json', encoder.encode(JSON.stringify({ replies }))]]);
    const before = createReplay(data);
    before.next();
    before.next();
    expect(createReplay(data).next()).toEqual({ content: 'three' });
  });
});
