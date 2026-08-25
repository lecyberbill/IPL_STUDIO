# Human-brief protocol — the ultimate control (NL vs IPL, no AI-authored brief)

> The benchmark's NL-vs-IPL control was de-biased by a **deterministic**
> `renderNLBrief` (`--nl-render`), which removes the confound of AI-authored
> prose. But the *strongest* control is a **human-written** brief in your own
> words, its **IPL translation**, and running both through the same pipeline.
> This doc is the reproducible recipe.

## Goal

Answer, without any authoring-skill confound: for the *same intent*, does the
constraint-first **IPL** arm beat a plain **natural-language** brief written by a
**human** (not an AI, not polished)? And by how much, on first-try vs after
repair, and at what token/reliability cost?

## Method (3 artefacts, all from ONE human brief)

Do **not** let an AI write or polish the brief. You write it as you would dictate
to a developer. Then:

1. **Brief (natural language)** — your verbatim words. Include: the entities and
   their fields/types, the business rule(s) (formula), the fixture data the
   program should use, and the output keys. Write it the way you'd naturally
   describe the need — ambiguities and gaps included (no cheating). Do **not**
   spell out the computed answers you could leave to the program (that's what the
   AI-authored brief did and it flattered NL).
2. **IPL translation** — the same intent, same data, same formula, same output
   keys, structured as IPL (`add entity`, `seed`, `compute`, `send format:json`).
   This is the "same information, different representation" arm.
3. **Oracle (`verify.assert`)** — the expected output *values* (the ground truth
   you'd assert by hand): exit code, stdout, JSON paths + exact/approx values.
   This is the judge; it is the same for both arms.

## Add the spec

In `scripts/run-benchmark.ts` → `SPECS`, add an entry:

```ts
{
  id: 'my-brief',            // your domain
  name: 'My business problem',
  formFactor: 'batch',       // headless, prints the JSON
  targetLang: 'python',      // or 'javascript'
  code: `/* your IPL translation */`,
  // IMPORTANT: your VERBATIM human brief — not AI-polished, not from renderNLBrief.
  naturalLanguage: `/* your brief, as you wrote it */`,
  verify: {
    command: 'python main.py',
    assert: { stdoutRegex: '"..."', jsonInOutput: [ /* your oracle */ ] }
  }
}
```

If you want a multi-file project, also set `sourceFiles` + `rootFile` and put the
merged `main.ipl` as `code`.

## Run

```bash
# The human brief arm (default uses spec.naturalLanguage).
npm run bench -- --mode external --nl-witness --spec my-brief --iterations 3 --quiet
# Compare against a deterministic prose baseline of the SAME spec:
npm run bench -- --mode external --nl-witness --nl-render --spec my-brief --iterations 3 --quiet
```

**Do NOT use `--nl-render` for the human-brief comparison** — that forces the
deterministic renderer and ignores your verbatim brief. Use it only as a second
data point (what does the *same* spec give when the prose is auto-derived?).

## What to read

| Report section | Answers |
| :--- | :--- |
| `Summary` | IPL final PASS/WARN/FAIL + repairs-to-success (convergence). |
| `Natural language vs IPL` | first-try PASS% for each arm (the honest head-to-head). |
| `Semantic preservation` | contract survival in source, *independent* of runtime. |
| `Oracle / spec parity` | did the oracle's fixtures come from the spec (`seed`/options)? |

## Interpretation guardrails

- A human brief is legitimately **vager** than an IPL spec; that vagueness is the
  real cost of prose (the round-trips John/reviewer emphasized). If your brief
  needs clarification to be runnable, note it — that IS the finding (a constraint
  that was implicit and had to be negotiated).
- If the human brief **spells out the exact answers**, it stops being a fair NL
  control (it becomes the AI-authored-flattering case). Keep the computed values
  in the **oracle**, not the brief.
- Comparing `--nl-witness` (your brief) vs `--nl-witness --nl-render` (derived
  prose) tells you how much of the NL difference came from **your wording** vs the
  deterministic summary.

## Record the result

Append the run's numbers to the **Multi-domain stress test** section of
[`docs/benchmark-scorecard.md`](benchmark-scorecard.md), marking the row
`Brief author: human`, so it is not mistaken for an AI-authored control.
