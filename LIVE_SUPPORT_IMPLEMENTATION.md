Implementation Plan: Live Support Chat + Support Personnel RBAC

No code will be changed until you approve this plan.

───

Current state (what we build on)

┌──────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Area             │ Today                                                                                          │
├──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Roles            │ user | admin | support already exist in schema/auth                                            │
├──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Support policy   │ Design doc KD12 / OQ5: support ≡ user — no admin access, no privileges                         │
├──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Auth gates       │ Middleware blocks non-admin from /admin; layouts + requireAdmin / assertAdmin enforce the same │
├──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Realtime stack   │ None (no WebSockets/SSE). Server Actions + SQLite/Supabase only                                │
├──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Mobile dashboard │ Fixed bottom nav (DashboardMobileNav); main has pb-20 clearance                                │
├──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Root layout      │ No global widgets — chat must be mounted carefully so it appears site-wide                     │
└──────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────┘

───

Goals

1. Persistent live-support widget (bottom-right) on marketing, auth, dashboard, and admin pages.
2. Mobile dashboard: FAB sits above the bottom navbar with a floating effect — never covers nav.
3. Threaded chat: user sends messages; support replies; conversation continues.
4. Support staff accounts created by main admin (email + password).
5. Per-person privilege toggles for the capabilities you listed (view vs approve, properties, wallets, emails, APY).

───

Part A — Live support chat

A1. Data model

support_conversations
  id, userId (nullable for guests), guestName, guestEmail,
  status (open | pending | closed),
  assignedTo (nullable support/admin user id),
  lastMessageAt, createdAt, updatedAt

support_messages
  id, conversationId, senderId (nullable for system/guest),
  senderRole (user | guest | support | admin | system),
  body, createdAt, readAt (nullable)

support_staff_presence (optional v1.1)
  userId, lastSeenAt  -- for “online” indicator

Indexes: conversations(status, lastMessageAt), messages(conversationId, createdAt), conversations(userId).

A2. “Live” transport (recommended)

v1: short polling while the panel is open (every ~2–3s), plus optimistic send.

┌────────────────────────────────────────────┬────────────────────────────────────────────────────┬──────────────────────────────────────────┐
│ Option                                     │ Fit                                                │ Recommendation                           │
├────────────────────────────────────────────┼────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ Polling                                    │ Matches current stack; works on SQLite + Vercel    │ Ship this first                          │
├────────────────────────────────────────────┼────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ SSE                                        │ Better UX, more plumbing                           │ Phase 2 if needed                        │
├────────────────────────────────────────────┼────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ WebSockets / third-party (Intercom, Crisp) │ Fastest “product” chat, external dependency + cost │ Only if you prefer SaaS over first-party │
└────────────────────────────────────────────┴────────────────────────────────────────────────────┴──────────────────────────────────────────┘

No new heavy realtime infrastructure required for a solid v1.

A3. User-facing widget UX

Component: components/support/SupportChatWidget.tsx (client)

┌───────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Context                                       │ FAB position                                                                                                                                                   │
├───────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Marketing / login / admin / desktop dashboard │ fixed bottom-6 right-4 (with safe-area)                                                                                                                        │
├───────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Mobile dashboard only                         │ fixed right-4 with bottom: calc(bottom-nav-height + 12px + safe-area) — ~bottom-20 / bottom-24 so it sits just above the nav, with subtle shadow / soft bounce │
└───────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Behavior:
• Collapsed: circular chat icon + unread badge
• Expanded: panel (~360×520 desktop; near full-width sheet on mobile) with message list, composer, “Support typically replies soon”
• Logged-in users: conversation bound to userId (resume existing open thread)
• Guests (marketing): collect name + email once, then chat (guestEmail on conversation)
• Widget hidden or minimized-only on support inbox pages so agents don’t chat with themselves by accident

Mount strategy (persistence):
• Add widget to root app/layout.tsx so it survives all routes, or
• Shared client shell used by marketing + dashboard + admin layouts

Root layout is simplest for “every page.”

A4. Support / admin inbox

New route: /admin/support (or /admin/chat)

• List conversations (open / pending / closed, unread counts)
• Thread view: reply as support/admin
• Assign / unassign (optional but useful)
• Close conversation
• Click-through to user profile when userId is set

Access: any staff with privilege chat.access (default on for all support + full for admin).

A5. Server surface

┌────────────────────────────────────────┬─────────────────────────────────────────────┐
│ Layer                                  │ Responsibility                              │
├────────────────────────────────────────┼─────────────────────────────────────────────┤
│ lib/services/support-chat.ts           │ Create/list/send/mark-read/close; authz     │
├────────────────────────────────────────┼─────────────────────────────────────────────┤
│ lib/actions/support-chat.ts            │ Server Actions for widget + inbox           │
├────────────────────────────────────────┼─────────────────────────────────────────────┤
│ Optional app/api/support/poll/route.ts │ Lightweight JSON poll if Actions feel heavy │
└────────────────────────────────────────┴─────────────────────────────────────────────┘

Security:
• Users only read/write their conversation
• Guests: opaque conversation token in httpOnly cookie (or signed id) so they can’t open others’ threads
• Support/admin: require chat.access
• Rate-limit sends (simple per-user/IP throttle)
• Sanitize message body (plain text, max length)

A6. Notifications (light)

• On new user message: in-app notification or badge for staff with chat.access
• On staff reply: in-app notification for the end user (reuse notifications table)
• Email ping optional later

───

Part B — Support personnel + granular privileges

B1. Privilege catalog

Explicit capability keys (toggle independently):

┌────────────────────┬──────────────────────────────────────┐
│ Key                │ Meaning                              │
├────────────────────┼──────────────────────────────────────┤
│ kyc.view           │ See pending KYC queue                │
├────────────────────┼──────────────────────────────────────┤
│ kyc.review         │ Approve / decline KYC                │
├────────────────────┼──────────────────────────────────────┤
│ deposits.view      │ See pending deposits                 │
├────────────────────┼──────────────────────────────────────┤
│ deposits.review    │ Confirm / reject deposits            │
├────────────────────┼──────────────────────────────────────┤
│ withdrawals.view   │ See pending withdrawals              │
├────────────────────┼──────────────────────────────────────┤
│ withdrawals.review │ Approve / reject / complete payouts  │
├────────────────────┼──────────────────────────────────────┤
│ properties.edit    │ Update existing featured properties  │
├────────────────────┼──────────────────────────────────────┤
│ properties.create  │ Create new featured properties       │
├────────────────────┼──────────────────────────────────────┤
│ settings.wallets   │ Create/edit deposit wallet addresses │
├────────────────────┼──────────────────────────────────────┤
│ settings.emails    │ Create/edit official email addresses │
├────────────────────┼──────────────────────────────────────┤
│ settings.apy       │ Edit APY rules                       │
├────────────────────┼──────────────────────────────────────┤
│ chat.access        │ Support inbox + reply                │
└────────────────────┴──────────────────────────────────────┘

Always admin-only (not toggleable for support):
• Create/suspend support staff, edit their privileges
• Suspend end users, audit log full access
• Legal content / FAQ CMS (unless you later add keys)
• Plans admin, force growth accrual, price refresh
• Promote anyone to full admin

Implied rules:
• *.review implies *.view (enforce in code)
• Full admin role bypasses the matrix (all privileges on)

B2. Storage

support_privileges
  userId (PK, FK users where role = support)
  privileges  -- JSON object { "kyc.view": true, ... }
  createdAt, updatedAt, updatedBy

Alternatively one row per capability; JSON is simpler for toggle UI and matches current platform_settings style.

B3. Auth model changes (core of the work)

Today everything is binary role === "admin". Change to capability-based authz:

1. lib/auth/privileges.ts — catalog + defaults + helpers
   hasPrivilege(user, key), assertPrivilege(user, key)
2. lib/services/_authz.ts — extend beyond assertAdmin:
   • assertAdminOrPrivilege(actor, key)
   • Load privileges for support users (cache per request)
3. lib/actions/admin.ts — replace bare requireAdmin() with the privilege required by that action
4. Services (kyc, crypto, payouts, properties, settings, growth) — same: gate writes/reads by capability
5. Middleware — allow role === "admin" || role === "support" into /admin/*
6. Admin layout — support may enter; nav filtered by privileges
7. Admin pages — each page checks the right privilege(s); redirect or 403 if missing
8. Update KD12 / OQ5 in design notes: support is no longer ≡ user

B4. Admin UI: manage support staff

New section: /admin/support-staff (admin-only)

1. Create support personnel
   • Name, email, password
   • Creates users row with role: "support", hashed password, default privilege set (recommend: chat.access only until toggled)
2. List staff — status, last login if available
3. Privilege matrix — per person, toggles for every key above
4. Suspend / reactivate support accounts
5. Reset password (admin-set or send reset email)

Do not use public /register for this — admin-only server action.

B5. Support staff login UX

• Same /login as everyone else
• After login: if support (or admin), land on /admin or /admin/support (chat-first if only chat.access)
• Dashboard sidebar / mobile: show Admin/Support link when role is admin or support
• Support users should not get investor balances unless you intentionally want dual use (recommend: support is staff-only; skip portfolio features)

───

Part C — UI / nav filtering

siteConfig.adminNav becomes privilege-aware:

┌─────────────────────────────────┬──────────────────────────────────────────────────────────────────────────┐
│ Nav item                        │ Required privilege                                                       │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ Overview                        │ any admin-area access (admin or any privilege)                           │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ KYC                             │ kyc.view                                                                 │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ Deposits                        │ deposits.view                                                            │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ Withdrawals                     │ withdrawals.view                                                         │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ Properties                      │ properties.edit or properties.create                                     │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ Settings                        │ any of settings.* (section-level hide of APY/wallets/emails inside page) │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ Support chat                    │ chat.access                                                              │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ Support staff                   │ admin only                                                               │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ Users / Content / Audit / Plans │ admin only                                                               │
└─────────────────────────────────┴──────────────────────────────────────────────────────────────────────────┘

Settings page should split sections so a staffer with only settings.wallets never sees APY or email forms.

───

Part D — Implementation phases

Phase 1 — RBAC foundation (must land before privileged actions)
1. Schema: support_privileges (+ migrate local SQLite + Supabase SQL if used)
2. Privilege helpers + assertPrivilege
3. Middleware + admin layout allow support
4. Admin create-staff + privilege toggle UI
5. Wire existing admin actions/services to privileges
6. Filter admin nav + page guards

Phase 2 — Live chat
1. Schema: conversations + messages
2. Chat service + actions
3. Global floating widget (desktop + mobile dashboard offset)
4. Admin/support inbox at /admin/support
5. Unread badges + basic notifications
6. Guest vs logged-in conversation flows

Phase 3 — Polish (optional same PR or follow-up)
• Assign conversations, presence/“online”
• Sound/browser notification for new messages
• Canned replies
• Audit events for privilege changes and chat closes
• Rate limits + abuse controls
• SSE upgrade if polling feels laggy

Suggested ship order: Phase 1 → Phase 2. Chat without RBAC is awkward (who answers?). RBAC without chat still delivers mini-admin value.

───

Part E — Files likely touched

┌──────────┬───────────────────────────────────────────────────────────────────────────────────┐
│ Area     │ Files                                                                             │
├──────────┼───────────────────────────────────────────────────────────────────────────────────┤
│ Schema   │ lib/db/schema/schema.sqlite.ts, local adapter migrate, Supabase SQL script        │
├──────────┼───────────────────────────────────────────────────────────────────────────────────┤
│ Authz    │ lib/auth/types.ts, lib/services/_authz.ts, new lib/auth/privileges.ts             │
├──────────┼───────────────────────────────────────────────────────────────────────────────────┤
│ Gates    │ middleware.ts, app/admin/layout.tsx, lib/actions/admin.ts, services above         │
├──────────┼───────────────────────────────────────────────────────────────────────────────────┤
│ Staff UI │ app/admin/support-staff/page.tsx, actions in lib/actions/admin.ts or new file     │
├──────────┼───────────────────────────────────────────────────────────────────────────────────┤
│ Chat     │ new service/actions/components; app/admin/support/page.tsx; root or shared layout │
├──────────┼───────────────────────────────────────────────────────────────────────────────────┤
│ Config   │ lib/config/site.ts adminNav; maybe features.ts flag LIVE_SUPPORT_CHAT             │
├──────────┼───────────────────────────────────────────────────────────────────────────────────┤
│ Mobile   │ widget positioning constants; coordinate with DashboardMobileNav height           │
└──────────┴───────────────────────────────────────────────────────────────────────────────────┘

───

Risks & mitigations

┌─────────────────────────────────────────┬───────────────────────────────────────────────────────────────────┐
│ Risk                                    │ Mitigation                                                        │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Privilege bypass if only UI is filtered │ Every service + action re-checks capability                       │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Middleware still admin-only             │ Explicitly allow support + page-level privilege                   │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Support account uses public register    │ Admin-only create path; block elevating role via register         │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Chat spam / guest abuse                 │ Rate limits, max message length, optional captcha later           │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ FAB covers bottom nav                   │ Dashboard-mobile-only bottom offset; test safe-area               │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ SQLite + multi-instance poll            │ Fine for single node; Supabase later still works with same schema │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Accidental full admin power             │ Default privileges minimal (chat.access only)                     │
└─────────────────────────────────────────┴───────────────────────────────────────────────────────────────────┘

───

Open decisions (please confirm)

1. Guest chat on marketing pages?
   • Recommended: Yes (name + email), plus full resume for logged-in users.

2. Default privileges for new support staff?
   • Recommended: Only chat.access until admin toggles more.

3. Conversation assignment?
   • Recommended v1: Shared inbox (any privileged staff can reply); assignment as Phase 3.

4. Realtime approach?
   • Recommended: Polling while open (~2–3s); no third-party widget.

5. Support staff dashboard access?
   • Recommended: Staff go to /admin (filtered); no investor dashboard unless needed.

6. Scope of first PR?
   • Recommended: Phase 1 + Phase 2 together if you want one ship; otherwise RBAC first.

───

Success criteria

• [ ] Chat icon on all major surfaces; on mobile dashboard it floats above bottom nav without overlap
• [ ] User can open chat, send message, see support reply without refresh thrashing (poll keeps it live)
• [ ] Admin creates support user with email/password
• [ ] Admin can toggle each listed privilege per person
• [ ] Support with only kyc.view can open KYC list but cannot approve
• [ ] Support without settings.apy cannot hit APY update action even via forged form
• [ ] Full admin retains all powers; support cannot manage other support privileges

───

Answer to all open decisions: Recommendations approved. Proceed.