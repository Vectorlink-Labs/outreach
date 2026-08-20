# Evaluation

The only ground truth in the system. Without it, every prompt change is a
guess — and a guess that has already moved one real post from **82** to **19**
without anyone being able to say which was right.

## The loop

```bash
# 1. Search normally. Candidates are collected automatically.
#    (POST /api/v1/sources/github/search)

# 2. Label them. Aim for 30.
python -m eval.label

# 3. Measure.
python -m eval.run
```

Then change a prompt, bump `PROMPT_VERSION` in `outreach/classify.py`, and run
step 3 again. The numbers move or they don't.

## The labels

| | meaning |
|---|---|
| **0** | not a lead — wrong domain, building it, or nobody to sell to |
| **1** | maybe — real person, real problem, weak fit or not asking |
| **2** | lead — you would actually reply to this one |

Three grades, not five. The difference between "no" and "definitely no"
changes nothing you would do, and every extra grade is another judgement to
make consistently at 11pm.

Label `1` is excluded from precision and recall on purpose. Counting maybes
either way makes a small set swing on calls that were never confident.

## Reading the output

```
precision  71%   (5 of 7 shown were real leads)
recall     83%   (5 of 6 real leads were found)

2 FALSE POSITIVES  - scored high, you said not a lead
  74  SOLUTION_SEEKING  index: regenerating headers triggers a full reindex
       C++ code indexing  ·  fit=strong

separation: +38.2 points between leads and junk  ->  good
```

**False positives first.** They are what a user notices — one embarrassing
result on page one costs more than ten good ones earn. Fix these before
chasing recall.

**Separation is the honest summary.** If label-2 posts don't average clearly
above label-0 posts, the score isn't distinguishing leads from noise and no
threshold will rescue it.

## Files

- `data/candidates.json` — every unique result any search returned, collected
  automatically
- `data/labels.json` — your judgements. Never written by anything except
  `eval.label`. That is the point of them.

Both are plain JSON, so they can be read, edited and diffed by hand. Commit
them: they are the most valuable artefact in the repository and the only thing
here that cannot be regenerated.
