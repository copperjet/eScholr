# Web Version Smoke Test Guide

## Prerequisites
- App running: `npx expo start --web`
- Browser window: 1024px+ width (desktop) or resize to test responsiveness
- Test each role with real or seeded data
- All 11 roles should work on both mobile (375px) and desktop (1024px+)

---

## Test Environment Setup

### Start Web App
```bash
cd "C:\Users\Denny\3D Objects\APPS\EduCore\eScholr"
npx expo start --web
# Opens http://localhost:8081 (or similar)
```

### Responsive Testing
- **Mobile:** Browser DevTools → Responsive Design Mode → iPhone 12 (390x844)
- **Tablet:** Responsive Design Mode → iPad (768x1024 landscape)
- **Desktop:** Full screen or DevTools (1280x800)

---

## Per-Role Smoke Test Checklist

### 1. Platform Admin (super_admin)
**Login:** school-code screen not shown (or different flow), login with super_admin account

- [ ] Dashboard loads (school grid visible)
- [ ] Click school → detail page loads
- [ ] Sidebar visible at desktop (1024px+)
- [ ] Bottom tabs hidden at desktop
- [ ] Back to mobile (375px) → bottom tabs appear, sidebar hidden
- [ ] Click notification icon → notifications page loads

**Expected:** All actions work on desktop and mobile

---

### 2. Admin (admin / principal / coordinator / hod)
**Login:** school code → login → redirects to admin dashboard

**Mobile (375px):**
- [ ] Dashboard loads with stats (students, staff, reports, attendance)
- [ ] Tap "Students" tab → list loads
- [ ] Tap student → detail page loads
- [ ] Tap "Edit" → edit form works, submit saves
- [ ] Tap "More" tab → menu items clickable
- [ ] Tap back → returns to dashboard

**Desktop (1024px+):**
- [ ] Sidebar visible on left (260px width)
- [ ] Dashboard content on right
- [ ] Click sidebar "Dashboard" → active state highlighted
- [ ] Click sidebar "Students" → Students page loads
- [ ] Click student → detail loads (verify sidebar stays visible)
- [ ] No bottom tabs visible
- [ ] Resize to 375px → sidebar hides, tabs appear

**Scoped Admin Only (principal/coordinator/hod):**
- [ ] StreamPicker visible above stats
- [ ] Select different stream → all stats update (students count, attendance, reports)
- [ ] Sidebar shows "Filter by Class" section (if implemented)

**Expected:** Sidebar appears/disappears correctly at 1024px threshold

---

### 3. HRT (Homeroom Teacher)
**Login:** school code → login → redirects to HRT dashboard

**Core Actions:**
- [ ] Dashboard loads (class info, attendance card, marks progress)
- [ ] Tap "Attendance" tab → register loads with student list
- [ ] Mark 3 students present/absent (tap student, select status)
- [ ] Tap "Submit Register" → modal/sheet appears with close button (X)
- [ ] Verify modal has close button on web (no swipe needed)
- [ ] Submit → register locks, "Submitted" message appears
- [ ] Tap "Marks" tab → assignment selector loads
- [ ] Select assignment → enter marks for 2 students
- [ ] Tap "Save" for one student → saves without page reload
- [ ] Tap "Daybook" tab → daybook list loads
- [ ] Tap "New Entry" → sheet/modal opens with close button
- [ ] Fill form, tap "Create" → added to list
- [ ] Tap "More" → menu items work

**Desktop (1024px+):**
- [ ] Sidebar shows HRT nav items
- [ ] Click sidebar "Attendance" → loads same register (not tab)
- [ ] Sidebar stays visible while editing attendance
- [ ] Bottom tabs hidden

**Expected:** All attendance, marks, daybook actions work; bottom sheet has close button on web

---

### 4. ST (Subject Teacher)
**Login:** school code → login → redirects to ST dashboard

**Core Actions:**
- [ ] Dashboard loads (subjects with progress bars)
- [ ] Tap "Marks" tab (or click sidebar) → subjects listed
- [ ] Tap subject → marks entry form loads
- [ ] Enter marks for 3 students, tap save for each
- [ ] Verify marks don't require page reload
- [ ] Tap "Homework" tab → form to create assignment
- [ ] Fill form, tap "Create" → appears in homework list
- [ ] Tap "More" → menu items clickable

**Desktop (1024px+):**
- [ ] Sidebar visible with ST nav items
- [ ] All actions work via sidebar clicks

**Expected:** Subject teacher flow complete on both platforms

---

### 5. Finance Officer
**Login:** school code → login → redirects to finance dashboard

**Core Actions:**
- [ ] Dashboard loads (paid/unpaid/outstanding stats)
- [ ] Tap "Students" (in quick actions) → student list loads
- [ ] Tap student card → detail page, payment history visible
- [ ] Tap "Record Payment" button → form opens/modal appears
- [ ] Fill payment amount, tap "Save" → payment recorded
- [ ] Verify payment appears in history
- [ ] Back to dashboard, stats update
- [ ] Tap "More" → menu items work

**Desktop (1024px+):**
- [ ] Sidebar visible
- [ ] Student search/filtering works

**Expected:** Payment recording flow complete on both platforms

---

### 6. Front Desk
**Login:** school code → login → redirects to front desk dashboard

**Core Actions:**
- [ ] Dashboard loads (inquiries, visitors, applications counts)
- [ ] Tap "Inquiries" tab → inquiry list loads (may be empty)
- [ ] Tap "+" or "New Inquiry" button → form appears/sheet opens
- [ ] Fill inquiry details, tap "Create" → appears in list
- [ ] Tap inquiry → detail page loads, can edit status
- [ ] Tap "Visitors" → visitor log/sign-in form
- [ ] If sign-in form exists, can submit
- [ ] Tap "More" → menu items work

**Expected:** Inquiry and visitor workflows work on both platforms

---

### 7. HR
**Login:** school code → login → redirects to HR dashboard

**Core Actions:**
- [ ] Dashboard loads (staff count, pending leave count with staff names visible)
- [ ] Verify staff names display correctly (not blank)
- [ ] Tap "Leave" tab → leave requests list loads
- [ ] Tap request → detail page shows staff name, dates, reason
- [ ] Tap "Approve" button → modal appears or confirm dialog
- [ ] Tap "Approve" → request marked approved, back to list
- [ ] Select another request, tap "Reject", enter reason
- [ ] Tap "Reject" → request marked rejected
- [ ] Tap "More" → menu items work

**Expected:** Leave approval flow works; staff names display

---

### 8. Student
**Login:** school code → login → redirects to student dashboard

**Core Actions:**
- [ ] Dashboard loads with:
  - Profile card (name, grade, stream)
  - Attendance percentage
  - Latest marks (or "No marks yet")
  - Latest report (or empty)
  - Latest daybook entry (if any)
- [ ] Verify no "Loading..." text (should be skeletons only)
- [ ] Tap "Marks" tab → marks grouped by subject
- [ ] Tap subject → marks list shows FA1, FA2, Summative
- [ ] Verify semester filter applied (only active semester shown)
- [ ] Tap "Reports" tab → report card loads
- [ ] Tap report → PDF viewer loads (Google Docs viewer)
- [ ] Verify PDF displays (may take 1-2 seconds)
- [ ] Tap "Homework" tab → homework assignments list
- [ ] Tap assignment → detail + "Submit" button
- [ ] Tap "More" → menu items work

**Mobile:**
- [ ] Bottom tabs visible, clickable

**Desktop:**
- [ ] Sidebar visible with Student nav items
- [ ] Sidebar stays visible while viewing marks/reports

**Expected:** All student flows work; PDFs load on web

---

### 9. Parent
**Login:** school code → login → redirects to parent dashboard

**Core Actions (Single Child):**
- [ ] Dashboard loads with child's info
- [ ] Stats visible (attendance, report, daybook)
- [ ] Tap "Homework" tab → child's homework list
- [ ] Tap "Reports" tab → child's report cards, can open PDF
- [ ] Tap "Fees" tab → invoices list, can expand to see items
- [ ] Tap "Messages" tab → can view/send messages
- [ ] Tap "More" → menu items work

**Core Actions (Multiple Children):**
- [ ] Dashboard shows child selector (horizontal scroll)
- [ ] Tap different child → dashboard updates with their data
- [ ] Verify all data is filtered to selected child
- [ ] Child selector scrolls horizontally on mobile and desktop

**Desktop:**
- [ ] Sidebar visible with Parent nav items
- [ ] Child selector works (horizontal scroll if many children)
- [ ] All tabs accessible via sidebar

**Expected:** Multi-child support works; all parent flows functional

---

### 10. HRT (Alternative Test: Attendance Correction)
**Login:** HRT, go to attendance from previous day

**Core Actions:**
- [ ] Register from yesterday visible (if within 24h)
- [ ] Tap "Correct Register" button
- [ ] Select student to correct
- [ ] Modal/sheet opens with status options
- [ ] Change status (e.g., absent → present)
- [ ] Tap "Save Correction"
- [ ] Register updated

**Expected:** Correction flow works; modal/sheet has close button on web

---

### 11. Admin: School Structure / Settings
**Login:** Admin

**Core Actions:**
- [ ] Navigate to "School Structure" (via More or sidebar)
- [ ] List of grades/streams loads
- [ ] Can create/edit/delete (if permitted)
- [ ] Navigate to "Semesters" → list loads
- [ ] Can create new semester or toggle "is_active"
- [ ] Navigate to "Announcements" → can create announcement
- [ ] Fill form, tap "Send" → appears in feeds

**Expected:** All admin settings work on web

---

## Responsive Test Matrix

Run each role through these widths:

| Device       | Width  | Expected Behavior                 | Status |
|--------------|--------|-----------------------------------|--------|
| Mobile       | 375px  | Bottom tabs visible, sidebar hidden | [ ]   |
| Mobile Land  | 667px  | Bottom tabs visible, sidebar hidden | [ ]   |
| Tablet       | 768px  | Bottom tabs visible, sidebar hidden | [ ]   |
| Tablet Land  | 1024px | Sidebar visible, tabs hidden       | [ ]   |
| Desktop      | 1280px | Sidebar visible, full layout       | [ ]   |
| Wide         | 1920px | Sidebar + wide content area        | [ ]   |

---

## Critical Success Criteria

✅ **Must Pass (Blocking):**
1. All 11 roles can login and reach their dashboard
2. Sidebar appears/disappears at 1024px breakpoint
3. Bottom tabs work on mobile (375px)
4. Navigation works on both platforms
5. Bottom sheets have close button on web (can dismiss)
6. Forms submit without errors
7. Data loads and displays correctly
8. PDF viewer works on web
9. No console errors in DevTools

⚠️ **Should Pass (Nice to Have):**
1. Smooth animations on desktop
2. Dark mode toggles work
3. Keyboard navigation (Tab key) works
4. Responsive resize doesn't break layout
5. All icons render correctly

❌ **Known Limitations (Acceptable):**
1. Haptic feedback not available on web (disabled gracefully)
2. Biometric not available on web (doesn't show modal)
3. Push notifications not available on web (disabled gracefully)
4. Camera/file picker may vary by browser

---

## Common Issues & Fixes

### Issue: Sidebar not appearing at 1024px
**Fix:** Check `lib/responsive.ts` breakpoint, verify window width detection

### Issue: Bottom sheet can't be dismissed on web
**Fix:** Look for close button (X) in header; if missing, the BottomSheet component needs the fix from WEB_COMPATIBILITY.md

### Issue: "Loading..." text visible instead of skeletons
**Fix:** Screens need to use skeleton components instead of text; check all screens have been updated (completed in prior session)

### Issue: PDF doesn't load
**Fix:** Verify Google Docs viewer URL format; check network tab for 403/404; may be CORS issue

### Issue: Form fields not accepting input on web
**Fix:** Ensure TextInput is properly styled; check onChangeText handler

### Issue: Sidebar text/icons overlap or misaligned on wide screens
**Fix:** Sidebar width is fixed (260px), content should flex to fill remaining space

---

## Test Results Template

```
Session: [Date/Time]
Tester: [Name]
Browser: [Chrome/Firefox/Safari]
Device: [Desktop/Laptop/Tablet]
Resolution: [e.g., 1280x800]

Role: [admin/hrt/st/student/parent/etc]
✅ Login works
✅ Dashboard loads
✅ Core action 1 works
✅ Core action 2 works
✅ Core action 3 works
✅ Sidebar visible at 1024px
✅ Tabs hidden at 1024px
⚠️ [Any issues or observations]

Overall: [PASS/FAIL]
```

---

## Performance Notes

Expected load times on web:
- Dashboard: 1-2 seconds
- Form submit: 0.5-1 second
- PDF load: 2-3 seconds
- Navigation: <500ms

If slower, check:
- Network tab for API response times
- React DevTools for excessive re-renders
- Lighthouse performance metrics

---

## Browser Compatibility

- Chrome 90+: ✅ Full support
- Firefox 88+: ✅ Full support
- Safari 14+: ✅ Full support (test on macOS/iOS Safari)
- Edge 90+: ✅ Full support

---

## Next Steps After Testing

1. **If PASS:** Ready for production deployment
2. **If FAIL:** 
   - Gather console error messages
   - Screenshot responsive behavior
   - Note exact steps to reproduce
   - File bug report with all context

3. **Performance:**
   - Run Lighthouse audit
   - Check API response times
   - Identify slow screens

4. **Polish:**
   - Test dark mode on web
   - Check keyboard navigation (Tab, Enter, Escape)
   - Verify mobile menu interactions

---

## Sign-Off

- [ ] QA Lead: All tests passed on web
- [ ] Dev Lead: Ready to merge/deploy
- [ ] Date: _______________
