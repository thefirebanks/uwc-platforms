# TODOS for Admin View

These are follow-ups to revisit when aligning the admin form-builder/editor experience with the applicant-facing mockup styling changes.

1. Re-evaluate hidden school fields in applicant view
The applicant form currently suppresses several school fields (`schoolAddressNumber`, `schoolDistrict`, `schoolProvince`, `schoolRegion`, `schoolCountry`, `schoolTypeDetails`) to match the mockup. If admin workflows depend on these fields being visible in applicant previews (or configurable per cycle), this should become a configurable layout rule instead of a hardcoded hidden list.

2. Confirm admin preview mode uses applicant field labels/placeholders intentionally
Applicant UI now uses a few mockup-specific display-label/placeholder overrides in the school section (for example, `Promedio general (0–20)` and `Correo del director/a`). If the admin screen previews the same renderer and needs canonical database labels, add an `appearanceMode` / `viewerRole` switch.

3. Decide whether admin field editing should share applicant text-input chrome
Applicant text fields now apply mockup-specific `sx` styling locally in `ApplicantApplicationForm`. If admin users later need inline field editing inside the same renderer, confirm whether they should inherit this chrome or use a denser admin control style.

4. Prep intro step (`Antes de empezar`) is applicant-shell specific
The applicant flow now renders a dedicated `prep_intro` step before `Elegibilidad` (and excludes it from progress counts). If admin preview/edit screens reuse applicant navigation logic, confirm whether they should show this step, hide it, or make it configurable.

5. Applicant shell now supports a user-hidden sidebar state
Applicant users can hide the left sidebar (persisted in localStorage). If admin preview mode reuses this shell, verify whether that preference should apply in admin contexts or be scoped per role/view.
