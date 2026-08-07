# Manual Test Script for Human Approval Agent (HITL)

Follow these steps to manually verify the implementation of the Human Approval Agent logic, ranking modification, and interview scheduling gate.

## Prerequisites
1. Ensure the application is running (`npm run dev`).
2. Ensure you are authenticated as a recruiter/admin.
3. Ensure there is at least one active job with some candidates in the pipeline (upload a dummy resume if needed).

## Test 1: Rejecting Without a Comment (Blocked)
1. Navigate to the job pipeline (`/jobs/$jobId`).
2. Click **Review** on any pending candidate to open the `ReviewDrawer`.
3. Clear any text in the "Add a comment" textarea.
4. Click the **Reject** button.
5. **Expected Result**: A toast error should appear saying "A comment is required when rejecting a candidate." and the candidate's status should remain unchanged.

## Test 2: Rejecting With a Comment (Success)
1. With the `ReviewDrawer` open for a candidate, type "Lacks required 5 years of experience." in the comment box.
2. Click the **Reject** button.
3. **Expected Result**: A success toast appears. The candidate's status in the list updates to "Rejected" with a red pill. The comment is saved to the database (visible in the audit logs).

## Test 3: Modifying Rank
1. Click **Review** on a candidate.
2. In the "Modify rank" input, enter a number (e.g., `1`).
3. Leave the comment box empty and click **Save rank**.
4. **Expected Result**: A toast error says "A comment is required to explain the rank modification."
5. Type "Moving to top, excellent GitHub profile" in the comment box.
6. Click **Save rank**.
7. **Expected Result**: A success toast appears. Close the drawer and verify that the pipeline list reorders to show this candidate at the specified rank position. Reload the page and verify the ordering persists.

## Test 4: Interview Scheduling Gate (Blocked)
1. Click **Review** on a candidate that is NOT approved (e.g., a new candidate or the rejected one).
2. Hover over the **Draft email** button.
3. **Expected Result**: The button is disabled and displays the tooltip: "Approve this candidate before scheduling or inviting them." (Note: If the candidate is "Rejected", the button is enabled for sending a rejection email, which is correct).
4. Navigate to the **Interviews** page (`/interviews`).
5. Click **Schedule round**.
6. In the candidate dropdown list, ensure that *only* candidates with an `approved` status are available. The rejected or unapproved candidates should not be selectable.

## Test 5: Approving and Scheduling (Success)
1. Go back to the pipeline and click **Review** on an unapproved candidate.
2. Enter a comment: "Strong fit."
3. Click **Approve & shortlist**.
4. **Expected Result**: The candidate's status changes to "Approved".
5. Open the `ReviewDrawer` for this approved candidate.
6. **Expected Result**: The **Draft email** button is now fully enabled for drafting an interview invite.
7. Navigate to the **Interviews** page (`/interviews`).
8. Click **Schedule round** and verify the candidate is now selectable.
