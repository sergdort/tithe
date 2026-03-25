---
name: template
description: Step-by-step E2E test flow template
---

## Test flow template

Follow this sequence for each E2E test. Adapt steps as needed.

### Step 1: Pre-flight

```bash
# Kill existing servers
lsof -ti:8787 2>/dev/null | xargs kill 2>/dev/null
lsof -ti:5174 2>/dev/null | xargs kill 2>/dev/null

# Build all packages
pnpm build

# Start dev servers (background)
pnpm dev
```

### Step 2: Open app and verify health

```
navigate_page type=url url=http://localhost:5174
```

If dialog appears:
```
handle_dialog action=dismiss
navigate_page type=reload
```

```
take_snapshot  # verify app loaded (look for expected heading, nav buttons)
list_console_messages types=["error"]  # should be empty
```

### Step 3: Seed test data (if needed)

Option A — via UI:
```
# Navigate to add transaction
click uid=<add-button-uid>
take_snapshot
# Fill form fields, submit
```

Option B — via API:
```
evaluate_script function=async () => {
  const res = await fetch('http://127.0.0.1:8787/v1/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      occurredAt: new Date().toISOString(),
      amountMinor: 500000,
      currency: 'GBP',
      categoryId: '<category-id>',
      kind: 'income',
      merchantName: 'Test Salary',
    }),
  });
  const data = await res.json();
  return { ok: data.ok, id: data.data?.id };
}
```

### Step 4: Navigate to feature under test

```
navigate_page type=url url=http://localhost:5174/<path>
take_snapshot  # verify correct page loaded
```

### Step 5: Perform actions

```
click uid=<target-uid>
take_snapshot  # verify state change
```

For dialogs:
```
handle_dialog action=accept  # or dismiss
take_snapshot
```

### Step 6: Verify results

**UI state:**
```
take_snapshot
# Check: expected elements present/absent, correct text values
```

**Network:**
```
list_network_requests resourceTypes=["fetch"]
# Check: expected API call made, correct status code
get_network_request reqid=<id>
# Check: response body contains expected data
```

**Console:**
```
list_console_messages types=["error"]
# Expected: no errors
```

**API data:**
```
evaluate_script function=async () => {
  const res = await fetch('http://127.0.0.1:8787/v1/<endpoint>');
  const data = await res.json();
  return data.data;
}
# Check: data reflects the action taken
```

### Step 7: Report and improve

After the test session, review:
1. Did any MCP tool behave unexpectedly?
2. Did any pattern from the skill not work?
3. Were there new gotchas not yet documented?

If yes, propose updates to the skill rules and append to the "Session learnings" section in `SKILL.md`.

### Known issues
- [2026-03-25] Template created based on first full E2E testing session.
