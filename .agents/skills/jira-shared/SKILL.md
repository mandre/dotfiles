---
name: jira-shared
description: "Jira CLI: Shared patterns for authentication, defaults, and security rules."
metadata:
  version: 0.1.0
  requires:
    bins:
      - acli
---

# Jira Shared (acli)

Shared reference for all `acli jira` skills. Covers authentication, defaults, and security.

## Authentication

```bash
acli jira auth status       # Check current auth
acli jira auth login        # Interactive login
acli jira auth switch       # Switch between accounts
```

## Defaults & Rules

| Setting | Value |
|---------|-------|
| **Bug project** | `OCPBUGS` |
| **General project** | `OSASINFRA` |
| **Default issue type** | `Bug` |

- If the user does not specify a project, use `OCPBUGS` for bugs and `OSASINFRA` for other work. If unsure, **ask**.
- **Never guess** any field value (priority, version, assignee, component, etc.) -- **always ask** when in doubt.
- **Always confirm** with the user before executing any write, transition, or delete command.

## Discovering Commands

When unsure about exact flags, run `--help`:

```bash
acli jira <resource> <subcommand> --help
```

For JSON-based creation/editing, generate a template:

```bash
acli jira workitem create --generate-json
acli jira workitem edit --generate-json
acli jira workitem create-bulk --generate-json
acli jira workitem link create --generate-json
```

## Security Rules

- **Never** output API tokens, credentials, or auth secrets.
- **Always** confirm with the user before executing any write, transition, or delete command.
- For destructive operations (delete, archive), require **explicit** confirmation.
