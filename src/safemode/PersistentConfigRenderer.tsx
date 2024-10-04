// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import {
  MatrixRoomAlias,
  MatrixRoomID,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ConfigParseError,
  ConfigPropertyError,
  PersistentConfigData,
} from "matrix-protection-suite";
import {
  renderMentionPill,
  renderRoomPill,
} from "../commands/interface-manager/MatrixHelpRenderer";

// FIXME: This is backwards, we should generate some kind of object that can be rendered by the interface manager,
// that already has all the information fetched.
export interface PersistentConfigRenderer {
  renderConfig(config: PersistentConfigData): Promise<Result<DocumentNode>>;
  renderStatusOfConfigAdaptors(
    adaptors: PersistentConfigData[]
  ): Promise<Result<DocumentNode>>;
}

function findError(
  propertyKey: string,
  errors: ConfigPropertyError[]
): ConfigPropertyError | undefined {
  const path = `/${propertyKey}`;
  return errors.find((error) => error.path.startsWith(path));
}

function findItemError(
  propertyKey: string,
  index: number,
  errors: ConfigPropertyError[]
): ConfigPropertyError | undefined {
  const path = `/${propertyKey}/${index}`;
  return errors.find((error) => error.path === path);
}

function renderPrimitiveValue(value: string, type: string): DocumentNode {
  return (
    <fragment>
      <code>{value}</code> <span>({type})</span>
    </fragment>
  );
}

function renderConfigPropertyValue(value: unknown): DocumentNode {
  if (typeof value === "object" && value !== null) {
    if (value instanceof MatrixRoomAlias || value instanceof MatrixRoomID) {
      return renderRoomPill(value);
    } else if (value instanceof MatrixUserID) {
      return renderMentionPill(value.toString(), value.toString());
    } else {
      return (
        <fragment>
          <code>{String(value)}</code>{" "}
          <span data-mx-color="#D2691E">(object)</span>
        </fragment>
      );
    }
  } else if (typeof value === "string") {
    return renderPrimitiveValue(value, "string");
  } else if (typeof value === "number") {
    return renderPrimitiveValue(String(value), "number");
  } else {
    return renderPrimitiveValue(String(value), "unknown");
  }
}

function renderConfigPropertyItem(
  propertyKey: string,
  index: number,
  value: unknown,
  errors: ConfigPropertyError[]
): DocumentNode {
  const error = findItemError(propertyKey, index, errors);
  return (
    <li>
      {renderConfigPropertyError(error)}
      <code>{index}</code>: {renderConfigPropertyValue(value)}
    </li>
  );
}

function renderConfigPropertyError(
  error: ConfigPropertyError | undefined
): string {
  return error === undefined ? "🟢" : "🔴";
}

function renderConfigProperty(
  propertyKey: string,
  config: PersistentConfigData,
  data: Record<string, unknown>,
  errors: ConfigPropertyError[]
): DocumentNode {
  const propertyValue = data[propertyKey];
  const error = findError(propertyKey, errors);
  if (Array.isArray(propertyValue)) {
    return (
      <li>
        {renderConfigPropertyError(error)}
        <code>{propertyKey}</code>:{" "}
        <ul>
          {propertyValue.map((value, index) =>
            renderConfigPropertyItem(propertyKey, index, value, errors)
          )}
        </ul>
      </li>
    );
  }
  return (
    <li>
      {renderConfigPropertyError(error)}
      <code>{propertyKey}</code>: {renderConfigPropertyValue(propertyValue)}
    </li>
  );
}

function renderBodgedConfig(value: unknown): DocumentNode {
  return (
    <fragment>
      The config seems to be entirely invalid:{" "}
      {renderConfigPropertyValue(value)}
    </fragment>
  );
}

export const StandardPersistentConfigRenderer = Object.freeze({
  async renderConfig(
    config: PersistentConfigData
  ): Promise<Result<DocumentNode>> {
    const dataResult = await config.requestConfig();
    if (
      isError(dataResult) &&
      !(dataResult.error instanceof ConfigParseError)
    ) {
      return dataResult;
    }
    const [data, errors] = dataResult.match(
      (ok) => [ok, []],
      (error) => {
        if (error instanceof ConfigParseError) {
          return [error.config, error.errors];
        } else {
          throw new TypeError(
            "We should have been able to narrow to ConfigParseError"
          );
        }
      }
    );
    if (typeof data !== "object" || data === null) {
      return Ok(renderBodgedConfig(data));
    }
    return Ok(
      <fragment>
        {config.description.schema.title ?? "Untitled Config"}
        {config.description
          .properties()
          .map((property) =>
            renderConfigProperty(
              property.name,
              config,
              data as Record<string, unknown>,
              errors
            )
          )}
      </fragment>
    );
  },
  async renderStatusOfConfigAdaptors(
    adaptors: PersistentConfigData[]
  ): Promise<Result<DocumentNode>> {},
}) satisfies PersistentConfigRenderer;
