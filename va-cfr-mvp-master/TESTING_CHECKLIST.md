# Testing Checklist

Use this checklist before sharing the app with outside testers.

## Core Smoke Test

1. Open the homepage and confirm the app loads without console errors.
2. Search for a common condition like `PTSD`, `tinnitus`, or `migraines`.
3. Open a condition detail page and confirm:
   - the detail header renders correctly
   - `Add to Workspace` works
   - `Add as Secondary` works
4. Add at least 3 conditions to the workspace and set one as primary.
5. Link at least one secondary condition and verify the claim tree updates.

## Workspace Flows

1. Add notes to one condition and refresh the page.
2. Add at least one timeline entry and export the timeline.
3. Add at least one evidence link and confirm it shows up in:
   - the condition detail view
   - Evidence Hub
   - Evidence Binder
4. Save a snapshot, make a change, compare it, and restore it.
5. Save a claim profile, create a blank profile, then load the saved one back.

## Document Intake

1. Paste sample text into Document Intake and run analysis.
2. Save the text to the document library.
3. Use the extractor preview and confirm:
   - note preview renders
   - timeline preview renders
   - evidence preview renders
4. Save an extractor draft packet and reopen it from the saved packet library.
5. Test packet library filtering, sorting, pinning, archive, and compare.

## Export and Review

1. Run Claim Strategy Coach.
2. Run Packet Review.
3. Run Submission Prep.
4. Export:
   - Quick Review packet
   - Veteran packet
   - Representative packet
   - full backup JSON
5. Import the backup JSON and confirm workspace state, homepage personalization, and presets restore.

## Visual and Responsive Checks

1. Test in light mode and dark mode.
2. Test on desktop width.
3. Test on tablet width.
4. Test on narrow mobile width.
5. Confirm that:
   - top navigation remains usable
   - collapsed workspace sections still reopen correctly
   - no light-blue text is unreadable

## Suggested Tester Prompts

Ask testers to answer these questions:

- Could you figure out how to start without explanation?
- Did any section feel too dense or confusing?
- Did you trust the outputs the app generated?
- Was anything visually hard to read?
- What part of the workflow felt most useful?
- What part felt unfinished or too complex?
