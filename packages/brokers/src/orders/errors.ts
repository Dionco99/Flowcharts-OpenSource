// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
export class RealMoneyConfirmationRequired extends Error {
  constructor() {
    super("Real-money placement requires confirmRealMoney to be true. The default is off.");
    this.name = "RealMoneyConfirmationRequired";
  }
}

export class LiveNetworkDisabled extends Error {
  constructor() {
    super("Live network calls are disabled. This process places demo and paper orders only.");
    this.name = "LiveNetworkDisabled";
  }
}

export class ProtectionNotSupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtectionNotSupported";
  }
}

export class DemoUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoUnavailable";
  }
}

export class InterfaceOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterfaceOnlyError";
  }
}

export class PropFirmAutomationBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PropFirmAutomationBlocked";
  }
}

export class BrokerRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerRequestError";
  }
}

export class OrderRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderRejected";
  }
}
