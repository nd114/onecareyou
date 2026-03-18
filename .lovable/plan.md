## Plan: Streamlined Tester Pack + In-App Bug Reporter

### 1. Streamline `docs/beta-tester-pack.md`

Rewrite the document to be concise (~2-3 pages per role). The current 463-line file will be cut significantly by:

- **Removing** verbose "What to Look For" guidance from each scenario (move to kickoff meeting agenda)
- **Removing** the detailed Google Forms questions section (they'll live in the actual Google Form)
- **Keeping** per-role content as a numbered task checklist (no tables, no explanatory columns)
- **Adding** a "Kickoff Meeting Agenda" section at the top listing topics to cover verbally
- **Structure per each of the 3 roles:** Brief context (2-3 sentences), account setup reminder, numbered task list (10-15 items max), link to feedback form

### 2. Build In-App Beta Bug Reporter

A floating "Report Bug" button visible to all users during beta, with a lightweight slide-out form.

**Database:**

- New `beta_bug_reports` table: `id`, `user_id` (nullable for anonymous), `page_url`, `category` (bug/design/suggestion), `description`, `screenshot_url` (optional), `browser_info` (auto-captured), `status` (new/reviewed/resolved), `created_at`
- RLS: authenticated users can insert and view their own reports; public insert allowed too since some testers may not be logged in

**UI Component:** `src/components/beta/BugReportButton.tsx`

- Fixed-position floating button (bottom-right, above any existing FABs)
- Opens a dialog/sheet with: category dropdown, description textarea, auto-captured metadata (current URL, browser, viewport)
- Submits to `beta_bug_reports` table
- Shows success toast on submit
- Branded with a small bug icon

**Integration:**

- Add the component to `App.tsx` so it appears globally
- Easy to remove post-beta by deleting the component and its import

### 3. Update Google Forms Feedback Questions

Completely remove, since we already captured it separately.