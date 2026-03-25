---
name: patterns
description: Core Chrome DevTools MCP patterns for navigation, interaction, and verification
---

## Navigation and state verification

### Navigate and snapshot
```
navigate_page type=url url=http://localhost:5174/transactions
take_snapshot
```

The snapshot returns an accessibility tree with `uid` identifiers for each element. Use these UIDs for subsequent interactions.

### Prefer snapshots over screenshots
- `take_snapshot` — text-based a11y tree, fast, searchable, no image analysis needed
- `take_screenshot` — use only when you need to see visual layout/styling

## Clicking elements

### Standard click
```
click uid=3_10
```

### Fallback for elements below the fold
If `click` returns "element did not become interactive within the configured timeout":
```
evaluate_script function=() => {
  const btn = document.querySelector('button[class*="colorError"]');
  if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return 'clicked'; }
  return 'not found';
}
```

### Always verify after click
```
click uid=3_10
take_snapshot  // verify the expected state change happened
```

## Dialog handling

Browser dialogs (`window.confirm`, `window.prompt`, `window.alert`) block MCP interaction.

### Accept a dialog
```
handle_dialog action=accept
```

### Dismiss a dialog
```
handle_dialog action=dismiss
```

### Stale dialog pattern
After `navigate_page`, if the response says "Open dialog: confirm: ...", the dialog is stale from a previous interaction:
```
handle_dialog action=dismiss
navigate_page type=reload
```

Note: `handle_dialog` uses `action` parameter, not `accept` boolean.

## Form interaction

### Fill a text input
```
fill uid=3_15 value="5000"
```

### For complex form interactions, use evaluate_script
```
evaluate_script function=(el) => { el.value = '5000'; el.dispatchEvent(new Event('input', { bubbles: true })); return 'filled'; } args=["3_15"]
```

## Network verification

### List recent API calls
```
list_network_requests resourceTypes=["fetch"]
```

Returns reqid, URL, status code for each request.

### Inspect a specific request/response
```
get_network_request reqid=189
```

Returns headers and body for both request and response. Use this to:
- Verify correct payload was sent
- Check response body shape (e.g., missing fields)
- Diagnose 4xx/5xx errors

## Console error checking

### Check for errors after actions
```
list_console_messages types=["error"]
```

Expected: "No console messages found" — any errors indicate a problem.

## Direct API verification

Use `evaluate_script` with `fetch()` to call the API directly from the browser:

```
evaluate_script function=async () => {
  const res = await fetch('http://127.0.0.1:8787/v1/reports/monthly-ledger?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:00:00.000Z');
  const data = await res.json();
  return data.data.cashFlow;
}
```

This is useful for:
- Checking if data was persisted correctly
- Verifying response shape without navigating the UI
- Creating test data via POST requests

### Known issues
- [2026-03-25] `click` with uid sometimes fails on MUI buttons that have ripple overlays. Retry once or use `evaluate_script` fallback.
- [2026-03-25] `list_network_requests` only shows requests since last `navigate_page`. If you need requests across navigations, check before navigating.
