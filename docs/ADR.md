# ADR

Architecture Decision Records (ADRs) capture significant architectural choices made in this project — the context, the decision, and the consequences.

Records are generated via [`adr-tools`](https://github.com/npryce/adr-tools) and follow the lightweight format described by [Michael Nygard](http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions).

## Location

Records live in [`docs/architecture/decisions/`](architecture/decisions/). The `.adr-dir` file at the repo root points `adr-tools` to that path so commands work from anywhere in the project.

## Workflow

```bash
# Create a new record (auto-increments the number)
adr new "Use X for Y"

# Supersede an existing record
adr new -s 3 "Replace X with Z"

# List all records
adr list
```

Each record is a Markdown file named `NNNN-short-title.md` with four sections:

| Section | Purpose |
| ------- | ------- |
| **Status** | `Proposed` → `Accepted` / `Rejected` / `Deprecated` / `Superseded by [N]` |
| **Context** | What problem or constraint drove the decision |
| **Decision** | What was decided and why |
| **Consequences** | What changes, what trade-offs are accepted |

## Structurizr Integration

Records are surfaced in the Structurizr architecture model via the `!decisions` directive in [`docs/workspace.dsl`](workspace.dsl):

```dsl
l = softwareSystem "Letant" {
    !decisions ./architecture/decisions
    ...
}
```

This causes the Structurizr workspace to render each ADR as documentation attached to the `Letant` software system, keeping architecture rationale co-located with the diagrams.
