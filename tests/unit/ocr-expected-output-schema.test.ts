import { describe, expect, it } from "vitest";
import {
  buildSchemaTemplateFromExpectedOutputFields,
  buildStructuredOcrExtraction,
  normalizeExpectedOutputFields,
  normalizeOcrOutputKey,
  parseExpectedOutputFieldsFromSchemaTemplate,
} from "@/lib/ocr/expected-output-schema";

describe("ocr expected output schema helpers", () => {
  it("normalizes and deduplicates OCR output keys", () => {
    const normalized = normalizeExpectedOutputFields([
      { key: " Fecha de Nacimiento ", type: "date" },
      { key: "fecha_de_nacimiento", type: "text" },
      { key: "NRO-DOC", type: "number" },
    ]);

    expect(normalized).toEqual([
      { key: "Fecha_de_Nacimiento", type: "date" },
      { key: "NRO-DOC", type: "number" },
    ]);
  });

  it("builds a deterministic schema template from simple field definitions", () => {
    const schema = buildSchemaTemplateFromExpectedOutputFields([
      { key: "nombre", type: "text" },
      { key: "fecha_nacimiento", type: "date" },
      { key: "numero_documento", type: "number" },
      { key: "promedio", type: "decimal" },
      { key: "validado", type: "boolean" },
    ]);

    expect(JSON.parse(schema)).toEqual({
      nombre: "string",
      fecha_nacimiento: "datetime",
      numero_documento: "int",
      promedio: "number",
      validado: "boolean",
    });
  });

  it("parses schema templates back into editable expected output fields", () => {
    const parsed = parseExpectedOutputFieldsFromSchemaTemplate(
      '{"nombre":"string","birthYear":"int","score":"number","signed":"boolean","dob":"datetime"}',
    );

    expect(parsed).toEqual([
      { key: "nombre", type: "text" },
      { key: "birthYear", type: "number" },
      { key: "score", type: "decimal" },
      { key: "signed", type: "boolean" },
      { key: "dob", type: "date" },
    ]);
  });

  it("builds structured extraction data with prefixed DB-style keys", () => {
    const structured = buildStructuredOcrExtraction({
      formFieldKey: "DNI",
      parsedPayload: {
        nombre: "Ada Lovelace",
        birthYear: 2009,
      },
      expectedOutputFields: [
        { key: "nombre", type: "text" },
        { key: "birthYear", type: "number" },
        { key: "documentNumber", type: "text" },
      ],
    });

    expect(structured.extractedValues).toEqual({
      nombre: "Ada Lovelace",
      birthYear: 2009,
    });
    expect(structured.prefixedValues).toEqual({
      DNI_nombre: "Ada Lovelace",
      DNI_birthYear: 2009,
    });
    expect(structured.missingKeys).toContain("documentNumber");
  });

  it("normalizes bare keys safely", () => {
    expect(normalizeOcrOutputKey(" 123 Numero Doc ")).toBe("field_123_Numero_Doc");
  });

  it("keeps underscores and dashes in OCR keys", () => {
    expect(normalizeOcrOutputKey("fecha-de_nacimiento")).toBe("fecha-de_nacimiento");
  });
});
