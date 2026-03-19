// Copyright (C) 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

export class ConstantPeriodBatch {
  private finished = false;
  private readonly timeoutID: NodeJS.Timeout;
  constructor(cb: () => void, delayMS = 0) {
    this.timeoutID = setTimeout(() => {
      this.finished = true;
      cb();
    }, delayMS);
  }

  public isFinished() {
    return this.finished;
  }

  public cancel() {
    clearTimeout(this.timeoutID);
    this.finished = true;
  }
}
