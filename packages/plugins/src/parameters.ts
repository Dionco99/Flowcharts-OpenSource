// SPDX-License-Identifier: Apache-2.0

import { FlowchartError } from "./errors.js";

export type Scalar = number | boolean | string;

export type ParameterType = "number" | "integer" | "boolean" | "string" | "select" | "color";

export interface ParameterOption {
  readonly value: string;
  readonly label: string;
}

export interface ParameterSpec {
  readonly key: string;
  readonly label: string;
  readonly type: ParameterType;
  readonly default: Scalar;
  readonly description?: string;
  readonly min?: number;
  readonly max?: number;
  /** UI hint. Values off the step are still accepted. */
  readonly step?: number;
  readonly options?: readonly ParameterOption[];
}

const KEY_PATTERN = /^[a-z][a-z0-9]*$/;
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function validateParameterSpecs(specs: readonly ParameterSpec[]): readonly ParameterSpec[] {
  const seen = new Set<string>();
  return Object.freeze(
    specs.map((spec) => {
      if (!KEY_PATTERN.test(spec.key)) {
        throw new FlowchartError("invalid_plugin", `Parameter key ${spec.key} must be lowercase.`);
      }
      if (seen.has(spec.key)) {
        throw new FlowchartError("invalid_plugin", `Duplicate parameter ${spec.key}.`);
      }
      seen.add(spec.key);
      if (spec.label.trim() === "") {
        throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} needs a label.`);
      }
      if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) {
        throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} min is above max.`);
      }
      assertDefault(spec);
      return Object.freeze({
        ...spec,
        ...(spec.options
          ? { options: Object.freeze(spec.options.map((option) => Object.freeze({ ...option }))) }
          : {}),
      });
    }),
  );
}

function assertDefault(spec: ParameterSpec): void {
  switch (spec.type) {
    case "number":
      if (typeof spec.default !== "number" || !Number.isFinite(spec.default)) {
        throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} default must be a finite number.`);
      }
      assertRange(spec, spec.default);
      return;
    case "integer":
      if (typeof spec.default !== "number" || !Number.isInteger(spec.default)) {
        throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} default must be an integer.`);
      }
      assertRange(spec, spec.default);
      return;
    case "boolean":
      if (typeof spec.default !== "boolean") {
        throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} default must be a boolean.`);
      }
      return;
    case "string":
      if (typeof spec.default !== "string") {
        throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} default must be a string.`);
      }
      return;
    case "color":
      if (typeof spec.default !== "string" || !COLOR_PATTERN.test(spec.default)) {
        throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} default must be a #RGB or #RRGGBB color.`);
      }
      return;
    case "select": {
      if (!spec.options || spec.options.length === 0) {
        throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} needs options.`);
      }
      const values = new Set<string>();
      for (const option of spec.options) {
        if (option.value === "" || option.label.trim() === "") {
          throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} has an empty option.`);
        }
        if (values.has(option.value)) {
          throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} repeats option ${option.value}.`);
        }
        values.add(option.value);
      }
      if (typeof spec.default !== "string" || !values.has(spec.default)) {
        throw new FlowchartError("invalid_plugin", `Parameter ${spec.key} default is not one of its options.`);
      }
      return;
    }
    default: {
      const never: never = spec.type;
      throw new FlowchartError("invalid_plugin", `Unknown parameter type ${String(never)}.`);
    }
  }
}

function assertRange(spec: ParameterSpec, value: number): void {
  if (spec.min !== undefined && value < spec.min) {
    throw new FlowchartError("invalid_argument", `Parameter ${spec.key} is below ${spec.min}.`);
  }
  if (spec.max !== undefined && value > spec.max) {
    throw new FlowchartError("invalid_argument", `Parameter ${spec.key} is above ${spec.max}.`);
  }
}

/** Fill defaults and reject a value of the wrong type or outside its range. Unknown keys are ignored. */
export function readParameters(
  specs: readonly ParameterSpec[],
  values: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, Scalar>> {
  const resolved: Record<string, Scalar> = {};
  for (const spec of specs) {
    const raw = values?.[spec.key];
    resolved[spec.key] = raw === undefined ? spec.default : coerce(spec, raw);
  }
  return Object.freeze(resolved);
}

function coerce(spec: ParameterSpec, raw: unknown): Scalar {
  switch (spec.type) {
    case "number": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw new FlowchartError("invalid_argument", `Parameter ${spec.key} must be a finite number.`);
      }
      assertRange(spec, raw);
      return raw;
    }
    case "integer": {
      if (typeof raw !== "number" || !Number.isInteger(raw)) {
        throw new FlowchartError("invalid_argument", `Parameter ${spec.key} must be an integer.`);
      }
      assertRange(spec, raw);
      return raw;
    }
    case "boolean":
      if (typeof raw !== "boolean") {
        throw new FlowchartError("invalid_argument", `Parameter ${spec.key} must be a boolean.`);
      }
      return raw;
    case "string":
      if (typeof raw !== "string") {
        throw new FlowchartError("invalid_argument", `Parameter ${spec.key} must be a string.`);
      }
      return raw;
    case "color":
      if (typeof raw !== "string" || !COLOR_PATTERN.test(raw)) {
        throw new FlowchartError("invalid_argument", `Parameter ${spec.key} must be a #RGB or #RRGGBB color.`);
      }
      return raw;
    case "select":
      if (typeof raw !== "string" || !spec.options?.some((option) => option.value === raw)) {
        throw new FlowchartError("invalid_argument", `Parameter ${spec.key} must be one of its options.`);
      }
      return raw;
    default: {
      const never: never = spec.type;
      throw new FlowchartError("invalid_argument", `Unknown parameter type ${String(never)}.`);
    }
  }
}
