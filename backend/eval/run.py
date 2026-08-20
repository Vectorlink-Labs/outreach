"""
Score the current prompt against your labels.

    python -m eval.run
    python -m eval.run --threshold 40

Re-classifies every labelled candidate with whatever prompt is checked in
right now, then compares the machine's opportunity score against your
judgement. The disagreements at the end are the useful part - a single
number tells you something changed, the list tells you what.

Classification is cached per prompt version, so the first run after editing
a prompt costs a few cents and every run after that is free.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from outreach import classify, score
from outreach.schemas.conversation import Conversation

from eval import store

RULE = "─" * 78


async def evaluate(threshold: int) -> int:
    candidates = store.load_candidates()
    labels = store.load_labels()

    labelled = [(k, v) for k, v in labels.items() if k in candidates]
    if not labelled:
        print("\nNothing labelled yet. Run `python -m eval.label` first.\n")
        return 1

    # Group by the product text they were found with, because a judgement is
    # only meaningful against the product it was judged for.
    by_product: dict[str, list[tuple[str, Conversation]]] = {}
    for k, _ in labelled:
        data = dict(candidates[k])
        product = data.pop("_product", "")
        data = {
            field: value
            for field, value in data.items()
            if field in Conversation.model_fields
        }
        by_product.setdefault(product, []).append((k, Conversation(**data)))

    results: list[tuple[str, int, Conversation]] = []
    for product, items in by_product.items():
        if not product:
            continue
        conversations = [c for _, c in items]
        conversations, _ = await classify.classify_all(product, conversations)
        score.apply(conversations)
        for (k, _), conversation in zip(items, conversations, strict=True):
            results.append((k, labels[k]["label"], conversation))

    _report(results, threshold)
    return 0


def _report(results: list[tuple[str, int, Conversation]], threshold: int) -> None:
    total = len(results)
    print(f"\n{RULE}")
    print(f"  {total} labelled results   ·   prompt {classify.PROMPT_VERSION}"
          f"   ·   lead if score >= {threshold}")
    print(RULE)

    # A "lead" by your judgement is label 2. Label 1 is deliberately excluded
    # from both numerator and denominator: counting maybes either way makes a
    # small set swing wildly on judgement calls that were never confident.
    predicted = [r for r in results if (r[2].opportunity or 0) >= threshold]
    actual = [r for r in results if r[1] == 2]

    true_positives = [r for r in predicted if r[1] == 2]
    false_positives = [r for r in predicted if r[1] == 0]
    missed = [r for r in actual if (r[2].opportunity or 0) < threshold]

    precision = len(true_positives) / len(predicted) if predicted else 0.0
    recall = len(true_positives) / len(actual) if actual else 0.0

    print(f"\n  precision  {precision:.0%}"
          f"   ({len(true_positives)} of {len(predicted)} shown were real leads)")
    print(f"  recall     {recall:.0%}"
          f"   ({len(true_positives)} of {len(actual)} real leads were found)")

    if false_positives:
        print(f"\n  {len(false_positives)} FALSE POSITIVES"
              f"  - scored high, you said not a lead")
        print("  These are what users notice. Fix these before chasing recall.")
        for _, _, c in sorted(false_positives, key=lambda r: -(r[2].opportunity or 0))[:8]:
            print(f"    {c.opportunity:3}  {c.intent:17} {(c.title or '')[:52]}")
            print(f"         {c.post_domain}  ·  fit={c.fit}")

    if missed:
        print(f"\n  {len(missed)} MISSED"
              f"  - you said lead, scored below {threshold}")
        for _, _, c in sorted(missed, key=lambda r: (r[2].opportunity or 0))[:8]:
            print(f"    {c.opportunity:3}  {c.intent:17} {(c.title or '')[:52]}")
            print(f"         {c.post_domain}  ·  fit={c.fit}")

    print(f"\n{RULE}")
    print("  score distribution by your label")
    print(RULE)
    for label in (2, 1, 0):
        scores = [(r[2].opportunity or 0) for r in results if r[1] == label]
        if not scores:
            continue
        average = sum(scores) / len(scores)
        print(f"    label {label} ({len(scores):2})   "
              f"avg {average:5.1f}   range {min(scores):3}-{max(scores):3}   "
              f"{store.MEANING[label]}")

    # The single most useful line. If label-2 posts do not average clearly
    # above label-0 posts, the score is not separating leads from noise and
    # no threshold choice will rescue it.
    lead_scores = [(r[2].opportunity or 0) for r in results if r[1] == 2]
    junk_scores = [(r[2].opportunity or 0) for r in results if r[1] == 0]
    if lead_scores and junk_scores:
        gap = sum(lead_scores) / len(lead_scores) - sum(junk_scores) / len(junk_scores)
        verdict = "good" if gap >= 30 else "weak" if gap >= 15 else "NOT SEPARATING"
        print(f"\n  separation: {gap:+.1f} points between leads and junk  ->  {verdict}")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--threshold", type=int, default=45)
    args = parser.parse_args()
    return asyncio.run(evaluate(args.threshold))


if __name__ == "__main__":
    sys.exit(main())
