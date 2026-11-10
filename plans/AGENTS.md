# Plans

A plan describes a unit of work that spans more than one PR or session. Changes that fit in a single PR don't need one.

Each project gets its own directory, so it can grow extra files next to its plan:

```
plans/{project}/plan.md
```

Use kebab-case for `{project}`.

## Usage

- **Starting a project:** copy `_template/plan.md` to `plans/{project}/plan.md`.
- **Working on a project:** read its plan first. Tick off steps and record decisions in the same PR as the work.
- **Finishing a project:** set the status to `done` and leave the directory in place.
