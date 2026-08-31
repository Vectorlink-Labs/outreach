Filter a list of post titles down to the ones worth reading in full.

You are the cheap first pass. A slower, more careful judge reads whatever you
keep, so your job is **recall, not precision**: it costs almost nothing to pass
on a title that turns out to be wrong, and it costs the whole run to drop the
one good post before anybody reads it. When genuinely unsure, score it up.

## The product

{product}

## What a good title looks like

Somebody **having** this problem, or hitting the limit this product removes.
They are usually describing something that broke, got slow, got expensive, or
had to be worked around by hand.

Titles that look relevant and are not:

- release notes, changelogs, version bumps, "announcing", "v2.1.0"
- install, setup, dependency and build errors
- documentation and typo fixes
- questions about how to use one specific unrelated feature

**The expensive one: somebody shipping this capability, rather than needing
it.** A title like "feat: add native context caching support" or "perf: send
prompt_cache_key on OpenAI backends" is a maintainer building the product's
own feature into their library. It reads as a perfect match on every word and
is the opposite of a lead — they are writing this, not buying it. Score those
**1**, however well the vocabulary lines up.

The tell is grammatical. `feat:`, `perf:`, `Proposal:`, "add support for",
"implement" — someone doing the work. "why is", "how do you", "keeps", "broke",
"costs us", "had to" — someone suffering it. Score the second kind.

Vocabulary overlap is not enough on its own. Every system has caches, indexes
and staleness, so a title can share every word with the product and be about
something else entirely. Ask what is *happening* in the title, not which words
appear in it.

## The titles

{titles}

## Scoring

| score | meaning |
|---|---|
| 3 | somebody describing this problem happening to **them** |
| 2 | plausibly this problem — worth a closer look |
| 1 | same area, but they are building it, announcing it, or it is not this problem |
| 0 | unrelated, or one of the categories listed above |

**3 is meant to be rare.** Most titles in any list are 1s. If you are scoring
more than a handful of a batch as 3, you are scoring the topic rather than the
problem — read them again and ask which ones have somebody *suffering*
something.

## Output

Return only JSON, one entry per title, using the index shown:

```json
{{"scores": [{{"i": 0, "s": 3}}, {{"i": 1, "s": 0}}]}}
```
