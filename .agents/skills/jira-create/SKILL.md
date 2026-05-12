---
name: jira-create
description: "Jira: Create a work item with components, labels, and custom fields."
metadata:
  version: 0.1.0
  requires:
    bins:
      - acli
  cliHelp: acli jira workitem create --help
---

# Jira: Create Work Items

> **PREREQUISITE:** Read [`../jira-shared/SKILL.md`](../jira-shared/SKILL.md) for auth, defaults, and security rules.

## Setting Components

`acli jira workitem create` has no `--component` flag. The **only way** to set components is via `--from-json` with `additionalAttributes`:

```bash
cat > /tmp/bug.json <<'EOF'
{
  "projectKey": "OCPBUGS",
  "summary": "Pod fails to mount CSI volume after node restart",
  "type": "Bug",
  "description": "Steps to reproduce...",
  "additionalAttributes": {
    "components": [{"name": "Storage / kubernetes-csi"}]
  }
}
EOF

acli jira workitem create --from-json /tmp/bug.json
```

Use `acli jira workitem create --generate-json` to discover the full JSON schema.

## Create

```bash
# Simple (no component)
acli jira workitem create -p OCPBUGS -t Bug -s "Title" -d "Details"

# With component -- use --from-json (see above)
acli jira workitem create --from-json /tmp/workitem.json

# With assignee and labels
acli jira workitem create -p OCPBUGS -t Bug -s "Title" -a "@me" -l "regression,blocker"
```

| Flag | Short | Description |
|------|-------|-------------|
| `--project` | `-p` | Project key |
| `--type` | `-t` | Issue type: Bug, Story, Task, Epic |
| `--summary` | `-s` | Issue title |
| `--description` | `-d` | Plain text or ADF description |
| `--description-file` | | Read description from file |
| `--assignee` | `-a` | Email, account ID, `@me`, or `default` |
| `--label` | `-l` | Comma-separated labels |
| `--parent` | | Parent issue key (for sub-tasks) |
| `--from-json` | | Create from JSON file (supports components and custom fields) |
| `--from-file` | `-f` | Read summary/description from text file |
| `--generate-json` | | Print example JSON schema |
| `--json` | | Output created issue as JSON |

> [!CAUTION]
> **Write command** -- always confirm summary, component, and all details with the user before executing.

## Create Bulk

```bash
acli jira workitem create-bulk --from-json issues.json
acli jira workitem create-bulk --from-csv issues.csv
acli jira workitem create-bulk --generate-json          # discover schema
acli jira workitem create-bulk --from-csv issues.csv --ignore-errors
```

CSV columns: `summary, projectKey, issueType, description, label, parentIssueId, assignee`.

> [!CAUTION]
> **Write command** -- confirm with the user before executing.

---

## See Also

- [jira-shared](../jira-shared/SKILL.md) -- Auth, defaults, and security rules
- [jira](../jira/SKILL.md) -- All work item commands
