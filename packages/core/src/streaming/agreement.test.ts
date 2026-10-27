import { describe, it, expect, beforeEach } from 'vitest';
import { LocalAgreementChunker } from './agreement';

describe('LocalAgreementChunker', () => {
  let chunker: LocalAgreementChunker;

  beforeEach(() => {
    chunker = new LocalAgreementChunker();
  });

  it('handles empty input cleanly', () => {
    const result = chunker.step('');
    expect(result).toEqual({ committed: '', interim: '' });
  });

  it('sets initial words as interim', () => {
    const result = chunker.step('hello world');
    expect(result.committed).toBe('');
    expect(result.interim).toBe('hello world');
  });

  it('commits words when consecutive hypotheses agree on prefix', () => {
    // Step 1: hypothesis arrives
    chunker.step('the quick brown fox');

    // Step 2: next chunk agrees on "the quick brown" and adds "jumps"
    const result = chunker.step('the quick brown jumps');

    expect(result.committed).toBe('the quick brown');
    expect(result.interim).toBe('jumps');
  });

  it('flushes uncommitted words when speech completes', () => {
    chunker.step('hello my beautiful');
    chunker.step('hello my dear friend');

    // "hello my" was agreed on and committed
    // "dear friend" is in interim
    const flushed = chunker.flush();
    expect(flushed).toBe('hello my dear friend');
  });

  it('resets state completely', () => {
    chunker.step('some words');
    chunker.reset();
    const result = chunker.step('');
    expect(result).toEqual({ committed: '', interim: '' });
  });
});
