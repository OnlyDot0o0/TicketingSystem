import { describe, it, expect } from "vitest";
import { validateCustomFieldValue, slugifyKey, parseOptions, serializeOptions } from "@/lib/customFields";

function field(overrides: Partial<{ label: string; fieldType: string; required: boolean; options: string | null }> = {}) {
  return {
    label: overrides.label ?? "حقل",
    fieldType: overrides.fieldType ?? "TEXT",
    required: overrides.required ?? false,
    options: overrides.options ?? null,
  };
}

describe("validateCustomFieldValue", () => {
  describe("TEXT / TEXTAREA", () => {
    it("required + blank -> error naming the field", () => {
      const err = validateCustomFieldValue(field({ fieldType: "TEXT", required: true, label: "الاسم" }), "");
      expect(err).toBe('الحقل "الاسم" مطلوب.');
    });
    it("required + whitespace-only -> still treated as blank", () => {
      const err = validateCustomFieldValue(field({ fieldType: "TEXT", required: true }), "   ");
      expect(err).not.toBeNull();
    });
    it("required + value -> valid", () => {
      expect(validateCustomFieldValue(field({ fieldType: "TEXT", required: true }), "hello")).toBeNull();
    });
    it("optional + blank -> valid", () => {
      expect(validateCustomFieldValue(field({ fieldType: "TEXTAREA", required: false }), "")).toBeNull();
    });
  });

  describe("NUMBER", () => {
    it("required + blank -> error", () => {
      expect(validateCustomFieldValue(field({ fieldType: "NUMBER", required: true }), "")).not.toBeNull();
    });
    it("non-numeric value -> error", () => {
      const err = validateCustomFieldValue(field({ fieldType: "NUMBER", label: "العدد" }), "abc");
      expect(err).toBe('الحقل "العدد" يجب أن يكون رقمًا.');
    });
    it("valid number -> valid", () => {
      expect(validateCustomFieldValue(field({ fieldType: "NUMBER" }), "42")).toBeNull();
    });
    it("optional + blank -> valid (number check skipped)", () => {
      expect(validateCustomFieldValue(field({ fieldType: "NUMBER", required: false }), "")).toBeNull();
    });
  });

  describe("DATE", () => {
    it("required + blank -> error", () => {
      expect(validateCustomFieldValue(field({ fieldType: "DATE", required: true }), "")).not.toBeNull();
    });
    it("invalid date string -> error", () => {
      const err = validateCustomFieldValue(field({ fieldType: "DATE", label: "التاريخ" }), "not-a-date");
      expect(err).toBe('الحقل "التاريخ" يجب أن يكون تاريخًا صالحًا.');
    });
    it("valid date -> valid", () => {
      expect(validateCustomFieldValue(field({ fieldType: "DATE" }), "2024-01-01")).toBeNull();
    });
    it("optional + blank -> valid", () => {
      expect(validateCustomFieldValue(field({ fieldType: "DATE", required: false }), "")).toBeNull();
    });
  });

  describe("SELECT", () => {
    const options = JSON.stringify(["مركبة", "معدات", "مبنى"]);
    it("required + blank -> error", () => {
      expect(validateCustomFieldValue(field({ fieldType: "SELECT", required: true, options }), "")).not.toBeNull();
    });
    it("value not among options -> error", () => {
      const err = validateCustomFieldValue(field({ fieldType: "SELECT", label: "النوع", options }), "غير موجود");
      expect(err).toBe('قيمة غير صالحة للحقل "النوع".');
    });
    it("value among options -> valid", () => {
      expect(validateCustomFieldValue(field({ fieldType: "SELECT", options }), "معدات")).toBeNull();
    });
    it("optional + blank -> valid (no options check)", () => {
      expect(validateCustomFieldValue(field({ fieldType: "SELECT", required: false, options }), "")).toBeNull();
    });
  });

  describe("CHECKBOX — documented as never blocking required", () => {
    it("required + blank -> still valid (unchecked required checkbox is allowed)", () => {
      expect(validateCustomFieldValue(field({ fieldType: "CHECKBOX", required: true }), "")).toBeNull();
    });
    it("required + checked value -> valid", () => {
      expect(validateCustomFieldValue(field({ fieldType: "CHECKBOX", required: true }), "true")).toBeNull();
    });
    it("optional + blank -> valid", () => {
      expect(validateCustomFieldValue(field({ fieldType: "CHECKBOX", required: false }), "")).toBeNull();
    });
  });
});

describe("slugifyKey", () => {
  it("lowercases, transliterates ASCII, and dashes separators", () => {
    expect(slugifyKey("Asset Type")).toBe("asset-type");
  });
  it("falls back to a random field- slug for purely non-ASCII labels", () => {
    const key = slugifyKey("نوع الأصل");
    expect(key.startsWith("field-")).toBe(true);
  });
});

describe("parseOptions / serializeOptions", () => {
  it("round-trips a list of options", () => {
    const serialized = serializeOptions(["a", "b", " c "]);
    expect(parseOptions(serialized)).toEqual(["a", "b", "c"]);
  });
  it("parseOptions tolerates null/invalid JSON", () => {
    expect(parseOptions(null)).toEqual([]);
    expect(parseOptions("not json")).toEqual([]);
  });
});
