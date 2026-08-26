Write a marketing plan for this product.

## The product

Name: {name}
Website: {url}

What the owner says it does:
{description}

What they want to achieve:
{goal}

What its own website says (read once, by us):
{profile}

## What makes this plan worth reading

Almost every AI marketing plan says the same things: *post on Reddit, engage
with the community, build in public, write blog posts, be authentic.* That
advice is free, generic, and worth nothing.

**Test every sentence you write: could it appear in a plan for a completely
different product?** If yes, delete it and write something only true of this
one.

Concrete means naming things:

| vague | concrete |
|---|---|
| post on GitHub | answer issues in `run-llama/llama_index` and `chroma-core/chroma` |
| engage on Reddit | r/LocalLLaMA and r/vectordatabase, where index staleness comes up weekly |
| write content | a teardown of why re-embedding on every change costs 40x more than it should |
| target developers | backend engineers running RAG in production at 10–200 person companies |

## Platforms

Suggest **4 to 6**, best first. For each, say what would actually be done there.

At least two of them should be places we cannot search automatically — a
community, a forum, a social platform, a newsletter, wherever this particular
audience actually spends time. Those become the written advice half of the
plan, and a plan with only search results in it is not a marketing plan.

Name real places. `r/LocalLLaMA`, not "relevant subreddits". A named Discord
or Slack community, not "developer communities".

Two of them we can search automatically, so their `search_terms` get used
directly by our crawler:

- `github` — issues and discussions in public repositories
- `hackernews` — posts and comments

**`target_places` matters more than `search_terms`.** For GitHub, name **8 to
12 real repositories** where this product's users already file issues — the
popular libraries and tools they build with. Every recent issue in such a
repository is a candidate without needing a keyword at all, which is how we
find someone who described the problem in words nobody thought to search for.
Two repositories is not enough. Guess generously; a wrong repository the user
deletes costs nothing, a missing one costs a whole source of leads.

`search_terms` come in two shapes, and **most of yours should be the second**:

| shape | example | how it matches |
|---|---|---|
| exact phrase | `stale embeddings` | that string, verbatim |
| **intersection** | `prompt caching + RAG` | both, anywhere in the post |

A plain phrase must be **2 to 3 words**. One-word terms like `reindex` or
`cache` match tens of thousands of issues, and GitHub serves only the first
thousand — so a broad term means seeing a random 3% of it.

But even a good phrase is blunt on its own. `prompt caching` matches every post
that mentions caching at all, and most of them are people cheerfully shipping
caching features. **The posts worth finding are always about two things
colliding** — caching AND retrieval, context AND invalidation, embeddings AND
cost. Someone writing about only one of them is writing about something else.

So use `+` to intersect two concepts. Each side may be 1 to 3 words, and single
words are fine there — `cache + retrieval` is precise *because* both must
appear, where `cache` alone is a lottery.

Give **at least half** your terms as intersections. Pair the product's own
concept with the context it breaks in.

### Give every problem a term, then go deep on each

Look at the list of problems in the profile above. **Each one gets at least one
term of its own** — a problem with no term is a problem this search will never
find anybody having.

After that, **spend the remaining slots going deeper, not wider.** Write several
angles on the same problem where the product is strongest. Terms that cluster on
one concept are fine and often correct: if that is what the product is about,
every one of them earns its place, and a search aimed squarely at a real market
beats one spread thinly across imagined ones.

What is *not* fine is a term for a problem this product does not solve, added
only to look broad. Those match, waste the budget, and return people who will
never buy.

So: cover each problem, then go deep on the ones that matter.

```
"prompt caching + RAG"
"cached prefix + invalidated"
"prompt cache + miss"
"system prompt + mutation"
"context reuse"
"re-embed + cost"
```

Prefer the words somebody with the problem types over the words the industry
uses: someone who says "cache invalidation" usually knows the answer already,
someone who says "index is stale" does not.

For every other platform, `search_terms` and `target_places` stay empty. Those
get shown as advice only, and it is better to say so than to pretend.

## Honesty

If a platform is a bad fit for this product, leave it out rather than padding
the list. Four real recommendations beat six with two invented.

If the website was too thin to tell you much, say so in `strategy` instead of
inventing detail. Somebody is going to act on this.

## Output

Return only JSON:

```json
{{
  "strategy": "2-3 sentences: the approach, specific to this product",
  "audience": "who to reach, concretely — role, company size, what they run",
  "positioning": "one sentence: how to describe the product to that audience",
  "platforms": [
    {{
      "key": "github",
      "name": "GitHub",
      "why": "why this platform suits THIS product",
      "what_to_do": "the actual activity, in one or two sentences",
      "tone": "how to write there",
      "search_terms": ["prompt caching + RAG", "stale index", "re-embed + cost"],
      "target_places": ["run-llama/llama_index", "chroma-core/chroma"]
    }}
  ],
  "content_ideas": ["3 to 5 specific things to write, each a real title"],
  "first_week": ["3 to 5 concrete actions to take in the first week"]
}}
```
