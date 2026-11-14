// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export { AlertsError, type AlertErrorCode } from "./errors.ts";
export { Decimal, addDecimal, cmpDecimal, decimalToNumber, isDecimal, percentChange, subDecimal } from "./decimal.ts";
export { addMinutes, assertUtc, cmpTime, epochMs } from "./time.ts";
export {
  assertBar,
  assertBars,
  closedBars,
  isPriceSource,
  priceOf,
  sealBars,
  type Bar,
  type PriceSource,
  type SymbolSpec,
  type Tape,
} from "./bars.ts";
export {
  STUDY_NAMES,
  isStudyName,
  runStudy,
  studyPlots,
  type StudyName,
  type StudyParams,
} from "./studies.ts";
export { assertDrawing, barTouches, type Anchor, type Drawing } from "./drawings.ts";
export {
  assertRule,
  evaluateRule,
  firedOnBar,
  ruleUsesIndicator,
  type CompareOp,
  type CrossDirection,
  type Evaluation,
  type Level,
  type Operand,
  type Rule,
  type SeriesRef,
} from "./rules.ts";
export {
  assertDeliveryPlan,
  assertEmail,
  assertToken,
  assertWebhook,
  emailBody,
  pushBody,
  recordingPorts,
  webhookBody,
  type AlertEvent,
  type DeliveryKind,
  type DeliveryPlan,
  type DeliveryPorts,
  type DeliveryReceipt,
  type EmailPort,
  type EmailTarget,
  type OutboxItem,
  type PushPort,
  type PushTarget,
  type RecordingPorts,
  type SoundPort,
  type SoundTarget,
  type WebhookPort,
  type WebhookTarget,
} from "./delivery.ts";
export {
  AlertLog,
  type AlertDraft,
  type AlertRow,
  type FiredAlert,
  type SymbolBook,
} from "./log.ts";
export {
  hotlist,
  screen,
  type Headline,
  type HotlistRow,
  type ScreenFilter,
  type ScreenHit,
  type ScreenRow,
} from "./screener.ts";
export {
  WatchlistBook,
  searchSymbols,
  type SymbolInfo,
  type WatchItem,
  type WatchQuote,
  type Watchlist,
} from "./watchlist.ts";
export {
  ALERTS_STORAGE_KEY,
  WATCHLIST_STORAGE_KEY,
  browserStore,
  memoryStore,
  type KeyValueStore,
} from "./store.ts";
export { generateTape, type GenerateOptions } from "./fixture.ts";
export { demoScenario, type DemoScenario } from "./scenario.ts";
