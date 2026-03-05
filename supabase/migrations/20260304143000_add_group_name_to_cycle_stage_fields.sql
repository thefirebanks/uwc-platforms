alter table public.cycle_stage_fields
  add column if not exists group_name text;

update public.cycle_stage_fields
set group_name = case
  when field_key in (
    'secondaryYear2025',
    'isUpperThird',
    'hasMinimumAverage14',
    'hasStudiedIb',
    'ibInstructionYear'
  ) then 'Requisitos académicos'
  when field_key in (
    'priorUwcPeruSelectionParticipation',
    'otherCountrySelection2025',
    'uwcDiscoveryChannel'
  ) then 'Participación previa'
  when field_key in (
    'fullName',
    'firstName',
    'paternalLastName',
    'maternalLastName',
    'documentType',
    'documentNumber',
    'dateOfBirth',
    'ageAtEndOf2025',
    'gender',
    'nationality',
    'countryOfBirth',
    'countryOfResidence'
  ) then '👤 Identidad'
  when field_key in (
    'homeAddressLine',
    'homeAddressNumber',
    'homeDistrict',
    'homeProvince',
    'homeRegion'
  ) then '📍 Dirección'
  when field_key in (
    'mobilePhone',
    'landlineOrAlternativePhone'
  ) then '📱 Contacto'
  when field_key in (
    'hasDisability',
    'hasLearningDisability'
  ) then '♿ Accesibilidad'
  when field_key in (
    'guardian1FullName',
    'guardian1HasLegalCustody',
    'guardian1Email',
    'guardian1MobilePhone'
  ) then 'Madre o apoderado/a legal 1'
  when field_key in (
    'guardian2FullName',
    'guardian2HasLegalCustody',
    'guardian2Email',
    'guardian2MobilePhone'
  ) then 'Padre o apoderado/a legal 2'
  when field_key in (
    'schoolName',
    'gradeAverage',
    'schoolDirectorName',
    'schoolDirectorEmail',
    'schoolAddressLine',
    'yearsInCurrentSchool',
    'schoolPublicOrPrivate',
    'receivedSchoolScholarship'
  ) then '🏫 Información del colegio'
  else group_name
end
where coalesce(nullif(trim(group_name), ''), '') = '';
