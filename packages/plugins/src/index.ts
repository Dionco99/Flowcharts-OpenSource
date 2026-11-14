// SPDX-License-Identifier: Apache-2.0

export { ERROR_CODES, FlowchartError, type FlowchartErrorCode } from "./errors.js";
export { API_VERSION, SDK_VERSION } from "./version.js";
export {
  readParameters,
  validateParameterSpecs,
  type ParameterOption,
  type ParameterSpec,
  type ParameterType,
  type Scalar,
} from "./parameters.js";
export {
  TIMEFRAMES,
  assertSealed,
  assertSymbolView,
  isDecimal,
  isTimestamp,
  type Bar,
  type SessionClock,
  type SymbolView,
  type Timeframe,
  type Window,
} from "./window.js";
export {
  type Indicator,
  type IndicatorInput,
  type IndicatorResult,
  type PlotSpec,
  type PlotStyle,
} from "./indicator.js";
export {
  type BrokerPort,
  type CloseRequest,
  type OrderPatch,
  type PlaceOrder,
  type ProtectionPatch,
  type Strategy,
  type StrategyContext,
} from "./strategy.js";
export { definePlugin, isPluginId, validatePlugin, type FlowchartPlugin } from "./plugin.js";
export { PluginHost } from "./host.js";
