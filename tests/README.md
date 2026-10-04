# Campaign verification

Requires Node.js 24 for the built-in TypeScript stripping used by the isolated Edge Function tests.

```sh
node --test tests/campaign-send.test.mjs
npm install --prefix /tmp/campaign-dom-validation linkedom@0.18.12
NODE_PATH=/tmp/campaign-dom-validation/node_modules node tests/campaign-ui.test.cjs
```

The sending tests replace Supabase and Resend with isolated in-memory implementations. No real email is sent. They cover complete audience snapshots, exclusions, consent withdrawal, duplicate/concurrent requests, send limits, authentication, account ownership, partial failures, ambiguous provider outcomes, database failure after acceptance, and delivery checks.

The DOM test runs the actual CRM code against the actual index.html using a mocked API. It checks campaign history rendering, escaped user content, consent counts, confirmation, exact audience transfer and empty-cohort isolation. It does not validate visual browser layout.

The campaign migration was also verified against Supabase in a rolled-back transaction: atomic creation, duplicate request reuse, owner read access, cross-business RLS isolation, and blocked client writes. The deployed sender was smoke-tested with an unauthenticated request, returning 401.

# Behaviour

Campaign snapshots are created when the owner confirms **Send campaign**. They contain all identified customers, including exclusions. Campaign history does not imply that unsent composer drafts have been saved.

`sent` means the provider accepted the email. **Check delivery** performs read-only provider lookups in groups of 10, recording delivery confirmation or failure where the existing API key permits reading. It never resends messages. A delivery timestamp is not invented when the provider only supplies its latest event.

An interrupted send can leave pending/unconfirmed recipients and a campaign requiring review. Repeating the same request ID cannot send it again. Manual provider investigation is required before creating a new campaign for uncertain recipients; there is no automatic retry or background sending.

Older campaign totals remain labelled historic because recipient-level evidence was not collected at the time. Rebooking attribution is a separate Stage 3 change.
