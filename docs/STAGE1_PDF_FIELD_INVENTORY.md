# Stage 1 Field Inventory (From Official PDF)

Source PDF:
- `UWC_DUMMY_APPLICATION_1st-STAGE_PS2026-9446653533_202602191958.pdf` (local reference PDF)

Extraction basis:
- Text extracted from flattened PDF export (no embedded AcroForm metadata available).
- Scope includes applicant-facing Stage 1 tasks (including conditional/hidden applicant tasks).

Out of scope for this inventory:
- Recommender-only form fields (teacher/friend recommendation form bodies).
- Committee evaluator/reviewer forms.

## 1) Cumplimiento de los requisitos

Top-level: `Cumplimiento de los requisitos`

| Field | Type | Nested Under | Conditional |
|---|---|---|---|
| ¿Cuál es tu año de nacimiento? | number | Cumplimiento de los requisitos | No |
| Fecha de nacimiento | date | Cumplimiento de los requisitos | No |
| País de nacimiento | short_text | Cumplimiento de los requisitos | No |
| País de residencia | short_text | Cumplimiento de los requisitos | No |
| Segunda nacionalidad | short_text | Cumplimiento de los requisitos | Sí (si aplica) |
| ¿Qué año de educación secundaria estás cursando actualmente (2025)? | short_text | Cumplimiento de los requisitos | No |
| ¿Perteneces al tercio superior de tu promoción? | short_text | Cumplimiento de los requisitos | No |
| ¿Tienes como mínimo 14, o B, de promedio durante toda la secundaria? | short_text | Cumplimiento de los requisitos | No |
| ¿Has estudiado o te encuentras estudiando el Bachillerato Internacional (IB)? | short_text | Cumplimiento de los requisitos | No |
| ¿Qué año de instrucción tienes del Bachillerato Internacional (IB)? | short_text | Cumplimiento de los requisitos | Sí (si respondió IB=Sí) |
| ¿Has participado anteriormente en un Proceso de Selección de UWC Perú? | short_text | Cumplimiento de los requisitos | No |
| Este año 2025, ¿has participado en un Proceso de Selección en otro país para ingresar a un UWC en el 2026? | short_text | Cumplimiento de los requisitos | No |
| ¿Cómo te enteraste de UWC por primera vez? | short_text | Cumplimiento de los requisitos | No |

## 2) Información personal

Top-level: `Información personal`

### 2.1 Sección 1: Tu información personal

| Field | Type | Nested Under | Conditional |
|---|---|---|---|
| Nombre(s) | short_text | Información personal > Sección 1 | No |
| Apellido paterno | short_text | Información personal > Sección 1 | No |
| Apellido materno | short_text | Información personal > Sección 1 | Sí (si aplica) |
| Tipo de documento | short_text | Información personal > Sección 1 | No |
| Número de documento | short_text | Información personal > Sección 1 | No |
| Edad al 31 de diciembre 2025 | number | Información personal > Sección 1 | No |
| Fecha de nacimiento | date | Información personal > Sección 1 | No |
| Género | short_text | Información personal > Sección 1 | No |
| País de nacimiento | short_text | Información personal > Sección 1 | No |
| País de residencia | short_text | Información personal > Sección 1 | No |
| Dirección de residencia - Calle/Jr./Av./Mz./AA.HH | short_text | Información personal > Sección 1 > Dirección | No |
| Dirección de residencia - Número/Lote | short_text | Información personal > Sección 1 > Dirección | No |
| Dirección de residencia - Distrito | short_text | Información personal > Sección 1 > Dirección | No |
| Dirección de residencia - Provincia | short_text | Información personal > Sección 1 > Dirección | No |
| Dirección de residencia - Región | short_text | Información personal > Sección 1 > Dirección | No |
| Teléfono celular | short_text | Información personal > Sección 1 | No |
| Teléfono fijo / alternativo | short_text | Información personal > Sección 1 | Sí (si aplica) |
| ¿Posees alguna discapacidad? | short_text | Información personal > Sección 1 | Sí (si aplica) |
| ¿Posees alguna discapacidad de aprendizaje? | short_text | Información personal > Sección 1 | Sí (si aplica) |

### 2.2 Sección 2: Información de padre/madre/apoderados legales

| Field | Type | Nested Under | Conditional |
|---|---|---|---|
| Estado civil de tus padres/apoderados | short_text | Información personal > Sección 2 | No |
| Nombres y apellidos de tu madre o apoderado/a legal 1 | short_text | Información personal > Sección 2 > Apoderado 1 | No |
| ¿Tu madre o apoderado/a legal 1 tiene tu custodia legal? | short_text | Información personal > Sección 2 > Apoderado 1 | No |
| Correo electrónico de tu madre o apoderado/a legal 1 | email | Información personal > Sección 2 > Apoderado 1 | No |
| Teléfono celular de tu madre o apoderado/a legal 1 | short_text | Información personal > Sección 2 > Apoderado 1 | No |
| Nombres y apellidos de tu padre o apoderado/a legal 2 | short_text | Información personal > Sección 2 > Apoderado 2 | Sí (si aplica) |
| ¿Tu padre o apoderado/a legal 2 tiene tu custodia legal? | short_text | Información personal > Sección 2 > Apoderado 2 | Sí (si aplica) |
| Correo electrónico de tu padre o apoderado/a legal 2 | email | Información personal > Sección 2 > Apoderado 2 | Sí (si aplica) |
| Teléfono celular de tu padre o apoderado/a legal 2 | short_text | Información personal > Sección 2 > Apoderado 2 | Sí (si aplica) |

## 3) Información del colegio

Top-level: `Información del colegio`

| Field | Type | Nested Under | Conditional |
|---|---|---|---|
| Colegio | short_text | Información del colegio | No |
| Nombre del director/a | short_text | Información del colegio | No |
| Correo electrónico del director/a de tu colegio | email | Información del colegio | No |
| Dirección de tu colegio - Calle/Jr./Av./Mz./AA.HH | short_text | Información del colegio > Dirección | No |
| Dirección de tu colegio - Número/Lote | short_text | Información del colegio > Dirección | No |
| Dirección de tu colegio - Distrito | short_text | Información del colegio > Dirección | No |
| Dirección de tu colegio - Provincia | short_text | Información del colegio > Dirección | No |
| Dirección de tu colegio - Región | short_text | Información del colegio > Dirección | No |
| Dirección de tu colegio - País | short_text | Información del colegio > Dirección | No |
| Número de años que has estudiado en tu actual colegio | number | Información del colegio | No |
| ¿Tu colegio actual es público o privado? | short_text | Información del colegio | No |
| Tipo de colegio (puede ser múltiple) | long_text | Información del colegio | Sí (multiselección) |
| ¿Recibes o has recibido una beca en tu actual colegio? | short_text | Información del colegio | No |

## 4) Hoja de vida e interés en UWC

Top-level: `Hoja de vida & interés en UWC`

| Field | Type | Nested Under | Conditional |
|---|---|---|---|
| ¿Por qué quieres ir a un UWC? | long_text | Hoja de vida & interés > Interés en UWC | No |
| ¿Por qué consideras que deberías ser seleccionado/a para ir a un colegio UWC? | long_text | Hoja de vida & interés > Interés en UWC | No |
| ¿A qué colegio(s) UWC te gustaría ir? (máx. 3) | long_text | Hoja de vida & interés > Interés en UWC | No |
| Curso o actividad 1 | long_text | Hoja de vida & interés > Hoja de vida | No |
| Reconocimiento | long_text | Hoja de vida & interés > Hoja de vida | No |
| Curso/tema/área que te guste especialmente | long_text | Hoja de vida & interés > Hoja de vida | No |
| ¿Qué te gusta hacer en tu tiempo libre? | long_text | Hoja de vida & interés > Hoja de vida | No |
| Descríbete en tres palabras + ejemplo | long_text | Hoja de vida & interés > Hoja de vida | No |

## 5) Documentos obligatorios y condicionales

Top-level: `Documentos`

| Field | Type | Nested Under | Conditional |
|---|---|---|---|
| Copia del DNI | file | Documentos > Identidad | Sí (si documento principal es DNI) |
| Copia del Carnet de Extranjería | file | Documentos > Identidad | Sí (si aplica) |
| Copia del pasaporte | file | Documentos > Identidad | Sí (si aplica) |
| Copia del Certificado Oficial de Estudios / Constancia de Logros / Libretas | file | Documentos > Académicos | No |
| Archivo Excel de Promedio de Notas | file | Documentos > Académicos | No |
| Copia de Constancia de Tercio Superior | file | Documentos > Académicos | Sí (si postulante declaró tercio superior) |
| Autorización de Postulación (padre/madre/tutor legal) | file | Documentos > Consentimientos | No |
| Fotografía personal (tipo carnet) | file | Documentos > Identidad visual | No |
| Constancia de pago por postulación | file | Documentos > Pago | Sí (si no hay exoneración total) |
| ¿Has recibido asistencia financiera para el pago? | short_text | Documentos > Pago | No |
| Solicitud de Asistencia Financiera firmada | file | Documentos > Pago | Sí (si recibió asistencia financiera) |
| Número de operación de depósito/transferencia | short_text | Documentos > Pago | Sí (si realiza pago) |

## 6) Notas oficiales de secundaria (formulario detallado)

Top-level: `Promedio de Notas > Notas oficiales secundaria` (condicional/oculto en export)

### 6.1 Campos repetidos por grado

Estos campos aparecen para cada grado: `PRIMERO`, `SEGUNDO`, `TERCERO`, `CUARTO`, `QUINTO`.

Tipo de campo para cada curso: `number`  
Anidamiento: `Promedio de Notas > Notas oficiales secundaria > Grado {GRADO}`

Lista completa de cursos por grado:
1. Arte
2. Arte y cultura
3. Ciencia y tecnología
4. Ciencia, tecnología y ambiente
5. Ciencias sociales
6. Comunicación
7. Desarrollo personal, ciudadanía y cívica
8. Educación física
9. Educación para el trabajo
10. Educación religiosa
11. Formación ciudadana y cívica
12. Historia, geografía y economía
13. Inglés
14. Matemática
15. Persona, familia y relaciones humanas
16. Castellano como segunda lengua
17. Gestiona su aprendizaje de manera autónoma
18. Se desenvuelve en entornos virtuales generados por las TIC
19. Promedio grado {GRADO}

### 6.2 Campo final adicional

| Field | Type | Nested Under | Conditional |
|---|---|---|---|
| Comentarios (discrepancias/notas no registradas arriba) | long_text | Promedio de Notas > Notas oficiales secundaria | Sí (si aplica) |

## 7) Solicitud de cartas de recomendación (lado postulante)

Top-level: `Solicitudes de recomendación`

Campos explícitos en PDF (instrucciones del flujo):
- Solicitar carta a `profesor/a o tutor/a` mediante correo electrónico.
- Solicitar carta a `amigo/a` mediante correo electrónico.
- Sección de mensaje personalizado al enviar solicitud.

Para implementación Stage 1, los datos mínimos del postulante a capturar son:
| Field | Type | Nested Under | Conditional |
|---|---|---|---|
| Correo de recomendador/a tutor/profesor/mentor | email | Solicitudes de recomendación > Tutor/Profesor/Mentor | No |
| Correo de recomendador/a amigo/a | email | Solicitudes de recomendación > Amigo/a | No |
| Mensaje personalizado para solicitud de recomendación | long_text | Solicitudes de recomendación | Sí (si desea personalizar) |

## 8) Cross-check de completitud respecto al PDF

Incluido en este inventario:
- Requisitos de elegibilidad.
- Información personal (sección estudiante y apoderados).
- Información del colegio.
- Ensayos/hoja de vida.
- Todos los documentos solicitados (obligatorios y condicionales).
- Matriz completa de notas oficiales por grado (todos los cursos listados en el PDF).
- Datos de solicitud de recomendación del lado postulante.

No incluido deliberadamente:
- Preguntas respondidas por recomendadores.
- Cuestionario de evaluación interna del comité.
