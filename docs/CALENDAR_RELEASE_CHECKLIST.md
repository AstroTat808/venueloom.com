# Calendar release checklist

- [ ] Configure OAuth credentials and encrypted token storage for Google and Microsoft.
- [ ] Confirm inbound and outbound event propagation, updates, and cancellations.
- [ ] Test expired OAuth tokens, revoked authorization, expired sync cursors, and webhook renewal.
- [ ] Validate Airbnb and Vrbo iCalendar URLs, feed parsing, import, export, and polling frequency.
- [ ] Test overlapping bookings from each provider, adjacent time windows, cancelled blocks, and time zones including daylight-saving transitions.
- [ ] Run PostgreSQL concurrent booking transactions and verify only one overlapping booking commits.
- [ ] Confirm tenant isolation and venue-specific permissions on every API endpoint.
- [ ] Verify retries, dead-letter alerts, rate limits, audit logs, and manual conflict resolution.
- [ ] Confirm that external iCalendar feed delays can cause temporary stale availability; document this limitation in the UI.
- [ ] Test production provider accounts with a dedicated test venue before enabling live bookings.
- [ ] Require green CI, migration dry run, backups, rollback procedure, and deployment smoke tests.
