/**
 * @yapper/core
 * Local Agreement streaming chunk alignment.
 * Compares hypotheses across overlapping audio windows to emit stable words
 * without hallucination loops or repeated words.
 */

export class LocalAgreementChunker {
  private committedWords: string[] = [];
  private lastHypothesis: string[] = [];

  /**
   * Process a newly recognized hypothesis string from the current audio chunk.
   * Compares overlapping words with the previous hypothesis.
   */
  public step(hypothesisText: string): { committed: string; interim: string } {
    const rawWords = hypothesisText
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (rawWords.length === 0) {
      return {
        committed: this.committedWords.join(' '),
        interim: '',
      };
    }

    let matchCount = 0;
    const minLen = Math.min(this.lastHypothesis.length, rawWords.length);

    while (
      matchCount < minLen &&
      this.normalize(this.lastHypothesis[matchCount]) === this.normalize(rawWords[matchCount])
    ) {
      matchCount++;
    }

    // When two consecutive hypotheses agree on words at the start, commit them
    if (matchCount > 0) {
      const stableWords = rawWords.slice(0, matchCount);
      this.committedWords.push(...stableWords);
      this.lastHypothesis = rawWords.slice(matchCount);
    } else {
      this.lastHypothesis = rawWords;
    }

    return {
      committed: this.committedWords.join(' '),
      interim: this.lastHypothesis.join(' '),
    };
  }

  /** Complete the session and flush all remaining uncommitted words */
  public flush(): string {
    if (this.lastHypothesis.length > 0) {
      this.committedWords.push(...this.lastHypothesis);
      this.lastHypothesis = [];
    }
    const full = this.committedWords.join(' ').trim();
    this.committedWords = [];
    return full;
  }

  public reset(): void {
    this.committedWords = [];
    this.lastHypothesis = [];
  }

  private normalize(word: string): string {
    return word.toLowerCase().replace(/[^a-z0-9]/gi, '');
  }
}
