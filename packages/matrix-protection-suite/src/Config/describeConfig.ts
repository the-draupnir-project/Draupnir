// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { TObject } from "@sinclair/typebox";
import {
  ConfigDescription,
  StandardConfigDescription,
} from "./ConfigDescription";

export type DescribeConfig<TConfigProperties extends TObject> = {
  schema: TConfigProperties;
};

export function describeConfig<TConfigProperties extends TObject>(
  description: DescribeConfig<TConfigProperties>
): ConfigDescription<TConfigProperties> {
  return new StandardConfigDescription(description.schema);
}
