---
name: jira-search
description: "Jira: Search work items with JQL queries."
metadata:
  version: 0.1.0
  requires:
    bins:
      - acli
  cliHelp: acli jira workitem search --help
---

# Jira: Search Work Items

> **PREREQUISITE:** Read [`../jira-shared/SKILL.md`](../jira-shared/SKILL.md) for auth, defaults, and security rules.

## Search

```bash
acli jira workitem search --jql "project = OCPBUGS AND status != Closed" --limit 20
acli jira workitem search --jql "assignee = currentUser() AND project = OCPBUGS" --paginate
acli jira workitem search --jql "component = \"Storage / kubernetes-csi\" AND status = New" --csv
acli jira workitem search --jql "project = OCPBUGS ORDER BY created DESC" --limit 10 --json
acli jira workitem search --filter 10001 --web
```

| Flag | Short | Description |
|------|-------|-------------|
| `--jql` | `-j` | JQL query |
| `--filter` | | Saved filter ID |
| `--fields` | `-f` | Comma-separated fields (default: `issuetype,key,assignee,priority,status,summary`) |
| `--limit` | `-l` | Max results |
| `--paginate` | | Fetch all pages |
| `--count` | | Return count only |
| `--json` | | JSON output |
| `--csv` | | CSV output |
| `--web` | `-w` | Open in browser |

## Common JQL Patterns

```
# By project
project = OCPBUGS
project = OSASINFRA

# By assignee
assignee = currentUser()
assignee = "user@redhat.com"

# By component
component = "Storage / kubernetes-csi"

# By status
status = "New"
status in ("New", "Assigned")
status not in (Closed, Verified)

# By priority and labels
priority = Critical
labels = "regression"

# By date
created >= -7d
updated >= -30d

# Combined (most common)
project = OCPBUGS AND assignee = currentUser() AND status not in (Closed, Verified) ORDER BY updated DESC
project = OCPBUGS AND component = "Storage / kubernetes-csi" AND status != Closed ORDER BY created DESC
```

---

## See Also

- [jira-shared](../jira-shared/SKILL.md) -- Auth, defaults, and security rules
- [jira](../jira/SKILL.md) -- All work item commands
