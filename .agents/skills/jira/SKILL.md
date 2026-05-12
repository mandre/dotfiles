---
name: jira
description: "Jira: Create, search, view, edit, and manage work items on Red Hat Jira using acli."
metadata:
  version: 0.1.0
  requires:
    bins:
      - acli
---

# Jira (acli)

Manage Jira work items on **redhat.atlassian.net** via the Atlassian CLI (`acli`).

> **PREREQUISITE:** Read [`../jira-shared/SKILL.md`](../jira-shared/SKILL.md) for auth, defaults, and security rules.

## Subcommand Skills

| Skill | Description |
|-------|-------------|
| [`jira-create`](../jira-create/SKILL.md) | Create a work item with components, labels, and custom fields |
| [`jira-search`](../jira-search/SKILL.md) | Search work items with JQL queries |

---

## Common Workflows

### File a bug with component and assign it

```bash
# 1. Write JSON with component (the only way to set components)
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

# 2. Create
acli jira workitem create --from-json /tmp/bug.json

# 3. Assign (use the key from step 2)
acli jira workitem assign --key OCPBUGS-99999 --assignee "@me"
```

### Find and triage my open issues

```bash
acli jira workitem search --jql "assignee = currentUser() AND project = OCPBUGS AND status not in (Closed, Verified)" --limit 20
acli jira workitem view OCPBUGS-12345
acli jira workitem transition --key OCPBUGS-12345 --status "Assigned"
```

### Link related issues

```bash
acli jira workitem link type                                                    # list link types
acli jira workitem link create --out OCPBUGS-111 --in OCPBUGS-222 --type Blocks # create link
acli jira workitem link create --from-csv links.csv                             # bulk link
```

### Move issues through a workflow

```bash
acli jira workitem view OCPBUGS-12345 --fields status
acli jira workitem transition --key OCPBUGS-12345 --status "Assigned"
acli jira workitem transition --key OCPBUGS-12345 --status "MODIFIED"
acli jira workitem transition --key OCPBUGS-12345 --status "ON_QA"
```

---

## Work Items

### View

```bash
acli jira workitem view OCPBUGS-12345
acli jira workitem view OCPBUGS-12345 --fields '*all' --json
acli jira workitem view OCPBUGS-12345 --fields summary,status,components
acli jira workitem view OCPBUGS-12345 --web
```

Field selectors: `*all`, `*navigable`, specific fields, or prefix with `-` to exclude (e.g., `-description`).

### Edit

```bash
acli jira workitem edit -k OCPBUGS-12345 -s "Updated title"
acli jira workitem edit -k OCPBUGS-12345 -a "user@redhat.com"
acli jira workitem edit -k OCPBUGS-12345 -d "New description"
acli jira workitem edit -k "KEY-1,KEY-2" -l "regression"
acli jira workitem edit --from-json workitem.json       # full control including components
acli jira workitem edit --generate-json                  # discover JSON schema
```

| Flag | Short | Description |
|------|-------|-------------|
| `--key` | `-k` | Issue key(s), comma-separated |
| `--jql` | | JQL query to select issues |
| `--filter` | | Saved filter ID |
| `--summary` | `-s` | New summary |
| `--description` | `-d` | New description (plain text or ADF) |
| `--description-file` | | Read description from file |
| `--assignee` | `-a` | New assignee |
| `--type` | `-t` | Change issue type |
| `--labels` | `-l` | Set labels |
| `--remove-labels` | | Remove specific labels |
| `--remove-assignee` | | Unassign |
| `--from-json` | | Edit from JSON file |
| `--generate-json` | | Print example JSON schema |
| `--ignore-errors` | | Continue on errors (for bulk edits) |
| `--yes` | `-y` | Skip confirmation prompt |
| `--json` | | JSON output |

> [!CAUTION]
> **Write command** -- confirm changes with the user before executing.

### Transition (change status)

```bash
acli jira workitem transition -k OCPBUGS-12345 -s "Assigned"
acli jira workitem transition -k OCPBUGS-12345 -s "MODIFIED"
acli jira workitem transition -k "KEY-1,KEY-2" -s "ON_QA"
```

Run `--help` for all flags. Supports `--key`, `--jql`, `--filter`, `--yes`, `--json`.

> [!CAUTION]
> **Write command** -- confirm the target status with the user before executing.

### Assign

```bash
acli jira workitem assign -k OCPBUGS-12345 -a "@me"
acli jira workitem assign -k OCPBUGS-12345 -a "user@redhat.com"
acli jira workitem assign -k OCPBUGS-12345 --remove-assignee
```

Run `--help` for all flags. Supports `--key`, `--jql`, `--filter`, `--from-file`, `--yes`, `--json`.

> [!CAUTION]
> **Write command** -- confirm with the user before executing.

---

## Comments

```bash
# List comments
acli jira workitem comment list --key OCPBUGS-12345
acli jira workitem comment list --key OCPBUGS-12345 --json --limit 10 --order "-created"

# Add a comment
acli jira workitem comment create --key OCPBUGS-12345 --body "Comment text"
acli jira workitem comment create --key OCPBUGS-12345 --body-file comment.txt

# Add comment to multiple issues via JQL
acli jira workitem comment create --jql "project = OCPBUGS AND labels = needs-update" --body "Ping"

# Edit last comment by the same author
acli jira workitem comment create --key OCPBUGS-12345 --body "Corrected text" --edit-last

# Update a specific comment by ID
acli jira workitem comment update --key OCPBUGS-12345 --id 10001 --body "Updated text"

# Delete a comment
acli jira workitem comment delete --key OCPBUGS-12345 --id 10001
```

> [!CAUTION]
> **comment create / update / delete** are write commands -- confirm with the user.

---

## Links

```bash
# List links on an issue
acli jira workitem link list --key OCPBUGS-12345

# List available link types
acli jira workitem link type

# Create a link
acli jira workitem link create --out OCPBUGS-111 --in OCPBUGS-222 --type Blocks

# Bulk link from JSON or CSV
acli jira workitem link create --from-json links.json
acli jira workitem link create --from-csv links.csv
acli jira workitem link create --generate-json           # discover schema

# Delete a link
acli jira workitem link delete --id 10001

# Bulk delete from JSON or CSV
acli jira workitem link delete --from-json links.json
```

> [!CAUTION]
> **link create / delete** are write commands -- confirm with the user.

---

## Attachments & Watchers

```bash
# List attachments
acli jira workitem attachment list --key OCPBUGS-12345

# Delete an attachment by ID
acli jira workitem attachment delete --id 12345

# List watchers
acli jira workitem watcher list --key OCPBUGS-12345

# Remove a watcher (requires account ID, not email)
acli jira workitem watcher remove --key OCPBUGS-12345 --user 5b10ac8d82e05b22cc7d4ef5
```

> [!CAUTION]
> **delete / remove** are write commands -- confirm with the user.

---

## Clone, Archive, Delete

```bash
# Clone an issue to a project
acli jira workitem clone --key OCPBUGS-12345 --to-project OCPBUGS

# Clone multiple issues via JQL
acli jira workitem clone --jql "project = OCPBUGS AND labels = clone-me" --to-project TEAM

# Clone to a different site
acli jira workitem clone --key OCPBUGS-12345 --to-project PROJ --to-site other-site

# Archive / Unarchive
acli jira workitem archive --key OCPBUGS-12345
acli jira workitem unarchive --key OCPBUGS-12345

# Delete (destructive!)
acli jira workitem delete --key OCPBUGS-12345
```

> [!CAUTION]
> All are **write/destructive** commands -- require **explicit user confirmation**.

---

## Projects

```bash
acli jira project view --key OCPBUGS --json
acli jira project list --recent --json
```

Also supports: `project create`, `project update`, `project delete`, `project archive`, `project restore`. Run `--help` for flags.

> [!CAUTION]
> **create / update / archive / restore / delete** are write commands -- confirm with the user.

---

## Boards & Sprints

### Boards

```bash
acli jira board search
acli jira board search --name "my board" --project OCPBUGS --type scrum --json
acli jira board get --id 123 --json
acli jira board list-sprints --id 123 --state active,closed --json
```

### Sprints

```bash
# View sprint details
acli jira sprint view --id 456 --json

# List work items in a sprint (requires BOTH --sprint and --board)
acli jira sprint list-workitems --sprint 456 --board 123
acli jira sprint list-workitems --sprint 456 --board 123 --jql "assignee = currentUser()" --json

# Create a sprint
acli jira sprint create --name "Sprint 1" --board 5
acli jira sprint create --name "Sprint 2" --board 5 --start 2025-01-01 --end 2025-01-14 --goal "Q1 release"

# Update a sprint
acli jira sprint update --id 37 --name "Sprint 1 - Final" --state closed

# Delete sprint(s)
acli jira sprint delete --id 37
```

> [!CAUTION]
> **create / update / delete** are write commands -- confirm with the user.

---

## Filters, Dashboards, Fields

```bash
acli jira filter list                    # my / favourite filters
acli jira filter search                  # search filters
acli jira filter get --id 789 --json     # filter details
acli jira dashboard search --json        # search dashboards
```

Also available: `filter update`, `filter add-favourite`, `filter change-owner`, `filter get-columns`, `filter reset-columns`, `field create`, `field update`, `field delete`, `field cancel-delete`. Run `--help` for flags.
